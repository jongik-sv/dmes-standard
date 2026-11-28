/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng searchRetirePreview·searchActiveUserLov 시험 — 퇴직 미리 보기 건수·받을 사람 후보(Oracle 시험 PDB)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchUserLovRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngStateRequest;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.security.account.AccountState;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 퇴직 미리 보기(searchRetirePreview)·받을 사람 찾기(searchActiveUserLov). */
class CommUserMngRetirePreviewTest extends CommUserMngJpaTestBase {

    static final LocalDateTime START = LocalDateTime.of(2026, 1, 1, 0, 0);

    @Autowired DataSource dataSource;

    JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
    }

    static CommUserMngStateRequest req(String userId) {
        CommUserMngStateRequest r = new CommUserMngStateRequest();
        r.setUSER_ID(userId);
        return r;
    }

    static CommUserMngSearchUserLovRequest lov(String keyword) {
        CommUserMngSearchUserLovRequest r = new CommUserMngSearchUserLovRequest();
        r.setKeyword(keyword);
        return r;
    }

    List<String> lovIds(Map<String, Object> out) {
        return grid(out, "ds_userLov").stream().map(r -> String.valueOf(r.get("USER_ID"))).toList();
    }

    @Nested
    @DisplayName("퇴직 미리 보기")
    class Preview {

        @Test
        @DisplayName("역할그룹·사용자 쿼리 배정 건수를 retire 와 같은 값으로 세고 아무것도 바꾸지 않는다")
        void counts() {
            LocalDateTime end = LocalDateTime.of(9999, 12, 31, 0, 0);
            fx.roleGroup("G_A", "일반 그룹", "Y", START, end);
            fx.roleGroup("G_B", "보조 그룹", "Y", START, end);
            fx.user("pv", null, START);
            fx.mapping("pv", "G_A", "G_B");
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID, VER) VALUES ('Q1', 'pv', 0)");
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID, VER) VALUES ('Q2', 'pv', 0)");
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID, VER) VALUES ('Q3', 'pv', 0)");

            Map<String, Object> out = inTx(() -> service.searchRetirePreview(req("pv")));

            // 시험 구성은 MDM 주소가 없다 → 담당 데이터 0건(오류 아님), ERD 작업 중 표시 0
            assertThat(out).containsEntry("ROLE_GROUP_CNT", 2).containsEntry("ASSIGN_CNT", 3)
                    .containsEntry("CLAIM_CNT", 0L).doesNotContainKey("OWNED_ERROR").doesNotContainKey("cnt_save");
            assertThat(grid(out, "ds_owned")).isEmpty();
            assertThat(fx.roleGroupIdsOf("pv")).containsExactlyInAnyOrder("G_A", "G_B");
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN WHERE USER_ID = 'pv'",
                    Integer.class)).isEqualTo(3);
            assertThat(secUserRepository.findById("pv").orElseThrow().getUseTp()).isEqualTo("Y");
        }

        @Test
        @DisplayName("역할그룹·배정이 없으면 0")
        void empty() {
            fx.user("pv0", null, START);
            Map<String, Object> out = inTx(() -> service.searchRetirePreview(req("pv0")));
            assertThat(out).containsEntry("ROLE_GROUP_CNT", 0).containsEntry("ASSIGN_CNT", 0);
        }

        @Test
        @DisplayName("없는 사용자면 업무 예외")
        void unknown() {
            assertThatThrownBy(() -> inTx(() -> service.searchRetirePreview(req("nobody"))))
                    .isInstanceOf(BusinessException.class);
        }
    }

    @Nested
    @DisplayName("받을 사람 찾기")
    class ActiveUserLov {

        @Test
        @DisplayName("상태 활성·잠금만 — 비활성·인사 휴직·퇴직·기한 밖·시작 전은 빠진다, ds_mainAll 없음")
        void onlyActiveOrLocked() {
            LocalDate today = LocalDate.now();
            fx.user("a_act", null, START);
            SecUser locked = fx.user("a_lock", null, START);
            locked.setLockYn("Y");
            fx.user(locked);
            SecUser off = fx.user("a_off", null, START);
            off.setUseTp("N");
            fx.user(off);
            SecUser leave = fx.user("a_leave", null, START);
            leave.setHrSt(AccountState.HR_LEAVE);
            fx.user(leave);
            SecUser hrOut = fx.user("a_hrout", null, START);
            hrOut.setHrSt(AccountState.HR_RETIRED);
            fx.user(hrOut);
            SecUser hrIn = fx.user("a_hrin", null, START);
            hrIn.setHrSt(AccountState.HR_ACTIVE);
            fx.user(hrIn);
            SecUser expired = fx.user("a_exp", null, START);
            expired.setEndActiveDate(today.minusDays(1).atStartOfDay());
            fx.user(expired);
            SecUser lastDay = fx.user("a_last", null, START);
            lastDay.setEndActiveDate(today.atStartOfDay());
            fx.user(lastDay);
            SecUser future = fx.user("a_future", null, today.plusDays(1).atStartOfDay());
            fx.user(future);
            SecUser startsToday = fx.user("a_today", null, today.atTime(9, 0));
            fx.user(startsToday);

            Map<String, Object> out = inTx(() -> service.searchActiveUserLov(lov("a_")));

            assertThat(lovIds(out)).containsExactly("a_act", "a_hrin", "a_last", "a_lock", "a_today");
            assertThat(out).containsEntry("LOV_TRUNCATED", "N").doesNotContainKey("ds_mainAll");
            Map<String, Object> lockRow = grid(out, "ds_userLov").stream()
                    .filter(r -> "a_lock".equals(r.get("USER_ID"))).findFirst().orElseThrow();
            assertThat(lockRow).containsEntry("USER_ST", "LOCKED").containsEntry("USER_ST_NM", "잠금")
                    .containsEntry("USER_NM", "이름a_lock").containsEntry("USER_EMP_NO", "Ea_lock");
        }

        @Test
        @DisplayName("USER_ID·사번·이름 앞부분 일치(대소문자 무시) — 가운데 글자는 맞지 않는다, 부서명 붙음")
        void prefixMatch() {
            fx.dept("D1", "생산팀", "Y");
            SecUser kim = fx.user("kim01", "D1", START);
            kim.setUserEmpNo("20261234");
            kim.setUserNm("김철수");
            fx.user(kim);
            SecUser lee = fx.user("lee02", null, START);
            lee.setUserEmpNo("20269999");
            lee.setUserNm("이영희");
            fx.user(lee);

            assertThat(lovIds(inTx(() -> service.searchActiveUserLov(lov("KIM"))))).containsExactly("kim01");
            assertThat(lovIds(inTx(() -> service.searchActiveUserLov(lov("2026"))))).containsExactly("kim01", "lee02");
            assertThat(lovIds(inTx(() -> service.searchActiveUserLov(lov("이영"))))).containsExactly("lee02");
            assertThat(lovIds(inTx(() -> service.searchActiveUserLov(lov("철수"))))).isEmpty();
            assertThat(lovIds(inTx(() -> service.searchActiveUserLov(lov("  "))))).containsExactly("kim01", "lee02");
            assertThat(grid(inTx(() -> service.searchActiveUserLov(lov("kim"))), "ds_userLov").get(0))
                    .containsEntry("DEPT_CD", "D1").containsEntry("DEPT_NM", "생산팀");
        }

        @Test
        @DisplayName("상한 200 — 넘으면 앞 200명(USER_ID 순)과 LOV_TRUNCATED=Y, 거른 뒤에 센다")
        void limit() {
            for (int i = 0; i < 201; i++) {
                fx.user(String.format("u%03d", i), null, START);
            }
            // 걸러질 사람이 앞에 있어도 활성 후보 200명을 채운다
            SecUser off = fx.user("u000x", null, START);
            off.setUseTp("N");
            fx.user(off);

            Map<String, Object> out = inTx(() -> service.searchActiveUserLov(lov("u")));

            List<String> ids = lovIds(out);
            assertThat(ids).hasSize(CommUserMngQueryService.ACTIVE_USER_LOV_LIMIT).doesNotContain("u000x");
            assertThat(ids.get(0)).isEqualTo("u000");
            assertThat(ids.get(199)).isEqualTo("u199");
            assertThat(out).containsEntry("LOV_TRUNCATED", "Y");

            assertThat(inTx(() -> service.searchActiveUserLov(lov("u20")))).containsEntry("LOV_TRUNCATED", "N");
        }
    }
}
