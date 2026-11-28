/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng — SYSADMIN 만 할 수 있는 일(m19 권한 올리기 막기): SYSADMIN 그룹 붙이기·떼기·복사, SYSADMIN 보유자 계정 바꾸기
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngPwdInitRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngRoleCopyRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngStateRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** {@link CommUserMngService} 의 SYSADMIN_ONLY 거절(Oracle 시험 PDB). op = SYSADMIN 이 아닌 운영자(공통관리자 흉내), adm = SYSADMIN. */
class CommUserMngSysadminOnlyTest extends CommUserMngJpaTestBase {

    static final LocalDateTime START = LocalDateTime.of(2026, 1, 1, 0, 0);
    static final LocalDateTime END = LocalDateTime.of(9999, 12, 31, 0, 0);

    @Autowired DataSource dataSource;
    JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("MERGE INTO MCMAPUSER.TB_MCM_SEC_ROLE R USING DUAL ON (R.ROLE_ID = 'SYSADMIN') "
                + "WHEN NOT MATCHED THEN INSERT (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE) "
                + "VALUES ('SYSADMIN', '시스템관리자', 'Y', DATE '2026-01-01', DATE '9999-12-31')");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_SEC_ROLE SET USE_TP = 'Y', START_ACTIVE_DATE = DATE '2026-01-01', "
                + "END_ACTIVE_DATE = DATE '9999-12-31' WHERE ROLE_ID = 'SYSADMIN'");
        fx.roleGroup("G_SYS", "시스템관리자 그룹", "Y", START, END);
        fx.roleGroup("G_COMM", "공통관리자 그룹", "Y", START, END);
        fx.roleGroupRoles("G_SYS", "SYSADMIN");
        fx.roleGroupRoles("G_COMM", "R_COMM");
        fx.user("adm", null, START);
        fx.user("op", null, START);
        fx.user("u1", null, START);
        fx.mapping("adm", "G_SYS");
        fx.mapping("op", "G_COMM");
        CommUserMngJpaTestConfig.CURRENT_USER.set(null);
    }

    @AfterEach
    void tearDown() {
        CommUserMngJpaTestConfig.CURRENT_USER.set(null);
    }

    void assertOnly(Runnable r) {
        assertThatThrownBy(r::run).isInstanceOf(BusinessException.class).hasMessageStartingWith("SYSADMIN_ONLY: ");
    }

    @Test
    @DisplayName("SYSADMIN 이 아닌 op 가 자기에게 SYSADMIN 그룹을 붙이면 SYSADMIN_ONLY, 매핑 그대로. 일반 그룹은 통과")
    void selfGrantSysadminGroup_rejected() {
        CommUserMngJpaTestConfig.CURRENT_USER.set("op");
        assertOnly(() -> inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "inserted", "USER_ID", "op", "ROLE_GROUP_ID", "G_SYS")))));
        assertThat(fx.roleGroupIdsOf("op")).containsExactly("G_COMM");

        inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "G_COMM"))));
        assertThat(fx.roleGroupIdsOf("u1")).containsExactly("G_COMM");
    }

    @Test
    @DisplayName("SYSADMIN 이 아닌 op 는 남의 SYSADMIN 그룹도 떼지 못한다")
    void removeSysadminGroup_rejected() {
        fx.user("adm2", null, START);
        fx.mapping("adm2", "G_SYS");
        CommUserMngJpaTestConfig.CURRENT_USER.set("op");
        assertOnly(() -> inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "deleted", "USER_ID", "adm2", "ROLE_GROUP_ID", "G_SYS")))));
        assertThat(fx.roleGroupIdsOf("adm2")).containsExactly("G_SYS");
    }

    @Test
    @DisplayName("SYSADMIN 인 adm 은 SYSADMIN 그룹을 붙인다. 로그인 사용자가 없는 시스템 호출도 통과")
    void sysadminAndSystem_allowed() {
        CommUserMngJpaTestConfig.CURRENT_USER.set("adm");
        inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "G_SYS"))));
        assertThat(fx.roleGroupIdsOf("u1")).containsExactly("G_SYS");

        CommUserMngJpaTestConfig.CURRENT_USER.set(null);
        inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "inserted", "USER_ID", "op", "ROLE_GROUP_ID", "G_SYS"))));
        assertThat(fx.roleGroupIdsOf("op")).contains("G_SYS");
    }

    @Test
    @DisplayName("역할 그룹 복사로 SYSADMIN 그룹을 가져오면 SYSADMIN_ONLY")
    void copyFromSysadmin_rejected() {
        CommUserMngJpaTestConfig.CURRENT_USER.set("op");
        CommUserMngRoleCopyRequest r = new CommUserMngRoleCopyRequest();
        r.setUSER_ID("op");
        r.setUSER_ID_COPY("adm");
        assertOnly(() -> inTx(() -> service.saveUserRoleGrpCopy(r)));
        assertThat(fx.roleGroupIdsOf("op")).containsExactly("G_COMM");
    }

    @Test
    @DisplayName("SYSADMIN 보유자 계정 — 비밀번호 초기화·수정·삭제·정지·퇴직은 SYSADMIN 만, 일반 사용자는 op 도 된다")
    void holderAccount_rejected_plainAllowed() {
        CommUserMngJpaTestConfig.CURRENT_USER.set("op");
        CommUserMngPwdInitRequest pwd = new CommUserMngPwdInitRequest();
        pwd.setUSER_ID("adm");
        assertOnly(() -> inTx(() -> service.pwdinit(pwd, null)));
        assertOnly(() -> inTx(() -> service.saveCmUser(List.of(row("rowStatus", "updated", "USER_ID", "adm", "USER_NM", "바꿈", "EMAIL", "x@example.com")))));
        assertOnly(() -> inTx(() -> service.saveCmUser(List.of(row("rowStatus", "deleted", "USER_ID", "adm")))));
        assertOnly(() -> inTx(() -> service.suspendUser(state("adm"))));
        assertOnly(() -> inTx(() -> service.retireUser(state("adm"))));
        assertThat(secUserRepository.findById("adm")).get().satisfies(u -> {
            assertThat(u.getUseTp()).isEqualTo("Y");
            assertThat(u.getUserNm()).isNotEqualTo("바꿈");
        });

        inTx(() -> service.saveCmUser(List.of(row("rowStatus", "updated", "USER_ID", "u1", "USER_NM", "바꿈", "EMAIL", "u1@example.com"))));
        assertThat(secUserRepository.findById("u1")).get().extracting(u -> u.getUserNm()).isEqualTo("바꿈");
    }

    @Test
    @DisplayName("기간이 지난 SYSADMIN 계정도 보호 — op 의 비밀번호 초기화·다시 켜기(수정)·재등록·다시 사용 = SYSADMIN_ONLY, adm 은 통과")
    void dormantSysadminAccount_protected() {
        fx.user("old", null, START);
        fx.mapping("old", "G_SYS");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_SEC_USER SET USE_TP = 'N', END_ACTIVE_DATE = DATE '2026-02-01' WHERE USER_ID = 'old'");
        CommUserMngJpaTestConfig.CURRENT_USER.set("op");
        CommUserMngPwdInitRequest pwd = new CommUserMngPwdInitRequest();
        pwd.setUSER_ID("old");
        assertOnly(() -> inTx(() -> service.pwdinit(pwd, null)));
        assertOnly(() -> inTx(() -> service.saveCmUser(List.of(row("rowStatus", "updated", "USER_ID", "old", "USER_NM", "old",
                "USE_TP", "Y", "END_ACTIVE_DATE", "9999-12-31")))));
        assertOnly(() -> inTx(() -> service.reRegCmUser(List.of(row("USER_ID", "old", "USER_EMP_NO", "E9")))));
        assertOnly(() -> inTx(() -> service.resumeUser(state("old"))));
        assertThat(secUserRepository.findById("old")).get().extracting(u -> u.getUseTp()).isEqualTo("N");

        CommUserMngJpaTestConfig.CURRENT_USER.set("adm");
        inTx(() -> service.pwdinit(pwd, null));
    }

    @Test
    @DisplayName("dbViewer 퍼미션 역할이 든 그룹의 계정도 보호 — op 의 비밀번호 초기화 = SYSADMIN_ONLY, 그 그룹 붙이기도 SYSADMIN_ONLY")
    void dbViewerGroupAccount_protected() {
        jdbc.update("MERGE INTO MCMAPUSER.TB_MCM_SEC_OBJ O USING DUAL ON (O.OBJECT_ID = 'dbViewer') WHEN NOT MATCHED THEN "
                + "INSERT (OBJECT_ID, OBJECT_NM, SYSTEM_CODE, USE_TP, BTN_PERM) VALUES ('dbViewer', 'DB 뷰어', 'mcm', 'Y', 'query')");
        jdbc.update("MERGE INTO MCMAPUSER.TB_MCM_SEC_ROLE R USING DUAL ON (R.ROLE_ID = 'R_DB') WHEN NOT MATCHED THEN "
                + "INSERT (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE) VALUES ('R_DB', 'DB', 'Y', DATE '2026-01-01', DATE '9999-12-31')");
        jdbc.update("MERGE INTO MCMAPUSER.TB_MCM_SEC_ROLE_PERM P USING DUAL ON (P.ROLE_ID = 'R_DB' AND P.OBJECT_ID = 'dbViewer') WHEN NOT MATCHED THEN "
                + "INSERT (ROLE_ID, OBJECT_ID, BTN_PERM) VALUES ('R_DB', 'dbViewer', 'query')");
        try {
            fx.roleGroup("G_DB", "DB 그룹", "Y", START, END);
            fx.roleGroupRoles("G_DB", "R_DB");
            fx.mapping("u1", "G_DB");
            CommUserMngJpaTestConfig.CURRENT_USER.set("op");
            CommUserMngPwdInitRequest pwd = new CommUserMngPwdInitRequest();
            pwd.setUSER_ID("u1");
            assertOnly(() -> inTx(() -> service.pwdinit(pwd, null)));
            assertOnly(() -> inTx(() -> service.saveUserRoleGrp(List.of(row("rowStatus", "inserted", "USER_ID", "op", "ROLE_GROUP_ID", "G_DB")))));
        } finally {
            jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_ROLE_PERM WHERE ROLE_ID = 'R_DB'");
        }
    }

    static CommUserMngStateRequest state(String userId) {
        CommUserMngStateRequest r = new CommUserMngStateRequest();
        r.setUSER_ID(userId);
        r.setREASON("시험");
        return r;
    }
}
