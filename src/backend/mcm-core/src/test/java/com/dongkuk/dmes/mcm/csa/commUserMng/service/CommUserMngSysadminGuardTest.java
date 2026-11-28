/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng 저장 — 같은 날 재부여 이력 생성자 보존(perm-crudfix c3)·본인 잠금·마지막 시스템관리자 막기(c5 a·b)·동시 저장
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.audit.SecurityIdentityHolder;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link CommUserMngService} 저장의 c3·c5 a·b 시험(Oracle 시험 PDB). */
class CommUserMngSysadminGuardTest extends CommUserMngJpaTestBase {

    static final LocalDateTime START = LocalDateTime.of(2026, 1, 1, 0, 0);
    static final LocalDateTime END = LocalDateTime.of(9999, 12, 31, 0, 0);

    @Autowired DataSource dataSource;

    JdbcTemplate jdbc;
    SecurityIdentity savedHolder;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        // 잠금 대상 SYSADMIN 역할 행(없으면 넣는다 — 이 컨텍스트의 clearAll 은 역할 표를 비우지 않는다)
        jdbc.update("MERGE INTO MCMAPUSER.TB_MCM_SEC_ROLE R USING DUAL ON (R.ROLE_ID = 'SYSADMIN') "
                + "WHEN NOT MATCHED THEN INSERT (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE) "
                + "VALUES ('SYSADMIN', '시스템관리자', 'Y', DATE '2026-01-01', DATE '9999-12-31')");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_SEC_ROLE SET USE_TP = 'Y', START_ACTIVE_DATE = DATE '2026-01-01', "
                + "END_ACTIVE_DATE = DATE '9999-12-31' WHERE ROLE_ID = 'SYSADMIN'");
        fx.roleGroup("G_SYS", "시스템관리자 그룹", "Y", START, END);
        fx.roleGroup("G_OTHER", "일반 그룹", "Y", START, END);
        fx.roleGroupRoles("G_SYS", "SYSADMIN");
        fx.roleGroupRoles("G_OTHER", "R_PLAIN");
        savedHolder = SecurityIdentityHolder.get();
        CommUserMngJpaTestConfig.CURRENT_USER.set(null);
    }

    @AfterEach
    void tearDown() {
        CommUserMngJpaTestConfig.CURRENT_USER.set(null);
        SecurityIdentityHolder.set(savedHolder);
    }

    SecUser userOf(String id) {
        return secUserRepository.findById(id).orElse(null);
    }

    // ── c3 ──

    @Test
    @DisplayName("c3: 같은 날 같은 그룹을 빼고 다시 주면 'A' 이력 행의 C_USR_ID·C_AT 는 첫 부여 값, U_USR_ID 는 다시 준 사람")
    void sameDayRegrant_keepsCreator() {
        fx.user("u1", null, START);
        SecurityIdentityHolder.set(identity("tester1"));
        inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "G_OTHER"))));
        SecUserRollHis first = onlyHis("A");
        assertThat(first.getCreatedBy()).isEqualTo("tester1");
        assertThat(first.getCreatedAt()).isNotNull();

        SecurityIdentityHolder.set(identity("tester2"));
        inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "deleted", "USER_ID", "u1", "ROLE_GROUP_ID", "G_OTHER"))));
        inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "G_OTHER"))));

        SecUserRollHis again = onlyHis("A");
        assertThat(again.getCreatedBy()).isEqualTo("tester1");
        assertThat(again.getCreatedAt()).isEqualTo(first.getCreatedAt());
        assertThat(again.getUpdatedBy()).isEqualTo("tester2");
        assertThat(again.getVersion()).isGreaterThan(first.getVersion());
    }

    SecUserRollHis onlyHis(String respGbn) {
        List<SecUserRollHis> rows = secUserRollHisRepository.findAll().stream()
                .filter(h -> respGbn.equals(h.getRespGbn())).toList();
        assertThat(rows).hasSize(1);
        return rows.get(0);
    }

    // ── c5 a ──

    @Test
    @DisplayName("c5 a: 로그인한 본인 계정 삭제 = SELF_LOCKOUT, 아무것도 안 바뀜")
    void selfDelete_rejected() {
        fx.user("me", null, START);
        CommUserMngJpaTestConfig.CURRENT_USER.set("me");

        assertThatThrownBy(() -> inTx(() -> service.saveCmUser(List.of(row("rowStatus", "deleted", "USER_ID", "me")))))
                .isInstanceOf(BusinessException.class).hasMessageStartingWith("SELF_LOCKOUT: ");
        assertThat(userOf("me").getUseTp()).isEqualTo("Y");
    }

    @Test
    @DisplayName("c5 a: 본인 유효 기한일을 어제로 고치면 SELF_LOCKOUT, 오늘은 허용(끝 날 포함)")
    void selfEndInPast_rejected_todayAllowed() {
        fx.user("me", null, START);
        CommUserMngJpaTestConfig.CURRENT_USER.set("me");
        String yesterday = LocalDate.now().minusDays(1).toString();
        String today = LocalDate.now().toString();

        assertThatThrownBy(() -> inTx(() -> service.saveCmUser(List.of(
                row("rowStatus", "updated", "USER_ID", "me", "USER_NM", "나", "END_ACTIVE_DATE", yesterday)))))
                .hasMessageStartingWith("SELF_LOCKOUT: ");
        assertThat(userOf("me").getEndActiveDate()).isEqualTo(END);

        inTx(() -> service.saveCmUser(List.of(
                row("rowStatus", "updated", "USER_ID", "me", "USER_NM", "나", "END_ACTIVE_DATE", today))));
        assertThat(userOf("me").getEndActiveDate().toLocalDate()).isEqualTo(LocalDate.now());
    }

    // ── c5 b ──

    @Test
    @DisplayName("c5 b: 활성 SYSADMIN 보유자 1명을 삭제 = LAST_SYSADMIN, 계정 그대로")
    void deleteLastSysadmin_rejected() {
        fx.user("adm", null, START);
        fx.user("me", null, START);
        fx.mapping("adm", "G_SYS");
        CommUserMngJpaTestConfig.CURRENT_USER.set("me");

        assertThatThrownBy(() -> inTx(() -> service.saveCmUser(List.of(row("rowStatus", "deleted", "USER_ID", "adm")))))
                .hasMessageStartingWith("LAST_SYSADMIN: ").satisfies(e -> assertThat(e.getMessage()).doesNotContain("adm")); // 보유자 ID 는 응답에 안 싣는다
        assertThat(userOf("adm").getUseTp()).isEqualTo("Y");
    }

    @Test
    @DisplayName("c5 b: 마지막 보유자에게서 SYSADMIN 그룹 빼기 = LAST_SYSADMIN, 매핑 남음. 다른 그룹 빼기는 통과")
    void removeLastSysadminGroup_rejected_otherGroupAllowed() {
        fx.user("adm", null, START);
        fx.mapping("adm", "G_SYS", "G_OTHER");

        assertThatThrownBy(() -> inTx(() -> service.saveUserRoleGrp(List.of(
                row("rowStatus", "deleted", "USER_ID", "adm", "ROLE_GROUP_ID", "G_SYS")))))
                .hasMessageStartingWith("LAST_SYSADMIN: ");
        assertThat(fx.roleGroupIdsOf("adm")).contains("G_SYS");

        inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "deleted", "USER_ID", "adm", "ROLE_GROUP_ID", "G_OTHER"))));
        assertThat(fx.roleGroupIdsOf("adm")).containsExactly("G_SYS");
    }

    @Test
    @DisplayName("c5 b: 보유자가 2명이면 한 명 삭제는 통과, 본인 SYSADMIN 빼기는 SELF_LOCKOUT")
    void twoHolders_oneDeleteAllowed_selfRemovalRejected() {
        fx.user("adm1", null, START);
        fx.user("adm2", null, START);
        fx.mapping("adm1", "G_SYS");
        fx.mapping("adm2", "G_SYS");
        CommUserMngJpaTestConfig.CURRENT_USER.set("adm1");

        assertThatThrownBy(() -> inTx(() -> service.saveUserRoleGrp(List.of(
                row("rowStatus", "deleted", "USER_ID", "adm1", "ROLE_GROUP_ID", "G_SYS")))))
                .hasMessageStartingWith("SELF_LOCKOUT: ");

        inTx(() -> service.saveCmUser(List.of(row("rowStatus", "deleted", "USER_ID", "adm2"))));
        assertThat(userOf("adm2").getUseTp()).isEqualTo("N");
    }

    @Test
    @DisplayName("c5 b: SYSADMIN 역할 행이 없으면(잠글 행 없음) 보유자를 줄이는 저장은 막고, 다른 저장은 통과(fail closed)")
    void noSysadminRoleRow_reductionRejected_otherSaveAllowed() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = 'SYSADMIN'");
        fx.user("adm1", null, START);
        fx.user("adm2", null, START);
        fx.mapping("adm1", "G_SYS");
        fx.mapping("adm2", "G_SYS");

        assertThatThrownBy(() -> inTx(() -> service.saveUserRoleGrp(List.of(
                row("rowStatus", "deleted", "USER_ID", "adm2", "ROLE_GROUP_ID", "G_SYS")))))
                .hasMessageStartingWith("LAST_SYSADMIN: ").hasMessageContaining("(SYSADMIN) 역할 행이 없어");
        inTx(() -> service.saveCmUser(List.of(row("rowStatus", "updated", "USER_ID", "adm2", "USER_NM", "새 이름"))));
        assertThat(userOf("adm2").getUserNm()).isEqualTo("새 이름");
    }

    @Test
    @DisplayName("c5 b: 보유자 2명을 두 관리자가 동시에 하나씩 빼면 하나만 성공하고 다른 하나는 LAST_SYSADMIN(잠금으로 줄 세움)")
    void concurrentRemovals_oneRejected() throws Exception {
        fx.user("adm1", null, START);
        fx.user("adm2", null, START);
        fx.mapping("adm1", "G_SYS");
        fx.mapping("adm2", "G_SYS");

        CountDownLatch firstWrote = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        List<Throwable> errors = Collections.synchronizedList(new ArrayList<>());
        try {
            Future<?> first = pool.submit(() -> {
                try {
                    tx.execute(st -> {
                        service.saveUserRoleGrp(List.of(row("rowStatus", "deleted", "USER_ID", "adm1", "ROLE_GROUP_ID", "G_SYS")));
                        firstWrote.countDown();
                        try {
                            releaseFirst.await(8, TimeUnit.SECONDS); // 잠금을 쥔 채 커밋 전 대기
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                        }
                        return null;
                    });
                } catch (Throwable t) {
                    errors.add(t);
                    firstWrote.countDown();
                }
            });
            assertThat(firstWrote.await(10, TimeUnit.SECONDS)).isTrue();
            CountDownLatch secondCalling = new CountDownLatch(1);
            Future<?> second = pool.submit(() -> {
                try {
                    secondCalling.countDown();
                    inTx(() -> service.saveUserRoleGrp(List.of(
                            row("rowStatus", "deleted", "USER_ID", "adm2", "ROLE_GROUP_ID", "G_SYS"))));
                } catch (Throwable t) {
                    errors.add(t);
                }
            });
            assertThat(secondCalling.await(10, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(2000); // 둘째가 SYSADMIN 잠금에서 기다리게 둔다(WAIT 10 안)
            assertThat(second.isDone()).as("둘째 저장은 첫째 커밋까지 기다린다").isFalse();
            long released = System.nanoTime();
            releaseFirst.countDown();
            first.get(15, TimeUnit.SECONDS);
            second.get(15, TimeUnit.SECONDS);
            // 둘째는 첫째가 놓은 뒤에야 끝난다(잠금으로 줄 섬)
            assertThat(System.nanoTime()).isGreaterThan(released);
        } finally {
            releaseFirst.countDown();
            pool.shutdownNow();
        }

        assertThat(errors).singleElement().isInstanceOfSatisfying(BusinessException.class,
                e -> assertThat(e.getMessage()).startsWith("LAST_SYSADMIN: "));
        assertThat(fx.roleGroupIdsOf("adm1")).isEmpty();
        assertThat(fx.roleGroupIdsOf("adm2")).containsExactly("G_SYS");
    }

    static SecurityIdentity identity(String userId) {
        return new SecurityIdentity() {
            @Override public String currentUserId() { return userId; }
            @Override public boolean hasAuthority(String authority) { return false; }
        };
    }
}
