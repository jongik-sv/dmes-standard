package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.event.RoleChangedEvent;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngRoleCopyRequest;
import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.entity.SecUserHis;
import com.dongkuk.dmes.mcm.entity.SecUserPwd;
import com.dongkuk.dmes.mcm.entity.SecUserRollHis;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CommUserMngService} 저장 묶음 특성 테스트 — saveCmUser · regCmUser · deleteCmUser · reRegCmUser ·
 * saveUserRoleGrp · saveUserRoleGrpCopy.
 *
 * <p>현재 동작을 그대로 기대값으로 고정한다. 결함처럼 보이는 동작도 지금 값으로 고정하고 주석에 "결함 의심" 으로 적었다.
 */
class CommUserMngServiceSaveTest extends CommUserMngJpaTestBase {

    static final LocalDateTime END_OF_TIME = LocalDateTime.of(9999, 12, 31, 0, 0);

    SecUser userOf(String userId) {
        return secUserRepository.findById(userId).orElse(null);
    }

    List<SecUserHis> hisOf(String userId) {
        return secUserHisRepository.findAll().stream().filter(h -> userId.equals(h.getUserId())).toList();
    }

    /** ROLL_HIS 를 "USER/ROLE_GROUP/RESP_GBN/WORKS_CODE/ROLE_GROUP_NM/INF_REQ_NO/DESCRIPTION" 문자열로. */
    List<String> rollHis() {
        return secUserRollHisRepository.findAll().stream()
                .map(h -> h.getUserId() + "/" + h.getRoleGroupId() + "/" + h.getRespGbn() + "/" + h.getWorksCode()
                        + "/" + h.getRoleGroupNm() + "/" + h.getInfReqNo() + "/" + h.getDescription())
                .toList();
    }

    List<String> rollHisDates() {
        return secUserRollHisRepository.findAll().stream().map(SecUserRollHis::getOpSumupDt).distinct().toList();
    }

    // ────────────────────────────────────────────────────────────────
    // saveCmUser — inserted
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("saveCmUser — inserted / C")
    class Insert {

        @Test
        @DisplayName("신규 사용자 + 비밀번호 행 + 이력(C/M) — USE_TP 는 행 값과 무관하게 Y, END 기본 9999-12-31 00:00")
        void insertFullRow() {
            LocalDate before = LocalDate.now();
            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(row(
                    "rowStatus", "inserted", "USER_ID", "newu", "USER_EMP_NO", "2001", "SSO_ID", "newu.sso",
                    "USER_NM", "신규", "START_ACTIVE_DATE", "2026-05-01", "DEPT_CD", "D01",
                    "USER_CATEGORY_CD", "C1", "USE_TP", "N", "EMAIL", "n@x", "TEL_NO", "02",
                    "MOBILE_TEL_NO", "010", "IN_OUT_EMP_TP", "O", "GROUP_ID1", "G1", "GROUP_ID2", "G2",
                    "GROUP_ID3", "G3", "INF_REQ_NO", "REQ-1", "DESCRIPTION", "설명"))));
            LocalDate after = LocalDate.now();

            assertThat(out).containsExactly(Map.entry("cnt_save", 1));
            SecUser u = userOf("newu");
            assertThat(u).isNotNull();
            assertThat(u.getUserEmpNo()).isEqualTo("2001");
            assertThat(u.getSsoId()).isEqualTo("newu.sso");
            assertThat(u.getUserNm()).isEqualTo("신규");
            assertThat(u.getStartActiveDate()).isEqualTo(LocalDateTime.of(2026, 5, 1, 0, 0));
            assertThat(u.getEndActiveDate()).isEqualTo(END_OF_TIME);
            assertThat(u.getDeptCd()).isEqualTo("D01");
            assertThat(u.getUserCategoryCd()).isEqualTo("C1");
            assertThat(u.getUseTp()).isEqualTo("Y");
            assertThat(u.getEmail()).isEqualTo("n@x");
            assertThat(u.getTelNo()).isEqualTo("02");
            assertThat(u.getMobileTelNo()).isEqualTo("010");
            assertThat(u.getInOutEmpTp()).isEqualTo("O");
            assertThat(u.getGroupId1()).isEqualTo("G1");
            assertThat(u.getGroupId2()).isEqualTo("G2");
            assertThat(u.getGroupId3()).isEqualTo("G3");

            SecUserPwd p = secUserPwdRepository.findById("newu").orElseThrow();
            assertThat(BCRYPT.matches(DEFAULT_PASSWORD, p.getUserEncPwd())).isTrue();
            assertThat(BCRYPT.matches("newu2001", p.getUserSsoPwd())).isTrue();

            List<SecUserHis> his = hisOf("newu");
            assertThat(his).hasSize(1);
            SecUserHis h = his.get(0);
            assertTodayBetween(LocalDate.parse(h.getActiveDt(), YYYYMMDD), before, after);
            assertThat(h.getProcType()).isEqualTo("C");
            assertThat(h.getProcCase()).isEqualTo("M");
            assertThat(h.getUserNm()).isEqualTo("신규");
            // INF_REQ_NO / DESCRIPTION 은 행에 값이 있어도 null 로 적재된다(정책 제거).
            assertThat(h.getInfReqNo()).isNull();
            assertThat(h.getDescription()).isNull();
        }

        @Test
        @DisplayName("날짜 입력 형식 — yyyyMMdd·'yyyy-MM-dd HH:mm:ss'·ISO·LocalDateTime, 해석 실패·'null'·빈 값은 기본값")
        void dateFormats() {
            LocalDateTime before = LocalDateTime.now().minusSeconds(1);
            inTx(() -> service.saveCmUser(List.of(
                    row("rowStatus", "C", "USER_ID", "d1", "START_ACTIVE_DATE", "20260601", "END_ACTIVE_DATE", "20261231"),
                    row("rowStatus", "C", "USER_ID", "d2", "START_ACTIVE_DATE", "2026-06-02 13:45:00"),
                    row("rowStatus", "C", "USER_ID", "d3", "START_ACTIVE_DATE", LocalDateTime.of(2026, 6, 3, 9, 0)),
                    row("rowStatus", "C", "USER_ID", "d4", "START_ACTIVE_DATE", "2026-06-04T08:00:00"),
                    row("rowStatus", "C", "USER_ID", "d5", "START_ACTIVE_DATE", "null", "END_ACTIVE_DATE", "garbage"),
                    row("rowStatus", "C", "USER_ID", "d6", "START_ACTIVE_DATE", "  "))));
            LocalDateTime after = LocalDateTime.now().plusSeconds(1);

            assertThat(userOf("d1").getStartActiveDate()).isEqualTo(LocalDateTime.of(2026, 6, 1, 0, 0));
            assertThat(userOf("d1").getEndActiveDate()).isEqualTo(LocalDateTime.of(2026, 12, 31, 0, 0));
            assertThat(userOf("d2").getStartActiveDate()).isEqualTo(LocalDateTime.of(2026, 6, 2, 13, 45));
            assertThat(userOf("d3").getStartActiveDate()).isEqualTo(LocalDateTime.of(2026, 6, 3, 9, 0));
            assertThat(userOf("d4").getStartActiveDate()).isEqualTo(LocalDateTime.of(2026, 6, 4, 8, 0));
            // 시작일 기본값은 그날 00:00 이 아니라 호출 시각 그대로(LocalDateTime.now())
            assertThat(userOf("d5").getStartActiveDate()).isBetween(before, after);
            assertThat(userOf("d5").getEndActiveDate()).isEqualTo(END_OF_TIME);
            assertThat(userOf("d6").getStartActiveDate()).isBetween(before, after);
        }

        @Test
        @DisplayName("사번이 없으면 SSO 비밀번호는 USER_ID 만으로 만든다")
        void insertWithoutEmpNo() {
            inTx(() -> service.saveCmUser(List.of(row("rowStatus", "inserted", "USER_ID", "noemp"))));
            SecUserPwd p = secUserPwdRepository.findById("noemp").orElseThrow();
            assertThat(BCRYPT.matches("noemp", p.getUserSsoPwd())).isTrue();
            assertThat(BCRYPT.matches(DEFAULT_PASSWORD, p.getUserEncPwd())).isTrue();
        }

        @Test
        @DisplayName("이미 있는 USER_ID 는 조용히 건너뛴다 — cnt 0, 기존 값·비밀번호·이력 그대로")
        void duplicateInsertSkipped() {
            fx.user("dup", "D01", LocalDateTime.of(2026, 1, 1, 0, 0));

            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(
                    row("rowStatus", "inserted", "USER_ID", "dup", "USER_NM", "바뀜"))));

            assertThat(out).containsExactly(Map.entry("cnt_save", 0));
            assertThat(userOf("dup").getUserNm()).isEqualTo("이름dup");
            assertThat(secUserPwdRepository.findById("dup")).isEmpty();
            assertThat(hisOf("dup")).isEmpty();
        }

        @Test
        @DisplayName("rowStatus 가 비면 !nativeeditor_status 를 본다")
        void nativeEditorStatusFallback() {
            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(
                    row("!nativeeditor_status", "inserted", "USER_ID", "nx1"),
                    row("rowStatus", " ", "!nativeeditor_status", "C", "USER_ID", "nx2"),
                    row("rowStatus", "X", "!nativeeditor_status", "inserted", "USER_ID", "nx3"))));

            assertThat(out).containsExactly(Map.entry("cnt_save", 2));
            assertThat(userOf("nx1")).isNotNull();
            assertThat(userOf("nx2")).isNotNull();
            assertThat(userOf("nx3")).isNull(); // rowStatus 가 있으면 그것만 본다
        }
    }

    // ────────────────────────────────────────────────────────────────
    // saveCmUser — updated
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("saveCmUser — updated / U")
    class Update {

        @Test
        @DisplayName("행에 없는 컬럼은 null 로 덮어쓰고(날짜는 기존값 유지), USE_TP 는 건드리지 않으며 이력은 남기지 않는다")
        void updateOverwritesAbsentKeysWithNull() {
            SecUser u = fx.user("upd", "D01", LocalDateTime.of(2026, 1, 1, 0, 0));
            u.setEndActiveDate(LocalDateTime.of(2026, 12, 31, 0, 0));
            u.setEmail("old@x");
            u.setGroupId1("G1");
            fx.user(u);

            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(row(
                    "rowStatus", "updated", "USER_ID", "upd", "USER_NM", "새이름", "EMAIL", "new@x", "USE_TP", "N"))));

            assertThat(out).containsExactly(Map.entry("cnt_save", 1));
            SecUser after = userOf("upd");
            assertThat(after.getUserNm()).isEqualTo("새이름");
            assertThat(after.getEmail()).isEqualTo("new@x");
            // 결함 의심: 행에 키가 없으면 null 로 덮는다(SecUserService 의 U 분기는 containsKey 로 거른다).
            assertThat(after.getDeptCd()).isNull();
            assertThat(after.getUserEmpNo()).isNull();
            assertThat(after.getInOutEmpTp()).isNull();
            assertThat(after.getGroupId1()).isNull();
            // 날짜는 값이 없으면 기존값
            assertThat(after.getStartActiveDate()).isEqualTo(LocalDateTime.of(2026, 1, 1, 0, 0));
            assertThat(after.getEndActiveDate()).isEqualTo(LocalDateTime.of(2026, 12, 31, 0, 0));
            // USE_TP 는 행 값과 무관하게 그대로
            assertThat(after.getUseTp()).isEqualTo("Y");
            assertThat(hisOf("upd")).isEmpty();
            assertThat(secUserPwdRepository.findById("upd")).isEmpty();
        }

        @Test
        @DisplayName("U 별칭 + 날짜 갱신, 없는 사용자는 건너뛴다(cnt 0, 새로 만들지 않음)")
        void updateAliasAndMissing() {
            fx.user("upd2", "D01", LocalDateTime.of(2026, 1, 1, 0, 0));

            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(
                    row("rowStatus", "U", "USER_ID", "upd2", "DEPT_CD", "D02",
                            "START_ACTIVE_DATE", "2026-02-01", "END_ACTIVE_DATE", "20270101"),
                    row("rowStatus", "updated", "USER_ID", "ghost", "USER_NM", "유령"))));

            assertThat(out).containsExactly(Map.entry("cnt_save", 1));
            assertThat(userOf("upd2").getDeptCd()).isEqualTo("D02");
            assertThat(userOf("upd2").getStartActiveDate()).isEqualTo(LocalDateTime.of(2026, 2, 1, 0, 0));
            assertThat(userOf("upd2").getEndActiveDate()).isEqualTo(LocalDateTime.of(2027, 1, 1, 0, 0));
            assertThat(userOf("ghost")).isNull();
        }
    }

    // ────────────────────────────────────────────────────────────────
    // saveCmUser — deleted (논리삭제)
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("saveCmUser — deleted / D (논리삭제)")
    class Delete {

        @Test
        @DisplayName("9999-12-31 은 오늘 00:00 으로 바꿔 마감, USE_TP=N, 이력(D/M) — 행은 지우지 않고 역할그룹 매핑도 그대로")
        void sentinelBecomesToday() {
            fx.user("del1", "D01", LocalDateTime.of(2026, 1, 1, 0, 0));
            fx.mapping("del1", "RG1", "RG2");

            LocalDate before = LocalDate.now();
            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(row(
                    "rowStatus", "deleted", "USER_ID", "del1", "USER_NM", "삭제됨", "END_ACTIVE_DATE", "9999-12-31",
                    "USE_TP", "Y"))));
            LocalDate after = LocalDate.now();

            assertThat(out).containsExactly(Map.entry("cnt_save", 1));
            SecUser u = userOf("del1");
            assertThat(u).isNotNull();
            assertThat(u.getEndActiveDate().toLocalTime()).isEqualTo(java.time.LocalTime.MIDNIGHT);
            assertTodayBetween(u.getEndActiveDate().toLocalDate(), before, after);
            assertThat(u.getUseTp()).isEqualTo("N");
            assertThat(u.getUserNm()).isEqualTo("이름del1"); // 행의 USER_NM 은 이력에만 들어간다

            List<SecUserHis> his = hisOf("del1");
            assertThat(his).hasSize(1);
            assertThat(his.get(0).getActiveDt()).isEqualTo(yyyymmdd(u.getEndActiveDate().toLocalDate()));
            assertThat(his.get(0).getProcType()).isEqualTo("D");
            assertThat(his.get(0).getProcCase()).isEqualTo("M");
            assertThat(his.get(0).getUserNm()).isEqualTo("삭제됨");

            assertThat(fx.roleGroupIdsOf("del1")).containsExactly("RG1", "RG2");
        }

        @Test
        @DisplayName("마감일이 주어지면 그 날짜로 마감하고 이력 ACTIVE_DT 도 그 날짜, 없으면 호출 시각으로 마감")
        void givenOrNowEndDate() {
            fx.user("del2", null, LocalDateTime.of(2026, 1, 1, 0, 0));
            fx.user("del3", null, LocalDateTime.of(2026, 1, 1, 0, 0));

            LocalDateTime before = LocalDateTime.now().minusSeconds(1);
            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(
                    row("rowStatus", "D", "USER_ID", "del2", "END_ACTIVE_DATE", "2026-12-31"),
                    row("rowStatus", "deleted", "USER_ID", "del3"))));
            LocalDateTime after = LocalDateTime.now().plusSeconds(1);

            assertThat(out).containsExactly(Map.entry("cnt_save", 2));
            assertThat(userOf("del2").getEndActiveDate()).isEqualTo(LocalDateTime.of(2026, 12, 31, 0, 0));
            assertThat(userOf("del2").getUseTp()).isEqualTo("N");
            assertThat(hisOf("del2")).extracting(SecUserHis::getActiveDt).containsExactly("20261231");
            assertThat(hisOf("del2").get(0).getUserNm()).isNull();

            // 마감일 미지정 → 00:00 이 아닌 호출 시각(LocalDateTime.now())
            assertThat(userOf("del3").getEndActiveDate()).isBetween(before, after);
            assertThat(hisOf("del3")).extracting(SecUserHis::getActiveDt)
                    .containsExactly(yyyymmdd(userOf("del3").getEndActiveDate().toLocalDate()));
        }

        @Test
        @DisplayName("없는 사용자 삭제는 cnt 0, 이력 없음")
        void missingUser() {
            Map<String, Object> out = inTx(() -> service.saveCmUser(List.of(
                    row("rowStatus", "deleted", "USER_ID", "ghost", "END_ACTIVE_DATE", "2026-12-31"))));
            assertThat(out).containsExactly(Map.entry("cnt_save", 0));
            assertThat(secUserHisRepository.findAll()).isEmpty();
        }

        @Test
        @DisplayName("같은 날 생성 후 삭제하면 이력 PK(USER_ID, ACTIVE_DT)가 같아 생성 이력이 삭제 이력으로 덮인다")
        void sameDayInsertThenDeleteOverwritesHistory() {
            inTx(() -> service.saveCmUser(List.of(row("rowStatus", "inserted", "USER_ID", "sameday", "USER_NM", "생성"))));
            inTx(() -> service.saveCmUser(List.of(row(
                    "rowStatus", "deleted", "USER_ID", "sameday", "USER_NM", "삭제", "END_ACTIVE_DATE", "9999-12-31"))));

            // 결함 의심: 이력 PK 가 날짜 단위라 같은 날 두 번째 처리가 첫 이력을 덮어쓴다.
            List<SecUserHis> his = hisOf("sameday");
            assertThat(his).hasSize(1);
            assertThat(his.get(0).getProcType()).isEqualTo("D");
            assertThat(his.get(0).getUserNm()).isEqualTo("삭제");
        }
    }

    // ────────────────────────────────────────────────────────────────
    // saveCmUser — 섞인 요청·빈 요청 / regCmUser · deleteCmUser 위임
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("saveCmUser 섞인 요청 · regCmUser · deleteCmUser")
    class Mixed {

        @Test
        @DisplayName("inserted·updated·deleted 가 섞이면 처리된 행 수만 센다 — null 행·빈 USER_ID·모르는 상태는 건너뜀")
        void mixedRequest() {
            fx.user("m_upd", "D01", LocalDateTime.of(2026, 1, 1, 0, 0));
            fx.user("m_del", "D01", LocalDateTime.of(2026, 1, 1, 0, 0));
            List<Map<String, Object>> master = new ArrayList<>(Arrays.asList(
                    null,
                    row("rowStatus", "inserted", "USER_ID", "m_new", "USER_NM", "새사람"),
                    row("rowStatus", "updated", "USER_ID", "m_upd", "USER_NM", "고친사람"),
                    row("rowStatus", "deleted", "USER_ID", "m_del", "END_ACTIVE_DATE", "2026-11-30"),
                    row("rowStatus", "X", "USER_ID", "m_upd", "USER_NM", "무시"),
                    row("rowStatus", "inserted", "USER_ID", "  "),
                    row("rowStatus", "deleted")));

            Map<String, Object> out = inTx(() -> service.saveCmUser(master));

            assertThat(out).containsExactly(Map.entry("cnt_save", 3));
            assertThat(userOf("m_new").getUserNm()).isEqualTo("새사람");
            assertThat(userOf("m_upd").getUserNm()).isEqualTo("고친사람");
            assertThat(userOf("m_del").getUseTp()).isEqualTo("N");
            assertThat(userOf("m_del").getEndActiveDate()).isEqualTo(LocalDateTime.of(2026, 11, 30, 0, 0));
            assertThat(secUserRepository.count()).isEqualTo(3);
        }

        @Test
        @DisplayName("master 가 null 이거나 비면 cnt 0")
        void emptyMaster() {
            assertThat(inTx(() -> service.saveCmUser(null))).containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.saveCmUser(List.of()))).containsExactly(Map.entry("cnt_save", 0));
        }

        @Test
        @DisplayName("regCmUser·deleteCmUser 는 saveCmUser 와 같다 — 이름과 달리 rowStatus 대로 분기한다")
        void delegates() {
            fx.user("r_del", null, LocalDateTime.of(2026, 1, 1, 0, 0));

            Map<String, Object> reg = inTx(() -> service.regCmUser(List.of(
                    row("rowStatus", "deleted", "USER_ID", "r_del", "END_ACTIVE_DATE", "2026-10-01"))));
            Map<String, Object> del = inTx(() -> service.deleteCmUser(List.of(
                    row("rowStatus", "inserted", "USER_ID", "d_new"))));

            assertThat(reg).containsExactly(Map.entry("cnt_save", 1));
            assertThat(userOf("r_del").getUseTp()).isEqualTo("N");
            assertThat(del).containsExactly(Map.entry("cnt_save", 1));
            assertThat(userOf("d_new")).isNotNull();
            assertThat(inTx(() -> service.regCmUser(null))).containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.deleteCmUser(null))).containsExactly(Map.entry("cnt_save", 0));
        }
    }

    // ────────────────────────────────────────────────────────────────
    // reRegCmUser
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("reRegCmUser")
    class ReReg {

        @Test
        @DisplayName("첫 행만 — 시작 오늘 00:00, 종료 9999-12-31, USE_TP=Y, 실패횟수 0, 비밀번호 둘 다 초기화, 이력(C/M)")
        void reRegistersFirstRowOnly() {
            SecUser u = fx.user("rr", "D01", LocalDateTime.of(2025, 1, 1, 0, 0));
            u.setUseTp("N");
            u.setEndActiveDate(LocalDateTime.of(2025, 6, 30, 0, 0));
            u.setPwdFailCount(5L);
            fx.user(u);
            SecUser other = fx.user("other", "D01", LocalDateTime.of(2025, 1, 1, 0, 0));
            other.setUseTp("N");
            fx.user(other);
            pwdWithOtherColumns("rr", "oldEnc", "oldSso");

            LocalDate before = LocalDate.now();
            Map<String, Object> out = inTx(() -> service.reRegCmUser(List.of(
                    row("USER_ID", "rr", "USER_EMP_NO", "777", "USER_NM", "재등록"),
                    row("USER_ID", "other", "USER_EMP_NO", "888"))));
            LocalDate after = LocalDate.now();

            assertThat(out).containsExactly(Map.entry("cnt_save", 1));
            SecUser rr = userOf("rr");
            assertThat(rr.getStartActiveDate().toLocalTime()).isEqualTo(java.time.LocalTime.MIDNIGHT);
            assertTodayBetween(rr.getStartActiveDate().toLocalDate(), before, after);
            assertThat(rr.getEndActiveDate()).isEqualTo(END_OF_TIME);
            assertThat(rr.getUseTp()).isEqualTo("Y");
            assertThat(rr.getPwdFailCount()).isEqualTo(0L);
            assertThat(rr.getUserEmpNo()).isEqualTo("Err"); // 행의 사번은 SSO 비밀번호에만 쓰인다

            SecUserPwd p = secUserPwdRepository.findById("rr").orElseThrow();
            assertThat(BCRYPT.matches(DEFAULT_PASSWORD, p.getUserEncPwd())).isTrue();
            assertThat(BCRYPT.matches("rr777", p.getUserSsoPwd())).isTrue();
            // 두 해시만 바꾼다 — 마지막 변경일(만료 판정 기준)·SALT·임시 비밀번호·임시 만료일은 그대로.
            assertOtherPwdColumnsKept("rr");

            List<SecUserHis> his = hisOf("rr");
            assertThat(his).hasSize(1);
            assertTodayBetween(LocalDate.parse(his.get(0).getActiveDt(), YYYYMMDD), before, after);
            assertThat(his.get(0).getProcType()).isEqualTo("C");
            assertThat(his.get(0).getProcCase()).isEqualTo("M");
            assertThat(his.get(0).getUserNm()).isEqualTo("재등록");

            // 두 번째 행은 무시
            assertThat(userOf("other").getUseTp()).isEqualTo("N");
            assertThat(secUserPwdRepository.findById("other")).isEmpty();
            assertThat(hisOf("other")).isEmpty();
        }

        @Test
        @DisplayName("비밀번호 행이 없으면 새로 만든다")
        void createsPwdRow() {
            fx.user("rr2", null, LocalDateTime.of(2025, 1, 1, 0, 0));
            assertThat(inTx(() -> service.reRegCmUser(List.of(row("USER_ID", "rr2")))))
                    .containsExactly(Map.entry("cnt_save", 1));
            SecUserPwd p = secUserPwdRepository.findById("rr2").orElseThrow();
            assertThat(BCRYPT.matches(DEFAULT_PASSWORD, p.getUserEncPwd())).isTrue();
            assertThat(BCRYPT.matches("rr2", p.getUserSsoPwd())).isTrue();
        }

        @Test
        @DisplayName("없는 사용자·빈 USER_ID·빈 요청은 cnt 0 — 비밀번호·이력도 만들지 않는다(예외 없음)")
        void noOp() {
            assertThat(inTx(() -> service.reRegCmUser(List.of(row("USER_ID", "ghost")))))
                    .containsExactly(Map.entry("cnt_save", 0));
            assertThat(secUserPwdRepository.findById("ghost")).isEmpty();
            assertThat(secUserHisRepository.findAll()).isEmpty();

            assertThat(inTx(() -> service.reRegCmUser(List.of(row("USER_ID", " ")))))
                    .containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.reRegCmUser(List.of()))).containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.reRegCmUser(null))).containsExactly(Map.entry("cnt_save", 0));
        }
    }

    // ────────────────────────────────────────────────────────────────
    // saveUserRoleGrp
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("saveUserRoleGrp")
    class SaveUserRoleGrp {

        @Test
        @DisplayName("추가·삭제 섞인 요청 — 매핑 반영, 요청 행마다 ROLL_HIS(A/D), 건드린 역할그룹의 역할로 RoleChangedEvent 1건")
        void mixedAddAndRemove() {
            fx.mapping("u1", "RG1", "RG2");
            fx.mapping("u2", "RG2", "RG3");
            fx.roleGroupRoles("RG1", "R1");
            fx.roleGroupRoles("RG2", "R2", "R1");
            fx.roleGroupRoles("RG3", "R3");
            fx.roleGroupRoles("RG_OTHER", "R9"); // 건드리지 않은 그룹의 역할은 이벤트에 안 들어간다

            LocalDate before = LocalDate.now();
            Map<String, Object> out = inTx(() -> service.saveUserRoleGrp(new ArrayList<>(Arrays.asList(
                    row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG3", "ROLE_GROUP_NM", "셋"),
                    row("rowStatus", "C", "USER_ID", "u1", "ROLE_GROUP_ID", "RG1", "ROLE_GROUP_NM", "하나"), // 이미 있음
                    row("rowStatus", "deleted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG2", "ROLE_GROUP_NM", "둘",
                            "INF_REQ_NO", "REQ", "DESCRIPTION", "설명"),
                    row("rowStatus", "D", "USER_ID", "u1", "ROLE_GROUP_ID", "RG9"),                       // 없는 매핑
                    row("rowStatus", "updated", "USER_ID", "u1", "ROLE_GROUP_ID", "RG2"),                 // 모르는 상태
                    row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", " "),                   // PK 공백
                    row("rowStatus", "inserted", "ROLE_GROUP_ID", "RG3"),                                 // USER_ID 없음
                    null))));
            LocalDate after = LocalDate.now();

            assertThat(out).containsExactly(Map.entry("cnt_save", 4));
            assertThat(fx.roleGroupIdsOf("u1")).containsExactly("RG1", "RG3");
            assertThat(fx.roleGroupIdsOf("u2")).containsExactly("RG2", "RG3"); // 다른 사용자 매핑은 그대로

            // 실제로 매핑이 바뀌지 않은 행(이미 있는 RG1 추가, 없는 RG9 삭제)도 이력은 남긴다.
            assertThat(rollHis()).containsExactlyInAnyOrder(
                    "u1/RG3/A/P/셋/null/null",
                    "u1/RG1/A/P/하나/null/null",
                    "u1/RG2/D/P/둘/null/null",
                    "u1/RG9/D/P/null/null/null");
            assertThat(rollHisDates()).hasSize(1);
            assertTodayBetween(LocalDate.parse(rollHisDates().get(0), YYYYMMDD), before, after);

            List<RoleChangedEvent> evs = events.events();
            assertThat(evs).hasSize(1);
            assertThat(evs.get(0).getRoleIds()).containsExactlyInAnyOrder("R1", "R2", "R3");
        }

        @Test
        @DisplayName("한 요청에서 같은 매핑을 추가 후 삭제하면 없어지고, 삭제 후 추가하면 남는다")
        void sameMappingAddRemoveInOneRequest() {
            fx.mapping("u1", "RG6");

            Map<String, Object> out = inTx(() -> service.saveUserRoleGrp(List.of(
                    row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG5"),
                    row("rowStatus", "deleted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG5"),
                    row("rowStatus", "deleted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG6"),
                    row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG6"))));

            assertThat(out).containsExactly(Map.entry("cnt_save", 4));
            assertThat(fx.roleGroupIdsOf("u1")).containsExactly("RG6");
            assertThat(rollHis()).containsExactlyInAnyOrder(
                    "u1/RG5/A/P/null/null/null", "u1/RG5/D/P/null/null/null",
                    "u1/RG6/D/P/null/null/null", "u1/RG6/A/P/null/null/null");
        }

        @Test
        @DisplayName("건드린 역할그룹에 역할이 없거나 처리 행이 없으면 이벤트를 발행하지 않는다")
        void noEventWhenNoRoles() {
            assertThat(inTx(() -> service.saveUserRoleGrp(List.of(
                    row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG_EMPTY")))))
                    .containsExactly(Map.entry("cnt_save", 1));
            assertThat(fx.roleGroupIdsOf("u1")).containsExactly("RG_EMPTY");
            assertThat(events.events()).isEmpty();

            assertThat(inTx(() -> service.saveUserRoleGrp(List.of(
                    row("rowStatus", "X", "USER_ID", "u1", "ROLE_GROUP_ID", "RG1")))))
                    .containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.saveUserRoleGrp(null))).containsExactly(Map.entry("cnt_save", 0));
            assertThat(events.events()).isEmpty();
        }

        @Test
        @DisplayName("같은 날 같은 매핑을 두 번 추가하면 ROLL_HIS PK 가 같아 한 행으로 덮인다")
        void sameDayRollHisOverwrite() {
            inTx(() -> service.saveUserRoleGrp(List.of(
                    row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG1", "ROLE_GROUP_NM", "처음"))));
            inTx(() -> service.saveUserRoleGrp(List.of(
                    row("rowStatus", "inserted", "USER_ID", "u1", "ROLE_GROUP_ID", "RG1", "ROLE_GROUP_NM", "두번째"))));

            assertThat(rollHis()).containsExactly("u1/RG1/A/P/두번째/null/null");
            assertThat(fx.roleGroupIdsOf("u1")).containsExactly("RG1");
        }
    }

    // ────────────────────────────────────────────────────────────────
    // saveUserRoleGrpCopy
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("saveUserRoleGrpCopy")
    class Copy {

        CommUserMngRoleCopyRequest copyReq(String userId, String userIdCopy) {
            CommUserMngRoleCopyRequest r = new CommUserMngRoleCopyRequest();
            r.setUSER_ID(userId);
            r.setUSER_ID_COPY(userIdCopy);
            r.setINF_REQ_NO("REQ");
            r.setDESCRIPTION("설명");
            return r;
        }

        @Test
        @DisplayName("원본 사용자의 역할그룹 중 대상에 없는 것만 복사 — 이력(A, 역할그룹명은 역할그룹 표에서, 없으면 null), 이벤트 1건")
        void copiesMissingOnly() {
            LocalDateTime past = LocalDateTime.of(2026, 1, 1, 0, 0);
            fx.roleGroup("RG1", "하나", "Y", past, null);
            fx.roleGroup("RG2", "둘", "Y", past, null);
            // RG3 은 역할그룹 행이 없다
            fx.mapping("src", "RG1", "RG2", "RG3");
            fx.mapping("dst", "RG2");
            fx.mapping("bystander", "RG1");
            fx.roleGroupRoles("RG1", "R1");
            fx.roleGroupRoles("RG2", "R2");
            fx.roleGroupRoles("RG3", "R3", "R1");

            Map<String, Object> out = inTx(() -> service.saveUserRoleGrpCopy(copyReq("dst", "src")));

            assertThat(out).containsExactly(Map.entry("cnt_save", 2));
            assertThat(fx.roleGroupIdsOf("dst")).containsExactly("RG1", "RG2", "RG3");
            assertThat(fx.roleGroupIdsOf("src")).containsExactly("RG1", "RG2", "RG3");
            assertThat(fx.roleGroupIdsOf("bystander")).containsExactly("RG1");
            // INF_REQ_NO / DESCRIPTION 은 요청에 있어도 null 로 적재된다.
            assertThat(rollHis()).containsExactlyInAnyOrder(
                    "dst/RG1/A/P/하나/null/null",
                    "dst/RG3/A/P/null/null/null");

            List<RoleChangedEvent> evs = events.events();
            assertThat(evs).hasSize(1);
            assertThat(evs.get(0).getRoleIds()).containsExactlyInAnyOrder("R1", "R3");
        }

        @Test
        @DisplayName("복사할 것이 없으면(같은 사용자·원본 없음) cnt 0, 이벤트 없음")
        void nothingToCopy() {
            fx.mapping("same", "RG1");
            fx.roleGroupRoles("RG1", "R1");

            assertThat(inTx(() -> service.saveUserRoleGrpCopy(copyReq("same", "same"))))
                    .containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.saveUserRoleGrpCopy(copyReq("dst", "nobody"))))
                    .containsExactly(Map.entry("cnt_save", 0));
            assertThat(events.events()).isEmpty();
            assertThat(rollHis()).isEmpty();
        }

        @Test
        @DisplayName("USER_ID·USER_ID_COPY 가 비거나 요청이 null 이면 cnt 0")
        void blankRequest() {
            fx.mapping("src", "RG1");
            assertThat(inTx(() -> service.saveUserRoleGrpCopy(copyReq(" ", "src")))).containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.saveUserRoleGrpCopy(copyReq("dst", null)))).containsExactly(Map.entry("cnt_save", 0));
            assertThat(inTx(() -> service.saveUserRoleGrpCopy(null))).containsExactly(Map.entry("cnt_save", 0));
            assertThat(fx.roleGroupIdsOf("dst")).isEmpty();
            assertThat(events.events()).isEmpty();
        }
    }
}
