package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngDeptRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchDeptLovRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngUserIdRequest;
import com.dongkuk.dmes.mcm.entity.SecUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CommUserMngService} 조회 묶음 특성 테스트 — searchCmUser · searchUserRoleGrp · searchRoleGrp · commonUserDept · searchDeptLov.
 *
 * <p>현재 동작을 그대로 기대값으로 고정한다. 다음 단계에서 searchCmUser 의 부서명 조회를 findAllById 로 바꿔도
 * 이 테스트가 그대로 통과해야 한다.
 */
class CommUserMngServiceSearchTest extends CommUserMngJpaTestBase {

    static LocalDateTime day(int month, int dayOfMonth) {
        return LocalDateTime.of(2026, month, dayOfMonth, 0, 0);
    }

    static CommUserMngSearchRequest searchReq(String userKey, String useTp, String inOut) {
        CommUserMngSearchRequest r = new CommUserMngSearchRequest();
        r.setEdtUSERID(userKey);
        r.setCboUSETP(useTp);
        r.setCboINOUTEMPTP(inOut);
        return r;
    }

    static CommUserMngUserIdRequest userIdReq(String userId) {
        CommUserMngUserIdRequest r = new CommUserMngUserIdRequest();
        r.setUSER_ID(userId);
        return r;
    }

    static List<Object> col(List<Map<String, Object>> rows, String key) {
        return rows.stream().map(r -> r.get(key)).toList();
    }

    // ────────────────────────────────────────────────────────────────
    // searchCmUser
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("searchCmUser")
    class SearchCmUser {

        @Test
        @DisplayName("부서명 부착 — null·공백 부서는 null, 없는 부서는 null, 비활성(USE_TP=N) 부서도 이름이 붙고, 같은 부서 여러 행에 모두 붙는다")
        void deptNameAttachment() {
            fx.dept("D01", "생산팀", "Y");
            fx.dept("D02", "폐지팀", "N"); // 비활성 부서
            fx.dept("D03", "안쓰는팀", "Y"); // 아무도 안 쓰는 부서
            // 정렬은 START_ACTIVE_DATE, USER_ID — userId 순서와 일부러 다르게 둔다.
            fx.user("U30", "D01", day(1, 1));
            fx.user("U10", "D01", day(2, 1));   // 같은 부서 두 번째 행
            fx.user("U20", null, day(2, 1));    // U10 과 시작일 같음 → USER_ID 로 U10, U20 순
            fx.user("U05", "  ", day(3, 1));    // 공백 부서코드
            fx.user("U40", "D99", day(3, 1));   // 없는 부서
            fx.user("U01", "D02", day(4, 1));   // 비활성 부서
            fx.user("U41", "D99", day(5, 1));   // 없는 부서 다시

            Map<String, Object> out = inTx(() -> service.searchCmUser(searchReq(null, null, null)));

            List<Map<String, Object>> main = grid(out, "ds_main");
            assertThat(col(main, "USER_ID")).containsExactly("U30", "U10", "U20", "U05", "U40", "U01", "U41");
            assertThat(col(main, "DEPT_NM")).containsExactly("생산팀", "생산팀", null, null, null, "폐지팀", null);
            assertThat(col(main, "DEPT_CD")).containsExactly("D01", "D01", null, "  ", "D99", "D02", "D99");
            // DEPT_NM 키는 이름이 없을 때도 null 값으로 들어 있다.
            assertThat(main).allSatisfy(r -> assertThat(r).containsKey("DEPT_NM"));
        }

        @Test
        @DisplayName("반환 Map 은 ds_main, ds_mainAll 두 키 — 행 Map 은 17 컬럼 고정 순서")
        void rowShapeAndKeyOrder() {
            fx.dept("D01", "생산팀", "Y");
            SecUser u = new SecUser();
            u.setUserId("kim");
            u.setUserEmpNo("1001");
            u.setSsoId("kim.sso");
            u.setUserNm("김철수");
            u.setStartActiveDate(day(1, 2));
            u.setEndActiveDate(LocalDateTime.of(9999, 12, 31, 0, 0));
            u.setDeptCd("D01");
            u.setUserCategoryCd("CAT");
            u.setUseTp("Y");
            u.setEmail("kim@x.com");
            u.setTelNo("02-1");
            u.setMobileTelNo("010-1");
            u.setInOutEmpTp("I");
            u.setGroupId1("G1");
            u.setGroupId2("G2");
            u.setGroupId3("G3");
            u.setThemeTp("dark"); // 응답에 나가지 않는 컬럼
            fx.user(u);

            Map<String, Object> out = inTx(() -> service.searchCmUser(searchReq(null, null, null)));

            assertThat(out.keySet()).containsExactly("ds_main", "ds_mainAll");
            Map<String, Object> r = grid(out, "ds_main").get(0);
            assertThat(r.keySet()).containsExactly(
                    "USER_ID", "USER_EMP_NO", "SSO_ID", "USER_NM", "START_ACTIVE_DATE", "END_ACTIVE_DATE",
                    "DEPT_CD", "USER_CATEGORY_CD", "USE_TP", "EMAIL", "TEL_NO", "MOBILE_TEL_NO",
                    "IN_OUT_EMP_TP", "GROUP_ID1", "GROUP_ID2", "GROUP_ID3", "DEPT_NM");
            assertThat(r.values()).containsExactly(
                    "kim", "1001", "kim.sso", "김철수", day(1, 2), LocalDateTime.of(9999, 12, 31, 0, 0),
                    "D01", "CAT", "Y", "kim@x.com", "02-1", "010-1",
                    "I", "G1", "G2", "G3", "생산팀");
        }

        @Test
        @DisplayName("ds_mainAll — 필터와 무관하게 전체 사용자 USER_ID·USER_EMP_NO, USER_ID 순")
        void mainAllIgnoresFilter() {
            fx.user("bbb", null, day(1, 1));
            fx.user("aaa", null, day(1, 2));
            SecUser n = fx.user("ccc", null, day(1, 3));
            n.setUseTp("N");
            fx.user(n);

            Map<String, Object> out = inTx(() -> service.searchCmUser(searchReq(null, "N", null)));

            assertThat(col(grid(out, "ds_main"), "USER_ID")).containsExactly("ccc");
            List<Map<String, Object>> all = grid(out, "ds_mainAll");
            assertThat(all).hasSize(3);
            assertThat(all.get(0).keySet()).containsExactly("USER_ID", "USER_EMP_NO");
            assertThat(col(all, "USER_ID")).containsExactly("aaa", "bbb", "ccc");
            assertThat(col(all, "USER_EMP_NO")).containsExactly("Eaaa", "Ebbb", "Eccc");
        }

        @Test
        @DisplayName("검색어 — USER_ID·사번·이름 앞부분 일치(대소문자 무시), 사용여부·내외부 구분은 완전 일치")
        void filters() {
            SecUser a = fx.user("alpha", null, day(1, 1));
            a.setUserEmpNo("9001");
            a.setUserNm("홍길동");
            a.setInOutEmpTp("O");
            fx.user(a);
            SecUser b = fx.user("beta", null, day(1, 2));
            b.setUserEmpNo("ALP77");
            fx.user(b);
            SecUser c = fx.user("gamma", null, day(1, 3));
            c.setUserNm("홍두깨");
            c.setUseTp("N");
            fx.user(c);
            fx.user("xalpha", null, day(1, 4)); // 중간 일치는 안 걸린다

            assertThat(col(grid(inTx(() -> service.searchCmUser(searchReq("ALP", null, null))), "ds_main"), "USER_ID"))
                    .containsExactly("alpha", "beta");
            assertThat(col(grid(inTx(() -> service.searchCmUser(searchReq("홍", null, null))), "ds_main"), "USER_ID"))
                    .containsExactly("alpha", "gamma");
            assertThat(col(grid(inTx(() -> service.searchCmUser(searchReq("홍", "Y", null))), "ds_main"), "USER_ID"))
                    .containsExactly("alpha");
            assertThat(col(grid(inTx(() -> service.searchCmUser(searchReq("", "", "O"))), "ds_main"), "USER_ID"))
                    .containsExactly("alpha");
        }

        @Test
        @DisplayName("요청이 null 이면 필터 없이 전체, 결과가 없으면 ds_main 은 빈 목록")
        void nullRequestAndEmpty() {
            Map<String, Object> empty = inTx(() -> service.searchCmUser(null));
            assertThat(grid(empty, "ds_main")).isEmpty();
            assertThat(grid(empty, "ds_mainAll")).isEmpty();

            fx.user("u1", "D01", day(1, 1));
            Map<String, Object> out = inTx(() -> service.searchCmUser(null));
            assertThat(col(grid(out, "ds_main"), "USER_ID")).containsExactly("u1");
            assertThat(col(grid(out, "ds_main"), "DEPT_NM")).containsExactly((Object) null);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // searchUserRoleGrp
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("searchUserRoleGrp")
    class SearchUserRoleGrp {

        @Test
        @DisplayName("사용자 보유 역할그룹 — ROLE_GROUP_ID 순, 역할그룹 행이 없는 매핑은 내부 조인이라 빠진다")
        void ownedRoleGroups() {
            fx.roleGroup("RG2", "역할둘", "Y", day(1, 1), null);
            fx.roleGroup("RG1", "역할하나", "N", day(1, 1), null); // 비활성이어도 보유 목록에는 나온다
            fx.mapping("u1", "RG2", "RG1", "RG_GONE");             // RG_GONE 은 역할그룹 행 없음
            fx.mapping("u2", "RG2");

            Map<String, Object> out = inTx(() -> service.searchUserRoleGrp(userIdReq("u1")));

            assertThat(out.keySet()).containsExactly("ds_userRolegrp");
            List<Map<String, Object>> rows = grid(out, "ds_userRolegrp");
            assertThat(rows).hasSize(2);
            assertThat(rows.get(0).keySet()).containsExactly("ROLE_GROUP_ID", "ROLE_GROUP_NM", "USER_ID");
            assertThat(rows.get(0).values()).containsExactly("RG1", "역할하나", "u1");
            assertThat(rows.get(1).values()).containsExactly("RG2", "역할둘", "u1");
        }

        @Test
        @DisplayName("USER_ID 가 null·공백이거나 요청이 null 이면 빈 목록")
        void blankUserId() {
            fx.roleGroup("RG1", "역할하나", "Y", day(1, 1), null);
            fx.mapping(" ", "RG1");
            assertThat(grid(inTx(() -> service.searchUserRoleGrp(userIdReq(" "))), "ds_userRolegrp")).isEmpty();
            assertThat(grid(inTx(() -> service.searchUserRoleGrp(userIdReq(null))), "ds_userRolegrp")).isEmpty();
            assertThat(grid(inTx(() -> service.searchUserRoleGrp(null)), "ds_userRolegrp")).isEmpty();
        }
    }

    // ────────────────────────────────────────────────────────────────
    // searchRoleGrp — 비-SQLite(MSSQL) 분기 SQL 을 H2 MSSQLServer 모드로 실행한다
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("searchRoleGrp (MSSQL 분기)")
    class SearchRoleGrp {

        private boolean sqliteBefore;

        @BeforeEach
        void forceMssqlBranch() {
            // 정적 전역 상태 — 다른 테스트가 켜 둔 채 남겼을 경우를 막는다.
            // SQLite 분기는 CommUserMngServiceSearchRoleGrpSqliteTest 가 실제 SQLite 로 같은 시나리오를 고정한다.
            sqliteBefore = McmAuditStatementInspector.isSqlite();
            McmAuditStatementInspector.setSqlite(false);
        }

        @AfterEach
        void restore() {
            McmAuditStatementInspector.setSqlite(sqliteBefore);
        }

        @Test
        @DisplayName("사용중·유효기간 안·미보유 역할그룹만, ROLE_GROUP_ID 순")
        void addableRoleGroups() {
            LocalDateTime now = LocalDateTime.now();
            fx.roleGroup("RG_A", "기본", "Y", now.minusDays(10), null);              // 종료일 없음 → 포함
            fx.roleGroup("RG_B", "보유", "Y", now.minusDays(10), null);              // 사용자가 이미 보유 → 제외
            fx.roleGroup("RG_C", "미사용", "N", now.minusDays(10), null);             // USE_TP=N → 제외
            fx.roleGroup("RG_D", "미래시작", "Y", now.plusDays(10), null);            // 시작 전 → 제외
            fx.roleGroup("RG_E", "만료", "Y", now.minusDays(10), now.minusDays(1));  // 종료 → 제외
            fx.roleGroup("RG_F", "기간안", "Y", now.minusDays(10), now.plusDays(5)); // 포함
            fx.roleGroup("RG_G", "시작없음", "Y", null, null);                       // 시작일 null → BETWEEN 불성립, 제외
            fx.roleGroup("RG_0", "다른사람보유", "Y", now.minusDays(1), null);         // 남이 보유한 건 상관없음 → 포함
            fx.mapping("u1", "RG_B");
            fx.mapping("u2", "RG_0");

            Map<String, Object> out = inTx(() -> service.searchRoleGrp(userIdReq("u1")));

            assertThat(out.keySet()).containsExactly("ds_rolegrpList");
            List<Map<String, Object>> rows = grid(out, "ds_rolegrpList");
            assertThat(col(rows, "ROLE_GROUP_ID")).containsExactly("RG_0", "RG_A", "RG_F");
            assertThat(col(rows, "ROLE_GROUP_NM")).containsExactly("다른사람보유", "기본", "기간안");
            assertThat(rows.get(0).keySet()).containsExactly("ROLE_GROUP_ID", "ROLE_GROUP_NM");
        }

        @Test
        @DisplayName("USER_ID 가 null 이면 빈 문자열로 조회 — 보유 제외 없이 유효한 역할그룹 전체")
        void nullUserId() {
            LocalDateTime now = LocalDateTime.now();
            fx.roleGroup("RG_A", "기본", "Y", now.minusDays(1), null);
            fx.roleGroup("RG_B", "보유", "Y", now.minusDays(1), null);
            fx.mapping("u1", "RG_B");

            assertThat(col(grid(inTx(() -> service.searchRoleGrp(userIdReq(null))), "ds_rolegrpList"), "ROLE_GROUP_ID"))
                    .containsExactly("RG_A", "RG_B");
            assertThat(col(grid(inTx(() -> service.searchRoleGrp(null)), "ds_rolegrpList"), "ROLE_GROUP_ID"))
                    .containsExactly("RG_A", "RG_B");
        }
    }

    // ────────────────────────────────────────────────────────────────
    // commonUserDept / searchDeptLov
    // ────────────────────────────────────────────────────────────────

    @Nested
    @DisplayName("commonUserDept · searchDeptLov")
    class DeptLookup {

        @BeforeEach
        void depts() {
            fx.dept("D20", "품질관리팀", "Y");
            fx.dept("D10", "생산팀", "Y");
            fx.dept("D11", "생산관리팀", "N"); // 비활성 → 안 나온다
            fx.dept("X01", "QA Lab", "Y");
        }

        static CommUserMngDeptRequest deptReq(String key) {
            CommUserMngDeptRequest r = new CommUserMngDeptRequest();
            r.setEdt_DEPT_CD(key);
            return r;
        }

        static CommUserMngSearchDeptLovRequest lovReq(String keyword) {
            CommUserMngSearchDeptLovRequest r = new CommUserMngSearchDeptLovRequest();
            r.setKeyword(keyword);
            return r;
        }

        @Test
        @DisplayName("commonUserDept — 사용중 부서만, 코드 앞부분 또는 이름 포함(대소문자 무시), DEPT_CD 순")
        void commonUserDept() {
            Map<String, Object> all = inTx(() -> service.commonUserDept(deptReq(null)));
            assertThat(all.keySet()).containsExactly("ds_userDept");
            List<Map<String, Object>> rows = grid(all, "ds_userDept");
            assertThat(col(rows, "DEPT_CD")).containsExactly("D10", "D20", "X01");
            assertThat(rows.get(0).keySet()).containsExactly("DEPT_CD", "DEPT_NM");
            assertThat(rows.get(0).values()).containsExactly("D10", "생산팀");

            assertThat(col(grid(inTx(() -> service.commonUserDept(deptReq("d"))), "ds_userDept"), "DEPT_CD"))
                    .containsExactly("D10", "D20");
            assertThat(col(grid(inTx(() -> service.commonUserDept(deptReq("관리"))), "ds_userDept"), "DEPT_CD"))
                    .containsExactly("D20");
            assertThat(col(grid(inTx(() -> service.commonUserDept(deptReq("qa l"))), "ds_userDept"), "DEPT_CD"))
                    .containsExactly("X01");
            assertThat(col(grid(inTx(() -> service.commonUserDept(null)), "ds_userDept"), "DEPT_CD"))
                    .containsExactly("D10", "D20", "X01");
        }

        @Test
        @DisplayName("searchDeptLov — commonUserDept 와 같은 조회, 응답 키만 ds_deptLov")
        void searchDeptLov() {
            Map<String, Object> out = inTx(() -> service.searchDeptLov(lovReq("생산")));
            assertThat(out.keySet()).containsExactly("ds_deptLov");
            List<Map<String, Object>> rows = grid(out, "ds_deptLov");
            assertThat(rows).hasSize(1);
            assertThat(rows.get(0).keySet()).containsExactly("DEPT_CD", "DEPT_NM");
            assertThat(rows.get(0).values()).containsExactly("D10", "생산팀");

            assertThat(col(grid(inTx(() -> service.searchDeptLov(lovReq(""))), "ds_deptLov"), "DEPT_CD"))
                    .containsExactly("D10", "D20", "X01");
            assertThat(col(grid(inTx(() -> service.searchDeptLov(null)), "ds_deptLov"), "DEPT_CD"))
                    .containsExactly("D10", "D20", "X01");
            assertThat(grid(inTx(() -> service.searchDeptLov(lovReq("없음"))), "ds_deptLov")).isEmpty();
        }
    }
}
