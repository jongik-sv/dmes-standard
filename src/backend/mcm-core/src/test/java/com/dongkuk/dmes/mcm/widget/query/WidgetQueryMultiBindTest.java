package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 다중 선택(multi) 목록 바인드와 기간 바인드를 Oracle 시험 PDB 에서 실제로 확인한다(스펙 2026-10-10-custom-report-v2-design §3.2 「실측」).
 * spring-jdbc 가 형 붙은 목록을 원소마다 형을 붙여 펼치는지, 빈 선택 {@code [null]} 이 0행인지, 사후 자리표시자 검사가 그대로 도는지 본다.
 */
class WidgetQueryMultiBindTest {

    private static final String TABLE = "T_UQ2_MULTI";
    private static HikariDataSource pool;

    private WidgetDefRepository defRepository;
    private WidgetQueryExecutor executor;

    @BeforeAll
    static void createTable() {
        pool = McmCoreOraTestDb.appDataSource("widget-query-multi");
        JdbcTemplate ddl = new JdbcTemplate(pool);
        dropTable(ddl);
        ddl.execute("CREATE TABLE " + TABLE + " (ID NUMBER(10) PRIMARY KEY, ST VARCHAR2(10), DT VARCHAR2(8))");
        McmCoreOraTestDb.awaitReadOnlyReadable(McmCoreOraTestDb.APP_USER, TABLE);
    }

    @AfterAll
    static void dropTableAndClosePool() {
        try {
            dropTable(new JdbcTemplate(pool));
        } finally {
            pool.close();
        }
    }

    @BeforeEach
    void setUp() {
        JdbcTemplate jdbc = new JdbcTemplate(pool);
        jdbc.execute("DELETE FROM " + TABLE);
        // ID 1..6: ST = S,H,A,S,H,A 순환 · DT = 20261001..20261006
        jdbc.execute("INSERT INTO " + TABLE + " (ID, ST, DT) SELECT LEVEL, CASE MOD(LEVEL, 3) WHEN 1 THEN 'S' WHEN 2 THEN 'H' ELSE 'A' END,"
                + " CONCAT('202610', LPAD(TO_CHAR(LEVEL), 2, '0')) FROM DUAL CONNECT BY LEVEL <= 6");
        defRepository = mock(WidgetDefRepository.class);
        Clock clock = Clock.fixed(Instant.parse("2026-10-06T03:00:00Z"), ZoneOffset.UTC);
        executor = new WidgetQueryExecutor(defRepository, mock(WidgetUserContextResolver.class), WidgetQueryDataSource.shared(pool), clock);
    }

    private static final String DEFS = "[{\"name\":\"st\",\"type\":\"multi\",\"countName\":\"stCnt\",\"options\":[{\"value\":\"S\"},{\"value\":\"H\"},{\"value\":\"A\"}]},"
            + "{\"name\":\"fromDt\",\"type\":\"daterange\",\"toName\":\"toDt\",\"default\":\"2026-10-01\",\"toDefault\":\"0d\"}]";
    private static final String SQL = "SELECT ID FROM " + TABLE + " WHERE DT BETWEEN :fromDt AND :toDt"
            + " AND (:stCnt = 0 OR ST IN (:st)) ORDER BY ID";

    @Test
    @DisplayName("run: 목록은 IN (?, ?) 로 펼쳐지고, 비면 전체(countName=0)이며 기간 기본값(0d)은 실행기 시계의 오늘로 풀린다")
    void multiAndRange() {
        assertThat(ids(Map.of("st", List.of("H", "S")))).containsExactly(1, 2, 4, 5);
        assertThat(ids(Map.of("st", List.of("A")))).containsExactly(3, 6);
        assertThat(ids(Map.of("st", List.of()))).containsExactly(1, 2, 3, 4, 5, 6);
        assertThat(ids(Map.of())).containsExactly(1, 2, 3, 4, 5, 6); // toDt 기본 0d = 2026-10-06
        assertThat(ids(Map.of("st", List.of("S"), "toDt", "2026-10-03"))).containsExactly(1);
    }

    @Test
    @DisplayName("IN (:st) 만 쓰고 countName 없이 빈 선택이면 [null] 이라 0행")
    void emptyWithoutCountMatchesNothing() {
        String defs = "[{\"name\":\"st\",\"type\":\"multi\",\"options\":[{\"value\":\"S\"}]}]";
        WidgetQueryResult r = executor.run("SELECT ID FROM " + TABLE + " WHERE ST IN (:st)", defs, Map.of("st", List.of()), 50);
        assertThat(r.rows()).isEmpty();
    }

    @Test
    @DisplayName("run: IN 밖에 쓴 multi 이름과 잘못된 기간·배열 오용은 거절한다")
    void rejections() {
        String bad = "SELECT ID FROM " + TABLE + " WHERE (:st IS NULL OR ST IN (:st))";
        assertThatThrownBy(() -> executor.run(bad, DEFS, Map.of(), 50)).hasRootCauseInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> executor.validateSql(bad, Set.of("st"), Set.of("st"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> executor.run(SQL, DEFS, Map.of("fromDt", "2026-10-09", "toDt", "2026-10-01"), 50))
                .isInstanceOf(BusinessException.class).hasMessageContaining("늦습니다");
        assertThatThrownBy(() -> executor.run(SQL, DEFS, Map.of("st", "S"), 50)).isInstanceOf(BusinessException.class);
    }

    @Test
    @DisplayName("캐시 키: 같은 선택은 순서가 달라도 한 항목을 공유하고 다른 선택은 갈린다")
    void cacheKey() {
        def("def.multi", SQL, DEFS);
        executor.runDefinition("def.multi", 50, Map.of("st", List.of("S", "H")));
        executor.runDefinition("def.multi", 50, Map.of("st", List.of("H", "S")));
        assertThat(executor.cacheSize()).isEqualTo(1);
        executor.runDefinition("def.multi", 50, Map.of("st", List.of("A")));
        assertThat(executor.cacheSize()).isEqualTo(2);
    }

    @Test
    @DisplayName("코드 조회가 DB 오류로 실패하면 안전한 BusinessException 으로 닫는다(원인 문구를 보내지 않는다)")
    void lookupFailureFailsClosed() {
        executor.setCodeLookup(new QueryCodeLookup() {
            public Set<String> items(String groupCd) { throw new IllegalStateException("ORA-00942 secret detail"); }
            public boolean groupExists(String groupCd) { return true; }
        });
        String defs = "[{\"name\":\"st\",\"type\":\"multi\",\"codeGroup\":\"WIDGET_CTG\"}]";
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE + " WHERE ST IN (:st)", defs, Map.of("st", List.of("S")), 50))
                .isInstanceOf(BusinessException.class).hasMessage(WidgetQueryExecutor.MSG_CODE_LOOKUP_FAILED);
    }

    private List<Integer> ids(Map<String, Object> values) {
        return executor.run(SQL, DEFS, values, 50).rows().stream().map(r -> ((Number) r.get("ID")).intValue()).toList();
    }

    private void def(String id, String sql, String paramsJson) {
        try {
            WidgetDef d = new WidgetDef();
            d.setWidgetId(id);
            d.setSrcTp(WidgetDef.SRC_DEF);
            d.setTypeId("query-table");
            d.setUseYn("Y");
            d.setDataSrc("mcm");
            com.fasterxml.jackson.databind.ObjectMapper json = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.node.ObjectNode config = json.createObjectNode();
            config.put("sql", sql);
            config.set("params", json.readTree(paramsJson));
            d.setConfigJson(json.writeValueAsString(config));
            when(defRepository.findById(id)).thenReturn(Optional.of(d));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static void dropTable(JdbcTemplate jdbc) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + TABLE + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }
}
