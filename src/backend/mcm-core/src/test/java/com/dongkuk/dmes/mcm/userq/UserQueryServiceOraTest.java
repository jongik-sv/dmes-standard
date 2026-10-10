package com.dongkuk.dmes.mcm.userq;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.userq.dto.UserQueryRequest;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryDefRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryStore;
import com.dongkuk.dmes.mcm.userq.service.UserQueryService;
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

/**
 * {@link UserQueryService} — Oracle 시험 PDB에서 사용자 화면 계약을 확인한다(스펙 2026-10-10 §4.2·§6·§7·§11).
 * myList(내 할당·사용 중만), getDef(SQL 미포함·미할당·사용 중지 같은 문구), run(값 바인딩·잘림·오류 가림·호출 빈도 상한).
 * 사용자 문맥은 대역(인증 사용자 userA), SQL 실행은 실제 {@link WidgetQueryExecutor}.
 */
@SpringJUnitConfig(UserQueryOraConfig.class)
class UserQueryServiceOraTest {

    private static final WidgetUserContext USER_A = new WidgetUserContext("userA", "사용자A", "D100", "생산팀", List.of("D100"));
    private static final WidgetUserContext USER_B = new WidgetUserContext("userB", "사용자B", "D200", "품질팀", List.of("D200"));

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserQueryDefRepository defRepository;
    @Autowired UserQueryAssignRepository assignRepository;
    @Autowired UserQueryStore store;
    private WidgetUserContextResolver resolver;
    private UserQueryService service;

    @BeforeEach
    void setUp() {
        clean();
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_DEPT_INFO (DEPT_CD, DEPT_NM, USE_TP) VALUES ('D100', '생산팀', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, DEPT_CD, USE_TP) VALUES ('userA', '사용자A', 'D100', 'Y')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, DEPT_CD, USE_TP) VALUES ('userB', '사용자B', 'D200', 'Y')");
        resolver = mock(WidgetUserContextResolver.class);
        when(resolver.current()).thenReturn(USER_A);
        WidgetQueryExecutor executor = new WidgetQueryExecutor(mock(WidgetDefRepository.class), resolver,
                WidgetQueryDataSource.shared(dataSource));
        service = new UserQueryService(defRepository, assignRepository, store, executor, resolver);
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID IN ('userA','userB')");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_DEPT_INFO WHERE DEPT_CD IN ('D100')");
    }

    private void insertDef(String id, String nm, String category, String useYn, int maxRows, String sql, String paramsJson) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_DEF (QUERY_ID, QUERY_NM, CATEGORY_CD, SQL_TEXT, PARAMS_JSON, MAX_ROW_CNT, USE_YN)"
                + " VALUES (?, ?, ?, ?, ?, ?, ?)", id, nm, category, sql, paramsJson, maxRows, useYn);
    }

    private void insertAssign(String queryId, String userId) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID) VALUES (?, ?)", queryId, userId);
    }

    private static UserQueryRequest req(String queryId, String paramsJson) {
        UserQueryRequest r = new UserQueryRequest();
        r.setQueryId(queryId);
        r.setParamsJson(paramsJson);
        return r;
    }

    @Test
    @DisplayName("myList 는 자기 할당·사용 중만, getDef 는 SQL 없이 정의를 푼다. 미할당·사용 중지·없는 ID 는 같은 문구로 거절")
    void myListAndGetDef() {
        insertDef("PRD_DAILY", "일일 생산", "PRD", "Y", 1000,
                "SELECT 1 AS A FROM DUAL", "[{\"name\":\"nm\",\"type\":\"text\"}]");
        insertDef("QLT_BAD", "불량 현황", "QLT", "Y", 1000, "SELECT 2 AS A FROM DUAL", null);
        insertDef("OLD_GONE", "막은 쿼리", null, "N", 1000, "SELECT 3 AS A FROM DUAL", null);
        insertAssign("PRD_DAILY", "userA");
        insertAssign("QLT_BAD", "userB");   // 남의 할당
        insertAssign("OLD_GONE", "userA");  // 사용 중지

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> rows = (List<Map<String, Object>>) service.myList(req(null, null)).get("rows");
        assertThat(rows).extracting(r -> r.get("queryId")).containsExactly("PRD_DAILY");
        assertThat(rows.get(0)).containsEntry("queryNm", "일일 생산").containsEntry("categoryCd", "PRD");

        Map<String, Object> def = service.getDef(req("PRD_DAILY", null));
        assertThat(def).containsEntry("queryId", "PRD_DAILY").containsEntry("maxRowCnt", 1000);
        assertThat((List<?>) def.get("params")).hasSize(1);
        assertThat(def).doesNotContainKey("sqlText"); // 응답에 SQL 이 없다(§7)

        // 미할당·사용 중지·없는 ID — 같은 문구(있는지 없는지를 알리지 않는다)
        assertThatThrownBy(() -> service.getDef(req("QLT_BAD", null)))
                .isInstanceOf(BusinessException.class).hasMessage("쿼리를 찾을 수 없습니다");
        assertThatThrownBy(() -> service.getDef(req("OLD_GONE", null)))
                .isInstanceOf(BusinessException.class).hasMessage("쿼리를 찾을 수 없습니다");
        assertThatThrownBy(() -> service.getDef(req("NO_SUCH", null)))
                .isInstanceOf(BusinessException.class).hasMessage("쿼리를 찾을 수 없습니다");
        assertThatThrownBy(() -> service.run(req("QLT_BAD", null)))
                .isInstanceOf(BusinessException.class).hasMessage("쿼리를 찾을 수 없습니다");
        // run 도 사용 중지·없는 ID 를 같은 문구로 거절한다
        assertThatThrownBy(() -> service.run(req("OLD_GONE", null)))
                .isInstanceOf(BusinessException.class).hasMessage("쿼리를 찾을 수 없습니다");
        assertThatThrownBy(() -> service.run(req("NO_SUCH", null)))
                .isInstanceOf(BusinessException.class).hasMessage("쿼리를 찾을 수 없습니다");
    }

    @Test
    @DisplayName("run 은 정의의 SQL 로 값을 바인딩해 실행하고 행 상한에서 잘린다(truncated·maxRowCnt). 값 오류 문구는 그대로 보인다")
    void runBindsValuesAndTruncates() {
        insertDef("PRD_ROWS", "행 상한", "PRD", "Y", 5,
                "SELECT LEVEL AS L FROM DUAL CONNECT BY LEVEL <= :cnt", "[{\"name\":\"cnt\",\"type\":\"number\"}]");
        insertAssign("PRD_ROWS", "userA");

        Map<String, Object> result = service.run(req("PRD_ROWS", "{\"cnt\":\"10\"}"));
        assertThat(result.get("columns")).isEqualTo(List.of("L"));
        assertThat((List<?>) result.get("rows")).hasSize(5); // 상한 5 — 10행 중 5행
        assertThat(result).containsEntry("truncated", true).containsEntry("maxRowCnt", 5);

        // 필수·형 오류 — 사용자에게 보여도 되는 문구 그대로
        assertThatThrownBy(() -> service.run(req("PRD_ROWS", "{\"cnt\":\"abc\"}")))
                .isInstanceOf(BusinessException.class).hasMessage("입력 조건 cnt 의 값은 숫자여야 합니다.");
    }

    @Test
    @DisplayName("run 오류는 스펙 §6 안전 문구로 가린다(정의 오류·DB 오류 구분)")
    void runMasksErrors() {
        // DB 오류 — 없는 표(저장 검사는 SELECT 문장이라 통과)
        insertDef("PRD_BRKN", "깨진 쿼리", "PRD", "Y", 1000, "SELECT * FROM T_USERQ_GONE_T", null);
        insertAssign("PRD_BRKN", "userA");
        assertThatThrownBy(() -> service.run(req("PRD_BRKN", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("조회하지 못했습니다. 관리자에게 문의하세요")
                .hasMessageNotContaining("ORA");

        // 정의 오류 — 저장 검사를 거치지 않고 들어간 잘못된 입력 정의
        insertDef("PRD_BADP", "잘못된 정의", "PRD", "Y", 1000, "SELECT 1 AS A FROM DUAL", "{\"name\":");
        insertAssign("PRD_BADP", "userA");
        assertThatThrownBy(() -> service.run(req("PRD_BADP", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요");
        // getDef 도 같은 문구 — 깨진 PARAMS_JSON 의 검사 문구("올바른 JSON 이 아닙니다" 등)가 사용자에게 가면 안 된다
        assertThatThrownBy(() -> service.getDef(req("PRD_BADP", null)))
                .isInstanceOf(BusinessException.class)
                .hasMessage("쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요");
    }

    @Test
    @DisplayName("호출 빈도 상한 — 사용자마다 1분 20회, 넘으면 거절. 다른 사용자는 영향을 받지 않는다")
    void runRateLimitPerUser() {
        insertDef("PRD_FAST", "빠른 쿼리", "PRD", "Y", 10, "SELECT 1 AS A FROM DUAL", null);
        insertAssign("PRD_FAST", "userA");
        for (int i = 0; i < 20; i++) {
            assertThat((List<?>) service.run(req("PRD_FAST", null)).get("rows")).hasSize(1);
        }
        assertThatThrownBy(() -> service.run(req("PRD_FAST", null)))
                .isInstanceOf(BusinessException.class).hasMessage("잠시 후 다시 조회하세요");

        when(resolver.current()).thenReturn(USER_B);
        insertAssign("PRD_FAST", "userB");
        assertThat((List<?>) service.run(req("PRD_FAST", null)).get("rows")).hasSize(1);
    }
}
