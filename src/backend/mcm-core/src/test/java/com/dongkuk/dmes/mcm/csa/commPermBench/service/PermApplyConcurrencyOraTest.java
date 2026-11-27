/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench apply Oracle 시험 — 동시 적용(범위 겹침·사람 범위·SYSADMIN 경합·겹치지 않음·잠금 대기 초과), 잃는 사람 확인 롤백, no-op, 실제 쓰기·이력·초안 삭제
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.csa.commPermBench.dto.CommPermBenchApplyRequest;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.PermApplyRepository;
import com.dongkuk.dmes.mcm.csa.commPermBench.repository.PermScopeRowRepository;
import com.dongkuk.dmes.mcm.repository.SecObjRepository;
import com.dongkuk.dmes.mcm.repository.SecPermDraftRepository;
import com.dongkuk.dmes.mcm.repository.SecPermHisDtlRepository;
import com.dongkuk.dmes.mcm.repository.SecPermHisRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleGroupRepository;
import com.dongkuk.dmes.mcm.repository.SecRolePermRepository;
import com.dongkuk.dmes.mcm.repository.SecRoleRepository;
import com.dongkuk.dmes.mcm.repository.SecUserMappingRepository;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import com.dongkuk.dmes.mcm.security.perm.ImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.PermChange;
import com.dongkuk.dmes.mcm.security.perm.PermGraphLoader;
import com.dongkuk.dmes.mcm.security.perm.PermResolver;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultImpactCalculator;
import com.dongkuk.dmes.mcm.security.perm.impl.DefaultPermResolver;
import com.dongkuk.dmes.mcm.security.perm.load.V2PermGraphLoader;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 동시 적용 Oracle 시험(perm-bench b4, BPMN설계서 §2.5·§4.3).
 *
 * <p>구성 — 운영 빈과 같은 저장소({@link PermApplyRepository}·{@link PermScopeRowRepository}·{@link DefaultPermChangeLookup})와
 * 실제 그래프 로더 {@link V2PermGraphLoader}, JPA 저장소를 올리고, 적용 한 번을 운영 OASIS 처럼 {@link TransactionTemplate} 한
 * 트랜잭션으로 감싼다. 로그인 사용자는 스레드마다 다르다(관리자 둘).
 *
 * <p>「잡고 있기」 = 한 관리자의 적용 본문을 마친 뒤 커밋 전에 멈춰 잠금을 쥔 채 둔다. 잠금 대기는 5초(WAIT 5)이므로
 * 다른 쪽이 막혔는지 2초 보고 곧바로 놓는다(대기 초과 시험만 일부러 6초 넘게 쥔다).
 *
 * <p>데이터는 {@code T_B4_} 접두로 JDBC 로 넣고 앞·뒤에서 외래 키 순서대로 지운다. 확인도 {@code T_B4_} 행만 본다.
 * SYSADMIN 역할 행이 없으면 넣고 끝에 지운다. 풀은 4(관리자 둘이 연결을 하나씩 쥔 채 기다린다).
 */
@SpringJUnitConfig(PermApplyConcurrencyOraTest.OraConfig.class)
class PermApplyConcurrencyOraTest {

    static final String R1 = "T_B4_R1";
    static final String R2 = "T_B4_R2";
    static final String O1 = "T_B4_O1";
    static final String O2 = "T_B4_O2";
    static final String G1 = "T_B4_G1";
    static final String G2 = "T_B4_G2";
    static final String GSYS = "T_B4_GSYS";
    static final String U1 = "T_B4_U1";
    static final String ADMIN_A = "T_B4_ADMIN_A";
    static final String ADMIN_B = "T_B4_ADMIN_B";
    static final String SYSADMIN = "SYSADMIN";

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final ThreadLocal<String> CURRENT = new ThreadLocal<>();
    private static final List<Object> EVENTS = new CopyOnWriteArrayList<>();

    @Autowired PermApplyService service;
    @Autowired PermDraftFingerprint fingerprint;
    @Autowired TransactionTemplate tx;
    @Autowired JdbcTemplate jdbc;

    private boolean insertedSysadmin;
    private ExecutorService pool;

    @BeforeEach
    void setUp() {
        clean();
        EVENTS.clear();
        pool = Executors.newFixedThreadPool(2);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USE_TP) VALUES (?, 'Y')", U1);
        for (String g : List.of(G1, G2)) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES (?, ?, 'Y')", g, g);
        }
        for (String r : List.of(R1, R2)) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP) VALUES (?, ?, 'Y')", r, r);
        }
        for (String o : List.of(O1, O2)) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_OBJ (OBJECT_ID, OBJECT_NM, USE_TP, BTN_PERM, POPUP_PERM) "
                    + "VALUES (?, ?, 'Y', 'find,save,delete', 'pop1')", o, o);
        }
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE_PERM (ROLE_ID, OBJECT_ID, BTN_PERM, DATA_PERM) VALUES (?, ?, 'find', 'D1')", R1, O1);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES (?, ?)", G1, R1);
    }

    @AfterEach
    void tearDown() {
        pool.shutdownNow();
        clean();
        if (insertedSysadmin) {
            jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = ?", SYSADMIN);
        }
        CURRENT.remove();
    }

    private void clean() {
        String like = " LIKE 'T\\_B4\\_%' ESCAPE '\\'";
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS_DTL WHERE APPLY_ID IN "
                + "(SELECT APPLY_ID FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS WHERE APPLY_USER_ID" + like + ")");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS WHERE APPLY_USER_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_PERM_DRAFT WHERE OWNER_USER_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING WHERE USER_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP WHERE ROLE_GROUP_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID" + like);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_OBJ WHERE OBJECT_ID" + like);
    }

    // ────────────────────────────────────────────────────────────────
    // 도우미
    // ────────────────────────────────────────────────────────────────

    /** saveDraft 와 같은 모양의 초안 행(기준 지문 = 지금 DB 값). */
    private void draft(String owner, PermChange... changes) throws Exception {
        List<PermChange> list = List.of(changes);
        String base = tx.execute(s -> PermDraftFingerprint.toJson(
                fingerprint.extend(Map.of(), PermDraftFingerprint.scopeKeys(list))));
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_PERM_DRAFT (OWNER_USER_ID, DRAFT_JSON, BASE_FP_JSON, CHANGE_CNT) VALUES (?, ?, ?, ?)",
                owner, JSON.writeValueAsString(list), base, list.size());
    }

    private static CommPermBenchApplyRequest req(String confirmLoss, String memo) {
        CommPermBenchApplyRequest r = new CommPermBenchApplyRequest();
        r.setConfirmLoss(confirmLoss);
        r.setMemo(memo);
        return r;
    }

    private List<Map<String, Object>> applyAs(String admin, String confirmLoss) {
        CURRENT.set(admin);
        try {
            return tx.execute(s -> service.apply(req(confirmLoss, admin)));
        } finally {
            CURRENT.remove();
        }
    }

    private CompletableFuture<List<Map<String, Object>>> applyAsync(String admin) {
        return CompletableFuture.supplyAsync(() -> applyAs(admin, "Y"), pool);
    }

    /** 적용 본문을 마치고 커밋 전에 멈춘 적용. release 를 내리면 커밋한다. */
    record Held(CompletableFuture<List<Map<String, Object>>> done, CountDownLatch release) {
    }

    private Held applyAndHold(String admin) throws InterruptedException {
        CountDownLatch applied = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CompletableFuture<List<Map<String, Object>>> done = CompletableFuture.supplyAsync(() -> {
            CURRENT.set(admin);
            try {
                return tx.execute(s -> {
                    List<Map<String, Object>> out = service.apply(req("Y", admin));
                    applied.countDown();
                    try {
                        if (!release.await(60, TimeUnit.SECONDS)) throw new IllegalStateException("release 시간 초과");
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        throw new IllegalStateException(e);
                    }
                    return out;
                });
            } finally {
                applied.countDown();
                CURRENT.remove();
            }
        }, pool);
        assertThat(applied.await(60, TimeUnit.SECONDS)).as(admin + " 가 적용 본문을 마쳤다(커밋 전)").isTrue();
        assertThat(done).as(admin + " 는 커밋 전에 멈춰 있다").isNotDone();
        return new Held(done, release);
    }

    private static void assertBlocked(CompletableFuture<?> f) {
        assertThatThrownBy(() -> f.get(2, TimeUnit.SECONDS)).as("잠금에서 기다린다").isInstanceOf(TimeoutException.class);
    }

    private static void assertFailsWith(CompletableFuture<?> f, String message) {
        assertThatThrownBy(() -> f.get(60, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class)
                .cause().isInstanceOf(BusinessException.class)
                .hasMessage(message);
    }

    private String btnOf(String role, String obj) {
        List<String> v = jdbc.queryForList("SELECT BTN_PERM FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = ? AND OBJECT_ID = ?",
                String.class, role, obj);
        return v.isEmpty() ? null : v.get(0);
    }

    private int count(String sql, Object... args) {
        Integer n = jdbc.queryForObject(sql, Integer.class, args);
        return n == null ? 0 : n;
    }

    private int hisCount(String admin) {
        return count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS WHERE APPLY_USER_ID = ?", admin);
    }

    private int draftCount(String admin) {
        return count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_PERM_DRAFT WHERE OWNER_USER_ID = ?", admin);
    }

    private int userGroupCount(String user, String group) {
        return count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_USER_MAPPING WHERE USER_ID = ? AND ROLE_GROUP_ID = ?", user, group);
    }

    // ────────────────────────────────────────────────────────────────
    // 동시 적용
    // ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("겹치는 역할 범위: A 가 커밋할 때까지 B 는 기다리고, 깨어나면 지문이 달라 PERM_CONFLICT(role 범위)")
    void concurrentOverlapConflicts() throws Exception {
        draft(ADMIN_A, PermChange.roleObj(R1, O1, PermChange.UPD, "find,save", ""));
        draft(ADMIN_B, PermChange.roleObj(R1, O1, PermChange.UPD, "find,delete", ""));

        Held a = applyAndHold(ADMIN_A);
        assertThat(EVENTS).as("커밋 전에는 이벤트 없음").isEmpty();
        CompletableFuture<List<Map<String, Object>>> b = applyAsync(ADMIN_B);
        assertBlocked(b);
        a.release().countDown();
        assertThat(a.done().get(60, TimeUnit.SECONDS).get(0)).containsEntry("CHANGE_CNT", 1);
        assertFailsWith(b, "PERM_CONFLICT: role:" + R1);

        assertThat(btnOf(R1, O1)).isEqualTo("find,save");
        assertThat(jdbc.queryForObject("SELECT DATA_PERM FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = ? AND OBJECT_ID = ?",
                String.class, R1, O1)).isEqualTo("D1");
        assertThat(hisCount(ADMIN_A)).isEqualTo(1);
        assertThat(hisCount(ADMIN_B)).isZero();
        assertThat(draftCount(ADMIN_A)).isZero();
        assertThat(draftCount(ADMIN_B)).isEqualTo(1);
        assertThat(EVENTS).singleElement().isInstanceOfSatisfying(RoleChangedEvent.class,
                e -> assertThat(e.getRoleIds()).containsExactly(R1));
    }

    @Test
    @DisplayName("겹치는 사람 범위: 그룹은 달라도 같은 사람이면 TB_MCM_SEC_USER 행에서 기다리고 늦은 쪽이 PERM_CONFLICT(user 범위)")
    void concurrentUserScope() throws Exception {
        draft(ADMIN_A, PermChange.link(PermChange.USER_GRP, U1, G1, PermChange.ADD));
        draft(ADMIN_B, PermChange.link(PermChange.USER_GRP, U1, G2, PermChange.ADD));

        Held a = applyAndHold(ADMIN_A);
        CompletableFuture<List<Map<String, Object>>> b = applyAsync(ADMIN_B);
        assertBlocked(b);
        a.release().countDown();
        a.done().get(60, TimeUnit.SECONDS);
        assertFailsWith(b, "PERM_CONFLICT: user:" + U1);

        assertThat(userGroupCount(U1, G1)).isEqualTo(1);
        assertThat(userGroupCount(U1, G2)).isZero();
        assertThat(draftCount(ADMIN_B)).isEqualTo(1);
    }

    @Test
    @DisplayName("M1: B(SYSADMIN)가 그룹 G 에 SYSADMIN 을 붙이는 동안 A 의 「사람 → G」는 group:G 잠금에서 기다렸다가 PERM_FORBIDDEN")
    void sysadminRaceForbidden() throws Exception {
        insertedSysadmin = count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE WHERE ROLE_ID = ?", SYSADMIN) == 0;
        if (insertedSysadmin) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLE (ROLE_ID, ROLE_NM, USE_TP) VALUES (?, ?, 'Y')", SYSADMIN, SYSADMIN);
        }
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP (ROLE_GROUP_ID, ROLE_GROUP_NM, USE_TP) VALUES (?, ?, 'Y')", GSYS, GSYS);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING (ROLE_GROUP_ID, ROLE_ID) VALUES (?, ?)", GSYS, SYSADMIN);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", ADMIN_B, GSYS);

        draft(ADMIN_B, PermChange.link(PermChange.GRP_ROLE, G1, SYSADMIN, PermChange.ADD));
        draft(ADMIN_A, PermChange.link(PermChange.USER_GRP, U1, G1, PermChange.ADD));

        Held b = applyAndHold(ADMIN_B);
        CompletableFuture<List<Map<String, Object>>> a = applyAsync(ADMIN_A);
        assertBlocked(a);
        b.release().countDown();
        b.done().get(60, TimeUnit.SECONDS);
        assertThatThrownBy(() -> a.get(60, TimeUnit.SECONDS))
                .isInstanceOf(ExecutionException.class)
                .cause().isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("PERM_FORBIDDEN: " + G1 + " ");

        assertThat(count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID = ? AND ROLE_ID = ?",
                G1, SYSADMIN)).isEqualTo(1);
        assertThat(userGroupCount(U1, G1)).isZero();
        assertThat(draftCount(ADMIN_A)).isEqualTo(1);
        assertThat(EVENTS).singleElement().isInstanceOfSatisfying(RoleChangedEvent.class,
                e -> assertThat(e.getRoleIds()).containsExactly(SYSADMIN));
    }

    @Test
    @DisplayName("겹치지 않는 범위: A 가 잠금을 쥐고 있어도 B 는 기다리지 않고 끝나며, 둘 다 성공")
    void disjointBothSucceed() throws Exception {
        draft(ADMIN_A, PermChange.roleObj(R1, O1, PermChange.UPD, "find,save", ""));
        draft(ADMIN_B, PermChange.roleObj(R2, O2, PermChange.ADD, "find", ""));

        Held a = applyAndHold(ADMIN_A);
        List<Map<String, Object>> bOut = applyAsync(ADMIN_B).get(30, TimeUnit.SECONDS); // A 가 쥔 채로 끝난다
        assertThat(bOut.get(0)).containsEntry("CHANGE_CNT", 1);
        a.release().countDown();
        assertThat(a.done().get(60, TimeUnit.SECONDS).get(0)).containsEntry("CHANGE_CNT", 1);

        assertThat(btnOf(R1, O1)).isEqualTo("find,save");
        assertThat(btnOf(R2, O2)).isEqualTo("find");
        assertThat(hisCount(ADMIN_A)).isEqualTo(1);
        assertThat(hisCount(ADMIN_B)).isEqualTo(1);
        assertThat(EVENTS).hasSize(2);
    }

    @Test
    @DisplayName("잠금 대기 5초 초과(ORA-30006) = PERM_BUSY: 다른 적용이 진행 중입니다, 쓰기 없음")
    void lockWaitTimeoutBusy() throws Exception {
        draft(ADMIN_A, PermChange.roleObj(R1, O1, PermChange.UPD, "find,save", ""));
        draft(ADMIN_B, PermChange.roleObj(R1, O1, PermChange.UPD, "find,delete", ""));

        Held a = applyAndHold(ADMIN_A);
        try {
            assertFailsWith(applyAsync(ADMIN_B), "PERM_BUSY: 다른 적용이 진행 중입니다");
        } finally {
            a.release().countDown();
        }
        a.done().get(60, TimeUnit.SECONDS);
        assertThat(btnOf(R1, O1)).isEqualTo("find,save");
        assertThat(hisCount(ADMIN_B)).isZero();
        assertThat(draftCount(ADMIN_B)).isEqualTo(1);
    }

    // ────────────────────────────────────────────────────────────────
    // 한 관리자
    // ────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("잃는 사람이 있고 confirmLoss=N 이면 PERM_NEED_CONFIRM: 1, 전부 롤백(값·초안·이력·이벤트)")
    void needConfirmRollsBack() throws Exception {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", U1, G1);
        draft(ADMIN_A, PermChange.roleObj(R1, O1, PermChange.UPD, "save", ""), // U1 이 find 를 잃는다
                PermChange.link(PermChange.GRP_ROLE, G2, R2, PermChange.ADD));
        assertThatThrownBy(() -> applyAs(ADMIN_A, "N")).isInstanceOf(BusinessException.class).hasMessage("PERM_NEED_CONFIRM: 1");

        assertThat(btnOf(R1, O1)).isEqualTo("find");
        assertThat(count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID = ?", G2)).isZero();
        assertThat(draftCount(ADMIN_A)).isEqualTo(1);
        assertThat(hisCount(ADMIN_A)).isZero();
        assertThat(EVENTS).isEmpty();

        List<Map<String, Object>> out = applyAs(ADMIN_A, "Y");
        assertThat(out.get(0)).containsEntry("CHANGE_CNT", 2);
        assertThat(jdbc.queryForObject("SELECT LOSE_USER_CNT FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS WHERE APPLY_USER_ID = ?",
                Integer.class, ADMIN_A)).isEqualTo(1);
    }

    @Test
    @DisplayName("모두 no-op(이미 있는 연결 ADD·없는 퍼미션 DEL) = 머리 CHANGE_CNT 0·줄 없음·초안 삭제·이벤트 없음")
    void allNoOps() throws Exception {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER_MAPPING (USER_ID, ROLE_GROUP_ID) VALUES (?, ?)", U1, G1);
        draft(ADMIN_A, PermChange.link(PermChange.USER_GRP, U1, G1, PermChange.ADD),
                PermChange.link(PermChange.GRP_ROLE, G2, R2, PermChange.DEL),
                PermChange.roleObj(R2, O1, PermChange.DEL, null, null));
        List<Map<String, Object>> out = applyAs(ADMIN_A, "N");
        String applyId = (String) out.get(0).get("APPLY_ID");
        assertThat(out.get(0)).containsEntry("CHANGE_CNT", 0);
        assertThat(jdbc.queryForObject("SELECT CHANGE_CNT FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS WHERE APPLY_ID = ?",
                Integer.class, applyId)).isZero();
        assertThat(count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS_DTL WHERE APPLY_ID = ?", applyId)).isZero();
        assertThat(draftCount(ADMIN_A)).isZero();
        assertThat(EVENTS).isEmpty();
    }

    @Test
    @DisplayName("Oracle 쓰기: 연결 넣기·빼기, 퍼미션 넣기·빼기, 이력 머리·줄, 초안 삭제 — 한 트랜잭션, 커밋 뒤 이벤트")
    void appliesAllKinds() throws Exception {
        draft(ADMIN_A,
                PermChange.link(PermChange.USER_GRP, U1, G1, PermChange.ADD),
                PermChange.link(PermChange.GRP_ROLE, G1, R1, PermChange.DEL),
                PermChange.link(PermChange.GRP_ROLE, G1, R2, PermChange.ADD),
                PermChange.roleObj(R2, O1, PermChange.ADD, "find,save", "pop1"),
                PermChange.roleObj(R1, O1, PermChange.DEL, null, null));
        List<Map<String, Object>> out = applyAs(ADMIN_A, "Y");
        String applyId = (String) out.get(0).get("APPLY_ID");
        assertThat(applyId).hasSize(22).startsWith("PA");
        assertThat(out.get(0)).containsEntry("CHANGE_CNT", 5);

        assertThat(userGroupCount(U1, G1)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT ROLE_ID FROM MCMAPUSER.TB_MCM_SEC_ROLEGROUP_MAPPING WHERE ROLE_GROUP_ID = ?", String.class, G1))
                .containsExactly(R2);
        assertThat(btnOf(R2, O1)).isEqualTo("find,save");
        assertThat(count("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = ?", R1)).isZero();
        assertThat(draftCount(ADMIN_A)).isZero();

        Map<String, Object> his = jdbc.queryForMap("SELECT APPLY_USER_ID, CHANGE_CNT, APPLY_MEMO FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS WHERE APPLY_ID = ?", applyId);
        assertThat(his.get("APPLY_USER_ID")).isEqualTo(ADMIN_A);
        assertThat(((Number) his.get("CHANGE_CNT")).intValue()).isEqualTo(5);
        assertThat(his.get("APPLY_MEMO")).isEqualTo(ADMIN_A);
        List<Map<String, Object>> dtl = jdbc.queryForList("SELECT SEQ_NO, TARGET_TP, OP_TP, BEFORE_VAL, AFTER_VAL "
                + "FROM MCMAPUSER.TB_MCM_SEC_PERM_HIS_DTL WHERE APPLY_ID = ? ORDER BY SEQ_NO", applyId);
        assertThat(dtl).extracting(r -> r.get("TARGET_TP") + "/" + r.get("OP_TP") + "/" + r.get("BEFORE_VAL") + "/" + r.get("AFTER_VAL"))
                .containsExactly("USER_GRP/ADD/N/Y", "GRP_ROLE/DEL/Y/N", "GRP_ROLE/ADD/N/Y",
                        "ROLE_OBJ/ADD/null/BTN=find,save|POPUP=pop1", "ROLE_OBJ/DEL/BTN=find|POPUP=/null");
        // GRP_ROLE KEY2(R1·R2) ∪ ROLE_OBJ KEY1(R2·R1) ∪ USER_GRP 그룹 G1 의 역할(전 R1, 후 R2)
        assertThat(EVENTS).singleElement().isInstanceOfSatisfying(RoleChangedEvent.class,
                e -> assertThat(e.getRoleIds()).containsExactly(R1, R2));
    }

    // ────────────────────────────────────────────────────────────────

    @Configuration
    @EnableTransactionManagement
    @EnableJpaRepositories(
            basePackageClasses = SecUserMappingRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = {
                    SecUserMappingRepository.class, SecRoleGroupMappingRepository.class, SecRolePermRepository.class,
                    SecPermHisRepository.class, SecPermHisDtlRepository.class, SecPermDraftRepository.class,
                    SecObjRepository.class, SecUserRepository.class, SecRoleGroupRepository.class, SecRoleRepository.class
            }))
    static class OraConfig {

        @Bean
        DataSource dataSource() {
            HikariDataSource ds = McmCoreOraTestDb.appDataSource("perm-apply-b4");
            ds.setMaximumPoolSize(4); // 관리자 둘이 하나씩 쥐고, 확인 조회가 하나 더 쓴다
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            return McmCoreOraTestDb.entityManagerFactory(dataSource, "com.dongkuk.dmes.mcm.entity");
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        TransactionTemplate transactionTemplate(PlatformTransactionManager tm) {
            return new TransactionTemplate(tm);
        }

        @Bean
        JdbcTemplate jdbcTemplate(DataSource dataSource) {
            return new JdbcTemplate(dataSource);
        }

        @Bean
        SecurityIdentity securityIdentity() {
            return new SecurityIdentity() {
                @Override public String currentUserId() { return CURRENT.get(); }
                @Override public boolean hasAuthority(String authority) { return false; }
            };
        }

        @Bean PermScopeRowRepository permScopeRowRepository() { return new PermScopeRowRepository(); }

        @Bean
        PermApplyRepository permApplyRepository(SecUserMappingRepository ug, SecRoleGroupMappingRepository gr,
                                                SecRolePermRepository rp, SecPermHisRepository his) {
            return new PermApplyRepository(ug, gr, rp, his);
        }

        @Bean
        PermDraftFingerprint permDraftFingerprint(PermScopeRowRepository rows) {
            return new PermDraftFingerprint(rows);
        }

        @Bean
        DefaultPermChangeLookup permChangeLookup(SecObjRepository objects, SecRoleGroupMappingRepository groupRoles,
                                                 SecUserMappingRepository userGroups, SecurityIdentity identity,
                                                 SecUserRepository users, SecRoleGroupRepository groups, SecRoleRepository roles) {
            return new DefaultPermChangeLookup(objects, groupRoles, userGroups, identity, users, groups, roles);
        }

        @Bean
        PermChangeValidator permChangeValidator(DefaultPermChangeLookup lookup) {
            return new PermChangeValidator(lookup);
        }

        /** 운영 v2 로더(TB_MCM_SEC_ROLE_PERM·TB_MCM_SEC_OBJ). */
        @Bean PermGraphLoader permGraphLoader() { return new V2PermGraphLoader(); }

        @Bean PermResolver permResolver() { return new DefaultPermResolver(); }

        @Bean ImpactCalculator impactCalculator() { return new DefaultImpactCalculator(); }

        @Bean
        PermApplyService permApplyService(SecPermDraftRepository drafts, PermApplyRepository store,
                                          PermChangeValidator validator, PermDraftFingerprint fp,
                                          ObjectProvider<PermGraphLoader> loaders, ObjectProvider<PermResolver> resolvers,
                                          ObjectProvider<ImpactCalculator> calculators, SecurityIdentity identity) {
            ApplicationEventPublisher events = EVENTS::add;
            return new PermApplyService(drafts, store, validator, fp, loaders, resolvers, calculators, identity, events);
        }
    }
}
