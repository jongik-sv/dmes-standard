package com.dongkuk.dmes.mcm.userq;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.repository.DeptInfoRepository;
import com.dongkuk.dmes.mcm.userq.dto.UserQueryMngRequest;
import com.dongkuk.dmes.mcm.userq.dto.UserQueryRequest;
import com.dongkuk.dmes.mcm.userq.entity.UserQueryDef;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryAssignRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryDefRepository;
import com.dongkuk.dmes.mcm.userq.repository.UserQueryStore;
import com.dongkuk.dmes.mcm.userq.service.UserQueryMngService;
import com.dongkuk.dmes.mcm.userq.service.UserQueryService;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.dongkuk.dmes.mcm.widget.query.QueryCodeLookup;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryDataSource;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryExecutor;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 견본 정의 8개(Flyway V15, 스펙 2026-10-10-custom-report-v2-design §6) — 각각 저장 검사(SqlGuard·입력·출력 정의·queryId 형식)를 지나고
 * 기본값으로 실행되며, SQL 본문을 고르는 견본이 없다. 시험 공용 PDB 는 행만 지우므로 V15 문장을 읽어 직접 다시 넣는다.
 */
@SpringJUnitConfig(UserQueryOraConfig.class)
class UserQuerySamplesOraTest {

    private static final WidgetUserContext ADMIN = new WidgetUserContext("admin", "관리자", "IT", "IT", List.of("IT"));
    private static final List<String> IDS = List.of("SAMPLE_USER_FIND", "SAMPLE_JOB_RUN_HIST", "SAMPLE_WIDGET_BY_CTG",
            "SAMPLE_SCREEN_USAGE", "SAMPLE_MENU_ACTIVE", "SAMPLE_USRQ_LIST", "SAMPLE_ROW_LIMIT", "SAMPLE_MY_INFO");

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;
    @Autowired UserQueryDefRepository defRepository;
    @Autowired UserQueryAssignRepository assignRepository;
    @Autowired UserQueryStore store;
    @Autowired DeptInfoRepository deptRepository;
    private UserQueryMngService mng;
    private UserQueryService user;

    @BeforeEach
    void setUp() {
        clean();
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_NM, DEPT_CD, USE_TP) VALUES ('admin', '관리자', 'IT', 'Y')");
        WidgetUserContextResolver resolver = mock(WidgetUserContextResolver.class);
        when(resolver.current()).thenReturn(ADMIN);
        WidgetQueryExecutor executor = new WidgetQueryExecutor(mock(WidgetDefRepository.class), resolver, WidgetQueryDataSource.shared(dataSource));
        QueryCodeLookup lookup = new QueryCodeLookup() {
            public Set<String> items(String groupCd) { return Set.of(); }
            public boolean groupExists(String groupCd) { return true; } // 견본이 쓰는 그룹은 시더가 넣는다 — 여기서는 있다고 본다
        };
        executor.setCodeLookup(lookup);
        mng = new UserQueryMngService(defRepository, assignRepository, store, executor, deptRepository);
        mng.setCodeLookup(lookup);
        user = new UserQueryService(defRepository, assignRepository, store, executor, resolver);
        insertSamples();
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_ASSIGN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_USRQ_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID = 'admin'");
    }

    /** V15 문장(주석 제외, 「;」 줄바꿈으로 나눔)을 실행한다. 두 번 실행해도 중복이 없는지(멱등)도 함께 본다. */
    private void insertSamples() {
        String script;
        try {
            script = new String(new ClassPathResource("db/migration/oracle/mcmapuser/V15__user_query_samples.sql").getInputStream().readAllBytes(),
                    StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        String body = Arrays.stream(script.split("\n")).filter(l -> !l.startsWith("--")).reduce("", (a, b) -> a + b + "\n");
        for (int pass = 0; pass < 2; pass++) {
            for (String statement : body.split(";\\s*\n")) {
                if (!statement.isBlank()) jdbc.execute(statement);
            }
        }
    }

    @Test
    @DisplayName("견본 8개가 들어가고 이름·분류·모듈 규칙을 지키며 SQL 본문을 응답에 싣지 않는다")
    void sampleRows() {
        List<UserQueryDef> defs = defRepository.findAll();
        assertThat(defs).extracting(UserQueryDef::getQueryId).containsExactlyInAnyOrderElementsOf(IDS);
        Pattern id = Pattern.compile("^[A-Z][A-Z0-9_]{2,39}$");
        for (UserQueryDef d : defs) {
            assertThat(id.matcher(d.getQueryId()).matches()).as(d.getQueryId()).isTrue();
            assertThat(d.getQueryNm()).startsWith("[견본] ");
            assertThat(d.getCategoryCd()).isEqualTo("SAMPLE");
            assertThat(d.getModuleCd()).isEqualTo("MCM");
            assertThat(d.getSqlText()).doesNotContain("SQL_TEXT"); // 견본이 SQL 본문 열을 고르지 않는다
        }
    }

    @Test
    @DisplayName("견본마다 저장 검사(validateSql·조건·출력 정의)를 지난다 — 관리자 저장 경로로 같은 값을 다시 저장")
    void everySampleSavesAgain() {
        for (String queryId : IDS) {
            UserQueryDef d = defRepository.findById(queryId).orElseThrow();
            UserQueryMngRequest r = new UserQueryMngRequest();
            r.setQueryId(d.getQueryId());
            r.setQueryNm(d.getQueryNm());
            r.setCategoryCd(d.getCategoryCd());
            r.setModuleCd(d.getModuleCd());
            r.setQueryDesc(d.getQueryDesc());
            r.setSqlText(d.getSqlText());
            r.setParamsJson(d.getParamsJson());
            r.setColumnsJson(d.getColumnsJson());
            r.setMaxRowCnt(d.getMaxRowCnt());
            r.setUseYn(d.getUseYn());
            r.setVer(d.getVersion());
            Map<String, Object> saved = tx.execute(t -> mng.save(r));
            assertThat(saved).as(queryId).containsEntry("queryId", queryId);
        }
    }

    @Test
    @DisplayName("견본마다 기본값만으로 실행되고, 행 잘림 견본은 20행에서 잘린다")
    void everySampleRunsWithDefaults() {
        for (String queryId : IDS) jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_USRQ_ASSIGN (QUERY_ID, USER_ID) VALUES (?, 'admin')", queryId);
        for (String queryId : IDS) {
            UserQueryRequest req = new UserQueryRequest();
            req.setQueryId(queryId);
            Map<String, Object> out = user.run(req);
            assertThat(out).as(queryId).containsKeys("columns", "rows", "truncated");
        }
        UserQueryRequest limit = new UserQueryRequest();
        limit.setQueryId("SAMPLE_ROW_LIMIT");
        Map<String, Object> out = user.run(limit);
        assertThat((List<?>) out.get("rows")).hasSize(20);
        assertThat(out).containsEntry("truncated", true).containsEntry("maxRowCnt", 20);
        UserQueryRequest mine = new UserQueryRequest();
        mine.setQueryId("SAMPLE_MY_INFO");
        @SuppressWarnings("unchecked")
        Map<String, Object> row = ((List<Map<String, Object>>) user.run(mine).get("rows")).get(0);
        assertThat(row).containsEntry("USER_ID", "admin");
        // 값을 준 실행: 다중 선택·기간
        UserQueryRequest hist = new UserQueryRequest();
        hist.setQueryId("SAMPLE_JOB_RUN_HIST");
        hist.setParamsJson("{\"fromDt\":\"2026-10-01\",\"toDt\":\"2026-10-31\",\"status\":[\"OK\",\"FAIL\"]}");
        assertThat(user.run(hist)).containsKey("rows");
    }
}
