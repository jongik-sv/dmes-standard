package com.dongkuk.dmes.mcm.userq;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.userq.dto.UserQueryMngRequest;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryDefRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryStore;
import com.dongkuk.dmes.mcm.userq.service.UserQueryMngService;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryDataSource;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryExecutor;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link UserQueryMngService} — Oracle 시험 PDB({@code McmCoreOraTestDb})에서 관리 목록 조회조건 5개·저장(전체 교체·VER 충돌·검사)·
 * 삭제(할당 먼저)·할당(전체 교체·없는 사용자·missingYn)·미리보기·검증을 확인한다(스펙 2026-10-10 §4.1·§11).
 * SQL 실행 경로는 실제 {@link WidgetQueryExecutor} 를 쓴다(정의 저장소·사용자 문맥만 대역). 쓰기 action 은 운영처럼 한 트랜잭션으로 감싼다.
 */
@SpringJUnitConfig(UserQueryOraConfig.class)
class UserQueryMngServiceOraTest {

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;
    @Autowired UserQueryDefRepository defRepository;
    @Autowired UserQueryAssignRepository assignRepository;
    @Autowired UserQueryStore store;
    @Autowired DeptInfoRepository deptRepository;
    private UserQueryMngService service;

    @BeforeEach
    void setUp() {
        clean();
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO (DEPT_CD, DEPT_NM, USE_TP) VALUES ('D100', '생산팀', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO (DEPT_CD, DEPT_NM, USE_TP) VALUES ('D200', '품질팀', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, DEPT_CD, USE_TP) VALUES ('userA', '사용자A', 'D100', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, DEPT_CD, USE_TP) VALUES ('userB', '사용자B', 'D200', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, DEPT_CD, USE_TP) VALUES ('userX', '퇴사자', 'D100', 'N')");
        WidgetUserContextResolver resolver = mock(WidgetUserContextResolver.class);
        when(resolver.current()).thenReturn(new WidgetUserContext("admin", "admin", null, null, List.of()));
        WidgetQueryExecutor executor = new WidgetQueryExecutor(mock(WidgetDefRepository.class), resolver,
                WidgetQueryDataSource.shared(dataSource));
        service = new UserQueryMngService(defRepository, assignRepository, store, executor, deptRepository);
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID IN ('userA','userB','userX')");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_DEPT_INFO WHERE DEPT_CD IN ('D100','D200')");
    }

    // ── helpers ──────────────────────────────────────────────────────

    private void insertDef(String id, String nm, String category, String deptCd, String useYn, int maxRows) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_DEF (QUERY_ID, QUERY_NM, CATEGORY_CD, OWNER_DEPT_CD, SQL_TEXT, MAX_ROW_CNT, USE_YN)"
                + " VALUES (?, ?, ?, ?, 'SELECT 1 AS A FROM DUAL', ?, ?)", id, nm, category, deptCd, maxRows, useYn);
    }

    private void insertAssign(String queryId, String userId) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID) VALUES (?, ?)", queryId, userId);
    }

    private static UserQueryMngRequest req(String queryId, String queryNm, String sqlText) {
        UserQueryMngRequest r = new UserQueryMngRequest();
        r.setQueryId(queryId);
        r.setQueryNm(queryNm);
        r.setSqlText(sqlText);
        r.setUseYn("Y");
        r.setMaxRowCnt(1000);
        return r;
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> searchRows(String... pairs) {
        UserQueryMngRequest r = new UserQueryMngRequest();
        for (int i = 0; i + 1 < pairs.length; i += 2) {
            switch (pairs[i]) {
                case "categoryCd" -> r.setCategoryCd(pairs[i + 1]);
                case "keyword" -> r.setKeyword(pairs[i + 1]);
                case "useYn" -> r.setUseYn(pairs[i + 1]);
                case "ownerDept" -> r.setOwnerDept(pairs[i + 1]);
                case "assignUser" -> r.setAssignUser(pairs[i + 1]);
                default -> throw new IllegalArgumentException(pairs[i]);
            }
        }
        return (List<Map<String, Object>>) service.search(r).get("rows");
    }

    // ── 목록 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("search 는 조회조건 5개(분류·이름/ID·사용 여부·담당 부서 코드·이름·할당 사용자)로 거르고 부서 이름·할당 수를 채운다")
    void searchFiltersByFiveConditions() {
        insertDef("PRD_DAILY", "일일 생산", "PRD", "D100", "Y", 1000);
        insertDef("PRD_WEEK", "주간 생산", "PRD", "D200", "Y", 5000);
        insertDef("QLT_BAD", "불량 현황", "QLT", "D100", "N", 1000);
        insertAssign("PRD_DAILY", "userA");

        assertThat(searchRows()).extracting(r -> r.get("queryId")).containsExactlyInAnyOrder("PRD_DAILY", "PRD_WEEK", "QLT_BAD");
        assertThat(searchRows("categoryCd", "PRD")).extracting(r -> r.get("queryId")).containsExactlyInAnyOrder("PRD_DAILY", "PRD_WEEK");
        assertThat(searchRows("keyword", "daily")).extracting(r -> r.get("queryId")).containsExactly("PRD_DAILY"); // ID 부분 일치(대소문자 무시)
        assertThat(searchRows("keyword", "불량")).extracting(r -> r.get("queryId")).containsExactly("QLT_BAD");    // 이름 부분 일치
        assertThat(searchRows("useYn", "N")).extracting(r -> r.get("queryId")).containsExactly("QLT_BAD");
        assertThat(searchRows("ownerDept", "D100")).extracting(r -> r.get("queryId")).containsExactlyInAnyOrder("PRD_DAILY", "QLT_BAD"); // 부서 코드 같음
        assertThat(searchRows("ownerDept", "생산")).extracting(r -> r.get("queryId")).containsExactlyInAnyOrder("PRD_DAILY", "QLT_BAD"); // 부서 이름 부분 일치(D100=생산팀)
        assertThat(searchRows("assignUser", "usera")).extracting(r -> r.get("queryId")).containsExactly("PRD_DAILY");          // 할당 사용자 앞 일치
        assertThat(searchRows("categoryCd", "PRD", "useYn", "Y", "ownerDept", "품질")).extracting(r -> r.get("queryId")).containsExactly("PRD_WEEK"); // 조합

        Map<String, Object> first = searchRows().stream().filter(r -> "PRD_DAILY".equals(r.get("queryId"))).findFirst().orElseThrow();
        assertThat(first).containsEntry("queryNm", "일일 생산").containsEntry("ownerDeptNm", "생산팀")
                .containsEntry("assignCnt", 1).containsEntry("useYn", "Y").containsEntry("maxRowCnt", 1000);
        assertThat(first.get("uAt")).isNull(); // 직접 넣은 행 — 감사 칸은 JPA 저장 때만 채워진다
    }

    // ── 저장·조회·삭제 ────────────────────────────────────────────────

    @Test
    @DisplayName("save 신규 → get 전체 → 갱신(전체 교체·VER 증가) → VER 충돌·중복·규칙·SQL·출력 정의 거절 → delete 는 할당을 먼저 지운다")
    void saveGetDeleteLifecycle() {
        UserQueryMngRequest save = req("PRD_NEW1", "새 쿼리", "SELECT OWNER_ID FROM MCMAPUSER.TB_MCM_SEC_USER WHERE OWNER_ID = :nm");
        save.setParamsJson("[{\"name\":\"nm\",\"type\":\"text\"}]");
        save.setColumnsJson("[{\"field\":\"OWNER_ID\",\"header\":\"사용자\",\"align\":\"center\"}]");
        save.setCategoryCd("PRD");
        save.setOwnerDeptCd("D100");
        Map<String, Object> saved = tx.execute(t -> service.save(save));
        assertThat(saved).containsEntry("queryId", "PRD_NEW1").containsEntry("ver", 0L);

        @SuppressWarnings("unchecked")
        Map<String, Object> def = (Map<String, Object>) service.get(req("PRD_NEW1", null, null)).get("def");
        assertThat(def).containsEntry("queryNm", "새 쿼리").containsEntry("categoryCd", "PRD")
                .containsEntry("ownerDeptNm", "생산팀").containsEntry("maxRowCnt", 1000)
                .containsEntry("paramsJson", "[{\"name\":\"nm\",\"type\":\"text\"}]")
                .containsEntry("columnsJson", "[{\"field\":\"OWNER_ID\",\"header\":\"사용자\",\"align\":\"center\"}]");
        assertThat((Long) def.get("ver")).isEqualTo(0L);
        assertThat(def.get("uUsrId")).isNull(); // McmAuditListener — 인증 컨텍스트가 없는 시험에서는 감사 칸이 비워진다

        // 갱신 — 전체 교체: paramsJson·columnsJson 키를 보내지 않으면 null 로 저장된다
        UserQueryMngRequest update = req("PRD_NEW1", "이름 바꿈", "SELECT 1 AS A FROM DUAL");
        update.setVer(0L);
        Map<String, Object> updated = tx.execute(t -> service.save(update));
        assertThat(updated).containsEntry("ver", 1L);
        @SuppressWarnings("unchecked")
        Map<String, Object> after = (Map<String, Object>) service.get(req("PRD_NEW1", null, null)).get("def");
        assertThat(after).containsEntry("queryNm", "이름 바꿈").containsEntry("paramsJson", null).containsEntry("columnsJson", null);
        // 감사 칸 시각 — 엔티티 Instant(get)·네이티브 Timestamp(search) 둘 다 ISO 글자로 나간다(iso() 두 분기)
        String isoPattern = "\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}";
        assertThat((String) after.get("cAt")).matches(isoPattern);
        assertThat((String) after.get("uAt")).matches(isoPattern);
        assertThat((String) searchRows("keyword", "PRD_NEW1").get(0).get("uAt")).matches(isoPattern);

        // VER 충돌 — 옛 ver 로는 거절
        UserQueryMngRequest stale = req("PRD_NEW1", "또 바꿈", "SELECT 1 AS A FROM DUAL");
        stale.setVer(0L);
        assertThatThrownBy(() -> tx.execute(t -> service.save(stale)))
                .isInstanceOf(BusinessException.class).hasMessage("다른 사람이 먼저 고쳤습니다. 다시 조회하세요");

        // 신규인데 같은 ID — 거절
        assertThatThrownBy(() -> tx.execute(t -> service.save(req("PRD_NEW1", "겹침", "SELECT 1 AS A FROM DUAL"))))
                .isInstanceOf(BusinessException.class).hasMessage("이미 등록된 쿼리 ID 입니다: PRD_NEW1");

        // ID 규칙 — 소문자·짧음 거절
        assertThatThrownBy(() -> service.save(req("prd_x", "소문자", "SELECT 1 AS A FROM DUAL")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("쿼리 ID");
        assertThatThrownBy(() -> service.save(req("AB", "짧음", "SELECT 1 AS A FROM DUAL")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("쿼리 ID");

        // SQL 검사 — DML·다문장·선언 없는 변수 거절
        assertThatThrownBy(() -> service.save(req("PRD_DML1", "쓰기", "UPDATE MCMAPUSER.TB_MCM_USRQ_DEF SET QUERY_NM = 'x'")))
                .isInstanceOf(BusinessException.class).hasMessage("SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다");
        assertThatThrownBy(() -> service.save(req("PRD_TWO1", "두문장", "SELECT 1 AS A FROM DUAL; DELETE FROM MCMAPUSER.TB_MCM_USRQ_DEF")))
                .isInstanceOf(BusinessException.class).hasMessage("문장은 하나만 쓸 수 있습니다");
        assertThatThrownBy(() -> service.save(req("PRD_USR1", "미선언", "SELECT 1 AS A FROM DUAL WHERE :nm = 'x'")))
                .isInstanceOf(BusinessException.class).hasMessageContaining(":nm");

        // maxRowCnt 범위·출력 정의 열거값 거절
        UserQueryMngRequest bigRows = req("PRD_BIG1", "큰행", "SELECT 1 AS A FROM DUAL");
        bigRows.setMaxRowCnt(5001);
        assertThatThrownBy(() -> service.save(bigRows)).isInstanceOf(BusinessException.class).hasMessageContaining("최대 행 수");
        UserQueryMngRequest badCols = req("PRD_COL1", "잘못된 열", "SELECT 1 AS A FROM DUAL");
        badCols.setColumnsJson("[{\"field\":\"A\",\"align\":\"middle\"}]");
        assertThatThrownBy(() -> service.save(badCols)).isInstanceOf(BusinessException.class).hasMessageContaining("align");

        // 삭제 — 할당을 먼저 지운다
        insertAssign("PRD_NEW1", "userA");
        insertAssign("PRD_NEW1", "userB");
        UserQueryMngRequest del = req("PRD_NEW1", null, null);
        del.setVer(1L);
        Map<String, Object> deleted = tx.execute(t -> service.delete(del));
        assertThat(deleted).containsEntry("deleted", 1).containsEntry("assignDeleted", 2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_USRQ_DEF WHERE QUERY_ID = 'PRD_NEW1'", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN WHERE QUERY_ID = 'PRD_NEW1'", Long.class)).isZero();
    }

    // ── 미리보기·검증 ────────────────────────────────────────────────

    @Test
    @DisplayName("previewQuery 는 50행 상한으로 돌리고 DB 오류 문구를 그대로 보여 준다. validate 는 사용자 바인드 이름을 돌려준다")
    void previewAndValidate() {
        UserQueryMngRequest preview = new UserQueryMngRequest();
        preview.setSqlText("SELECT LEVEL AS L FROM DUAL CONNECT BY LEVEL <= 60");
        @SuppressWarnings("unchecked")
        Map<String, Object> result = (Map<String, Object>) service.previewQuery(preview);
        assertThat(result.get("columns")).isEqualTo(List.of("L"));
        assertThat((List<?>) result.get("rows")).hasSize(50);
        assertThat(result).containsEntry("truncated", true);

        UserQueryMngRequest broken = new UserQueryMngRequest();
        broken.setSqlText("SELECT * FROM T_USERQ_NO_SUCH_T");
        assertThatThrownBy(() -> service.previewQuery(broken))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("쿼리 오류: ")
                .hasMessageContaining("ORA-");

        UserQueryMngRequest validate = new UserQueryMngRequest();
        validate.setSqlText("SELECT 1 AS A FROM DUAL WHERE :nm = :today");
        validate.setParamsJson("[{\"name\":\"nm\",\"type\":\"text\"}]");
        assertThat(service.validate(validate)).containsEntry("binds", List.of("nm")); // 시스템 변수(:today)는 제외
    }

    // ── 할당 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("saveAssign 전체 교체(added/removed)·없는 사용자 거절, searchAssign 은 없는 사용자 배지(missingYn), searchUserList 는 사용 중만")
    void assignActions() {
        insertDef("PRD_ASGN", "할당 쿼리", "PRD", null, "Y", 1000);
        insertAssign("PRD_ASGN", "userA");
        insertAssign("PRD_ASGN", "goneUser"); // 직접 넣은 없는 사용자 행

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> assigns = (List<Map<String, Object>>) service.searchAssign(req("PRD_ASGN", null, null)).get("rows");
        assertThat(assigns).hasSize(2);
        assertThat(assigns.get(0)).containsEntry("userId", "goneUser").containsEntry("missingYn", "Y")
                .containsEntry("userNm", null).containsEntry("deptNm", null);
        assertThat(assigns.get(1)).containsEntry("userId", "userA").containsEntry("userNm", "사용자A")
                .containsEntry("deptNm", "생산팀").containsEntry("missingYn", "N");

        // 전체 교체 — userA 유지·userB 추가·goneUser 제거
        UserQueryMngRequest save = req("PRD_ASGN", null, null);
        save.setUserIdsJson("[\"userB\",\"userA\"]");
        Map<String, Object> saved = tx.execute(t -> service.saveAssign(save));
        assertThat(saved).containsEntry("added", 1).containsEntry("removed", 1);

        // 없는 사용자 — 거절, DB 는 그대로
        UserQueryMngRequest missing = req("PRD_ASGN", null, null);
        missing.setUserIdsJson("[\"userA\",\"noUser\"]");
        assertThatThrownBy(() -> service.saveAssign(missing))
                .isInstanceOf(BusinessException.class).hasMessage("없는 사용자입니다: noUser");

        // 사용자 목록 — 사용 중만(userX 제외), 이름순. 기준선 시드 사용자가 함께 있을 수 있으니 시험 사용자만 정확히 본다
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> users = (List<Map<String, Object>>) service.searchUserList(new UserQueryMngRequest()).get("rows");
        assertThat(users).extracting(u -> u.get("userId")).contains("userA", "userB").doesNotContain("userX");
        assertThat(service.searchUserList(new UserQueryMngRequest())).containsEntry("truncated", false);
    }
}
