/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng 계정 상태 action·ERP 인사 연동·상태 조회 시험 — 시안 「사용자 비활성화·퇴직 처리」(Oracle 시험 PDB)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngStateRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.CommUserMngJpaTestConfig;
import com.dongkuk.dmes.mcm.entity.SecHrEvt;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserHis;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.repository.SecHrEvtRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 계정 상태(잠금 해제·비활성·다시 사용·퇴직·인계)·인사 연동·목록 상태 칸. */
class CommUserMngLifecycleTest extends CommUserMngJpaTestBase {

    static final LocalDateTime START = LocalDateTime.of(2026, 1, 1, 0, 0);
    static final LocalDateTime END = LocalDateTime.of(9999, 12, 31, 0, 0);

    @Autowired DataSource dataSource;
    @Autowired CommUserMngHrService hrService;
    @Autowired SecHrEvtRepository hrEvtRepository;

    JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("MERGE INTO MCMAPUSER.TB_MCM_SEC_ROLE R USING DUAL ON (R.ROLE_ID = 'SYSADMIN') "
                + "WHEN NOT MATCHED THEN INSERT (ROLE_ID, ROLE_NM, USE_TP, START_ACTIVE_DATE, END_ACTIVE_DATE) "
                + "VALUES ('SYSADMIN', '시스템관리자', 'Y', DATE '2026-01-01', DATE '9999-12-31')");
        fx.roleGroup("G_SYS", "시스템관리자 그룹", "Y", START, END);
        fx.roleGroup("G_A", "일반 그룹", "Y", START, END);
        fx.roleGroupRoles("G_SYS", "SYSADMIN");
        fx.roleGroupRoles("G_A", "R_PLAIN");
        CommUserMngJpaTestConfig.CURRENT_USER.set("boss");
    }

    @AfterEach
    void tearDown() {
        CommUserMngJpaTestConfig.CURRENT_USER.set(null);
    }

    static CommUserMngStateRequest req(String userId, String reason, String to) {
        CommUserMngStateRequest r = new CommUserMngStateRequest();
        r.setUSER_ID(userId);
        r.setREASON(reason);
        r.setTO_USER_ID(to);
        return r;
    }

    SecUser userOf(String id) {
        return secUserRepository.findById(id).orElse(null);
    }

    List<SecUserHis> hisOf(String userId) {
        return secUserHisRepository.findAll().stream().filter(h -> userId.equals(h.getUserId()))
                .sorted(Comparator.comparing(SecUserHis::getActiveDt).thenComparing(SecUserHis::getHisSeq)).toList();
    }

    /** 다른 SYSADMIN 한 명(마지막 SYSADMIN 가드가 막지 않게). */
    void anotherSysadmin() {
        fx.user("boss", null, START);
        fx.mapping("boss", "G_SYS");
    }

    void assertBiz(Runnable r, String codePrefix) {
        assertThatThrownBy(r::run).isInstanceOf(BusinessException.class).hasMessageStartingWith(codePrefix);
    }

    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("잠금 해제 · 비활성 · 다시 사용")
    class States {

        @Test
        @DisplayName("잠금 해제 — LOCK_YN=N·실패·연속 잠금 0, 비밀번호 그대로, 이력 L")
        void unlock() {
            SecUser u = fx.user("lk", null, START);
            u.setLockYn("Y");
            u.setLockCnt(2L);
            u.setPwdFailCount(5L);
            u.setLockAt(LocalDateTime.now());
            fx.user(u);
            fx.pwd("lk", "keepEnc", "keepSso");

            inTx(() -> service.unlockUser(req("lk", null, null)));

            SecUser r = userOf("lk");
            assertThat(r.getLockYn()).isEqualTo("N");
            assertThat(r.getLockCnt()).isZero();
            assertThat(r.getPwdFailCount()).isZero();
            assertThat(secUserPwdRepository.findById("lk").orElseThrow().getUserEncPwd()).isEqualTo("keepEnc");
            assertThat(hisOf("lk")).extracting(SecUserHis::getProcType).containsExactly("L");
            assertBiz(() -> inTx(() -> service.unlockUser(req("lk", null, null))), "NOT_LOCKED");
        }

        @Test
        @DisplayName("비활성 — USE_TP=N, 역할 유지, 이력 S 「비활성: 사유」. 사유 없으면 거절, 본인은 SELF_LOCKOUT")
        void suspend() {
            fx.user("su", null, START);
            fx.mapping("su", "G_A");

            assertThatThrownBy(() -> inTx(() -> service.suspendUser(req("su", " ", null))))
                    .isInstanceOf(BusinessException.class);
            inTx(() -> service.suspendUser(req("su", "장기 출장", null)));

            assertThat(userOf("su").getUseTp()).isEqualTo("N");
            assertThat(fx.roleGroupIdsOf("su")).containsExactly("G_A");
            assertThat(hisOf("su")).extracting(SecUserHis::getDescription).containsExactly("비활성: 장기 출장");

            fx.user("boss", null, START);
            assertBiz(() -> inTx(() -> service.suspendUser(req("boss", "보안 점검", null))), "SELF_LOCKOUT");
        }

        @Test
        @DisplayName("다시 사용 — 관리자 비활성만 푼다. 인사 휴직은 남는다(HR_LEAVE_REMAINS=Y)")
        void resume() {
            SecUser u = fx.user("rs", null, START);
            u.setUseTp("N");
            u.setHrSt("LEAVE");
            fx.user(u);

            Map<String, Object> out = inTx(() -> service.resumeUser(req("rs", null, null)));

            assertThat(out).containsEntry("HR_LEAVE_REMAINS", "Y");
            assertThat(userOf("rs").getUseTp()).isEqualTo("Y");
            assertThat(userOf("rs").getHrSt()).isEqualTo("LEAVE");
            assertBiz(() -> inTx(() -> service.resumeUser(req("rs", null, null))), "HR_LEAVE");
        }

        @Test
        @DisplayName("마지막 SYSADMIN 비활성 — LAST_SYSADMIN 으로 거절, 아무것도 바뀌지 않는다")
        void lastSysadmin() {
            fx.user("sa", null, START);
            fx.mapping("sa", "G_SYS");

            assertBiz(() -> inTx(() -> service.suspendUser(req("sa", "보안 점검", null))), "LAST_SYSADMIN");
            assertThat(userOf("sa").getUseTp()).isEqualTo("Y");
        }
    }

    @Nested
    @DisplayName("퇴직 · 인계")
    class Retire {

        @Test
        @DisplayName("퇴직 — 기한일 오늘·USE_TP=N·역할 회수·쿼리 배정 해제·이력 R, 받을 사람 없으면 인계 대기")
        void retireWithoutReceiver() {
            fx.user("rt", null, START);
            fx.mapping("rt", "G_A");
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID, VER) VALUES ('Q1', 'rt', 0)");

            Map<String, Object> out = inTx(() -> service.retireUser(req("rt", "퇴직", null)));

            assertThat(out).containsEntry("cnt_save", 1).containsEntry("ROLE_GROUP_CNT", 1)
                    .containsEntry("ASSIGN_CNT", 1).containsEntry("HANDOVER_ST", "PENDING");
            SecUser r = userOf("rt");
            assertThat(r.getUseTp()).isEqualTo("N");
            assertThat(r.getEndActiveDate()).isEqualTo(LocalDate.now().atStartOfDay());
            assertThat(fx.roleGroupIdsOf("rt")).isEmpty();
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN WHERE USER_ID = 'rt'",
                    Integer.class)).isZero();
            assertThat(hisOf("rt")).extracting(SecUserHis::getProcType).containsExactly("R");
            assertThat(hisOf("rt").get(0).getDescription()).isEqualTo("퇴직: 퇴직 · 인계 대기");
            assertBiz(() -> inTx(() -> service.retireUser(req("rt", "퇴직", null))), "ALREADY_RETIRED");
        }

        @Test
        @DisplayName("받을 사람이 있으면 인계 — MDM 에 넘기고 HANDOVER_ST=DONE(시험은 MDM 주소 없음 = 넘길 것 없음)")
        void retireWithReceiver() {
            SecUser from = fx.user("rf", null, START);
            from.setUserEmpNo("E100");
            fx.user(from);
            SecUser to = fx.user("rto", null, START);
            to.setUserEmpNo("E200");
            fx.user(to);

            Map<String, Object> out = inTx(() -> service.retireUser(req("rf", "계약 종료", "rto")));

            assertThat(out).containsEntry("HANDOVER_ST", "DONE");
            assertThat(hisOf("rf").get(0).getDescription()).contains("인계: rto");
        }

        @Test
        @DisplayName("받을 사람이 퇴직자 본인·비활성이면 거절")
        void badReceiver() {
            fx.user("rb", null, START);
            SecUser off = fx.user("off", null, START);
            off.setUseTp("N");
            fx.user(off);
            assertThatThrownBy(() -> inTx(() -> service.retireUser(req("rb", "퇴직", "rb")))).isInstanceOf(BusinessException.class);
            assertThatThrownBy(() -> inTx(() -> service.retireUser(req("rb", "퇴직", "off")))).isInstanceOf(BusinessException.class);
            assertThat(userOf("rb").getUseTp()).isEqualTo("Y");
        }
    }

    @Nested
    @DisplayName("ERP 인사 연동")
    class Hr {

        void evt(String id, String emp, String tp, String dt, String dept) {
            inTx(() -> hrService.receive(List.of(row("EVT_ID", id, "EMP_NO", emp, "EVT_TP", tp, "EVT_DT", dt,
                    "DEPT_CD", dept, "USER_NM", "인사이름"))));
        }

        String today() {
            return yyyymmdd(LocalDate.now());
        }

        String st(String id) {
            return hrEvtRepository.findById(id).map(SecHrEvt::getProcSt).orElse(null);
        }

        SecUser emp(String id, String empNo, String inOut) {
            SecUser u = fx.user(id, "D01", START);
            u.setUserEmpNo(empNo);
            u.setInOutEmpTp(inOut);
            return fx.user(u);
        }

        @Test
        @DisplayName("휴직 → 비활성(HR_ST=LEAVE), 같은 휴직 두 번째는 SKIP, 복직 → ACTIVE. 관리자 비활성은 남는다")
        void leaveAndReturn() {
            emp("h1", "1001", "I");
            evt("E1", "1001", "LEAVE", today(), null);
            evt("E2", "1001", "LEAVE", today(), null);
            inTx(() -> hrService.processPending());
            assertThat(st("E1")).isEqualTo("DONE");
            assertThat(st("E2")).isEqualTo("SKIP");
            assertThat(userOf("h1").getHrSt()).isEqualTo("LEAVE");

            jdbc.update("UPDATE MCMAPUSER.TB_MCM_SEC_USER SET USE_TP = 'N' WHERE USER_ID = 'h1'");
            evt("E3", "1001", "RETURN", today(), null);
            inTx(() -> hrService.processPending());
            assertThat(st("E3")).isEqualTo("DONE");
            assertThat(userOf("h1").getHrSt()).isEqualTo("ACTIVE");
            assertThat(userOf("h1").getUseTp()).isEqualTo("N");
            assertThat(hisOf("h1")).extracting(SecUserHis::getProcCase).containsOnly("H");
        }

        @Test
        @DisplayName("퇴직 → 역할 회수·HR_ST=RETIRED. 외부(O) 계정은 SKIP, 사번 없음은 FAIL, 발령일 전은 WAIT")
        void retireAndRules() {
            emp("h2", "2002", "I");
            fx.mapping("h2", "G_A");
            emp("h3", "3003", "O");
            evt("R1", "2002", "RETIRE", today(), null);
            evt("R2", "3003", "RETIRE", today(), null);
            evt("R3", "9999", "RETIRE", today(), null);
            evt("R4", "2002", "MOVE", yyyymmdd(LocalDate.now().plusDays(3)), "D02");
            inTx(() -> hrService.processPending());

            assertThat(st("R1")).isEqualTo("DONE");
            assertThat(userOf("h2").getHrSt()).isEqualTo("RETIRED");
            assertThat(userOf("h2").getUseTp()).isEqualTo("N");
            assertThat(fx.roleGroupIdsOf("h2")).isEmpty();
            assertThat(st("R2")).isEqualTo("SKIP");
            assertThat(userOf("h3").getHrSt()).isNull();
            assertThat(st("R3")).isEqualTo("FAIL");
            assertThat(st("R4")).isEqualTo("WAIT");
        }

        @Test
        @DisplayName("마지막 SYSADMIN 의 인사 퇴직 — 로그인만 막고(HR_ST=RETIRED) 역할은 남긴 채 FAIL")
        void lastSysadminRetire() {
            emp("hs", "5005", "I");
            fx.mapping("hs", "G_SYS");
            evt("S1", "5005", "RETIRE", today(), null);
            inTx(() -> hrService.processPending());

            assertThat(st("S1")).isEqualTo("FAIL");
            assertThat(hrEvtRepository.findById("S1").orElseThrow().getProcMsg()).startsWith("LAST_SYSADMIN");
            assertThat(userOf("hs").getHrSt()).isEqualTo("RETIRED");
            assertThat(fx.roleGroupIdsOf("hs")).containsExactly("G_SYS");
        }

        @Test
        @DisplayName("입사 — 계정이 없으면 HOLD, 관리자가 아이디를 정해 만들면 임시 비밀번호(7일)·HR_ST=ACTIVE·DONE")
        void hireHoldAndCreate() {
            evt("H1", "7007", "HIRE", today(), "D01");
            inTx(() -> hrService.processPending());
            assertThat(st("H1")).isEqualTo("HOLD");

            Map<String, Object> out = inTx(() -> hrService.createAccount("H1", "newbie"));

            assertThat(out).containsEntry("USER_ID", "newbie").containsEntry("INIT_PWD", DEFAULT_PASSWORD);
            SecUser u = userOf("newbie");
            assertThat(u.getUserEmpNo()).isEqualTo("7007");
            assertThat(u.getHrSt()).isEqualTo("ACTIVE");
            assertThat(fx.roleGroupIdsOf("newbie")).isEmpty();
            assertTempPwdState("newbie", true, false);
            assertThat(st("H1")).isEqualTo("DONE");
        }

        @Test
        @DisplayName("부서 이동 — DEPT_CD 를 바꾸고 역할그룹은 그대로")
        void move() {
            emp("hm", "8008", "I");
            fx.mapping("hm", "G_A");
            evt("M1", "8008", "MOVE", today(), "D09");
            inTx(() -> hrService.processPending());
            assertThat(st("M1")).isEqualTo("DONE");
            assertThat(userOf("hm").getDeptCd()).isEqualTo("D09");
            assertThat(fx.roleGroupIdsOf("hm")).containsExactly("G_A");
        }
    }

    @Nested
    @DisplayName("목록 상태 칸·필터")
    class Search {

        CommUserMngSearchRequest search(String st, String manage, String temp) {
            CommUserMngSearchRequest r = new CommUserMngSearchRequest();
            r.setCboUSERST(st);
            r.setCboMANAGETP(manage);
            r.setChkPWDTEMP(temp);
            return r;
        }

        @Test
        @DisplayName("상태 칸 — 잠금·비활성(사유)·퇴직·수동 관리·비밀번호 미변경, 상태·관리·미변경 필터")
        void stateColumnsAndFilters() {
            SecUser lk = fx.user("s_lock", null, START);
            lk.setLockYn("Y");
            fx.user(lk);
            fx.user("s_susp", null, START);
            inTx(() -> service.suspendUser(req("s_susp", "보안 점검", null)));
            SecUser ext = fx.user("s_ext", null, START);
            ext.setInOutEmpTp("O");
            fx.user(ext);
            inTx(() -> service.saveCmUser(List.of(row("rowStatus", "inserted", "USER_ID", "s_new"))));

            Map<String, Object> all = inTx(() -> service.searchCmUser(search(null, null, null)));
            Map<String, Map<String, Object>> byId = new java.util.HashMap<>();
            for (Map<String, Object> r : grid(all, "ds_main")) byId.put((String) r.get("USER_ID"), r);
            assertThat(byId.get("s_lock")).containsEntry("USER_ST", "LOCKED").containsEntry("LOCK_YN", "Y");
            assertThat(byId.get("s_susp")).containsEntry("USER_ST", "SUSPENDED");
            assertThat((String) byId.get("s_susp").get("ST_RSN")).startsWith("비활성: 보안 점검");
            assertThat(byId.get("s_ext")).containsEntry("MANAGE_TP", "MANUAL");
            assertThat(byId.get("s_new")).containsEntry("PWD_TEMP_YN", "Y");

            assertThat(grid(inTx(() -> service.searchCmUser(search("LOCKED", null, null))), "ds_main"))
                    .extracting(r -> r.get("USER_ID")).containsExactly("s_lock");
            assertThat(grid(inTx(() -> service.searchCmUser(search(null, "MANUAL", null))), "ds_main"))
                    .extracting(r -> r.get("USER_ID")).containsExactly("s_ext");
            assertThat(grid(inTx(() -> service.searchCmUser(search(null, null, "Y"))), "ds_main"))
                    .extracting(r -> r.get("USER_ID")).containsExactly("s_new");
        }

        @Test
        @DisplayName("신규 계정의 비밀번호 행 — 임시 상태와 INIT 이력")
        void newUserTempPwd() {
            inTx(() -> service.saveCmUser(List.of(row("rowStatus", "inserted", "USER_ID", "t_new", "USER_EMP_NO", "1"))));
            SecUserPwd p = secUserPwdRepository.findById("t_new").orElseThrow();
            assertThat(BCRYPT.matches(DEFAULT_PASSWORD, p.getUserEncPwd())).isTrue();
            assertTempPwdState("t_new", true, false);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_SEC_USER_PWD_HIS "
                    + "WHERE USER_ID = 't_new' AND CHG_TP = 'INIT'", Integer.class)).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("SYSADMIN 의 유효 기한일을 미래로 줄여 그날 뒤 0명이 되면 거절(D15)")
    void sysadminFutureEnd() {
        fx.user("sa2", null, START);
        fx.mapping("sa2", "G_SYS");
        CommUserMngJpaTestConfig.CURRENT_USER.set("other");
        String d = LocalDate.now().plusDays(10).toString();
        assertBiz(() -> inTx(() -> service.saveCmUser(List.of(row(
                "rowStatus", "updated", "USER_ID", "sa2", "END_ACTIVE_DATE", d)))), "LAST_SYSADMIN");
        anotherSysadmin();
        assertThat(inTx(() -> service.saveCmUser(List.of(row(
                "rowStatus", "updated", "USER_ID", "sa2", "END_ACTIVE_DATE", d))))).containsEntry("cnt_save", 1);
    }
}
