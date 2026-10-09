package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;

/**
 * {@link WidgetQueryExecutor} — Oracle 시험 PDB({@link McmCoreOraTestDb}, MCMAPUSER)에 시험 전용 표 {@code T_C4_WIDGET_T}(600행)를 만들어
 * 실제 JDBC 로 확인한다(스펙 2026-10-02-widget-admin-generic §7). 행 상한·잘림, 컬럼 순서, 시스템 변수 바인딩(Asia/Seoul),
 * 30초 캐시·이벤트 비우기, 거절 메시지, DB 오류 메시지, 늘 롤백. Oracle 은 숫자를 BigDecimal 로 돌려주므로 숫자 단언은 {@code Number} 로 비교한다.
 * 연결 단위 확인(커밋 0·롤백·readOnly 걸기·닫을 때 상태)은 {@link RecordingDataSource} 로 센다.
 * 실제 DB 가 없는 갈래(PostgreSQL·OTHER — 옛 SQL Server·SQLite 제품 이름 포함)는 같은 Oracle 연결의 제품 이름만 바꾸는 {@link #productAs} 로 갈래 로직만 본다.
 * Oracle 읽기 전용 트랜잭션의 쓰기 거절(ORA-01456)·풀 연결 복원은 {@link WidgetQueryReadOnlyTest}.
 */
class WidgetQueryExecutorTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    /** UTC 로는 9월 30일 15:30, 서울로는 10월 1일 00:30 — 시간대를 서울로 바꾸는지 드러난다. */
    private static final Instant T0 = Instant.parse("2026-09-30T15:30:00Z");

    private static final String TABLE = "T_C4_WIDGET_T";
    private static final String LATE_TABLE = "T_C4_WIDGET_LATE_T";
    private static HikariDataSource pool;

    private DataSource dataSource;
    private JdbcTemplate jdbc;
    private RecordingDataSource recording;
    private WidgetDefRepository defRepository;
    private WidgetUserContextResolver resolver;
    private MutableClock clock;
    private WidgetQueryExecutor executor;

    @BeforeAll
    static void createTable() {
        pool = McmCoreOraTestDb.appDataSource("widget-query-exec");
        JdbcTemplate ddl = new JdbcTemplate(pool);
        dropTable(ddl, TABLE);
        ddl.execute("CREATE TABLE " + TABLE + " (ID NUMBER(10) PRIMARY KEY, NM VARCHAR2(20), AMT NUMBER(10,2), DT TIMESTAMP, D DATE,"
                + " MEMO CLOB, BIN RAW(10), OWNER_ID VARCHAR2(30), DEPT_CD VARCHAR2(30))");
        McmCoreOraTestDb.awaitReadOnlyReadable(McmCoreOraTestDb.APP_USER, TABLE); // ORA-01466 — 만든 직후 읽기 전용 스냅샷
    }

    @AfterAll
    static void dropTableAndClosePool() {
        try {
            dropTable(new JdbcTemplate(pool), TABLE);
            dropTable(new JdbcTemplate(pool), LATE_TABLE);
        } finally {
            pool.close();
        }
    }

    @BeforeEach
    void setUp() {
        dataSource = pool;
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("DELETE FROM " + TABLE);
        jdbc.execute("INSERT INTO " + TABLE + " (ID, NM, AMT, OWNER_ID, DEPT_CD)"
                + " SELECT LEVEL, CONCAT('N', LEVEL), LEVEL * 1.5, CASE WHEN LEVEL <= 100 THEN 'userA' ELSE 'userB' END, 'D100'"
                + " FROM DUAL CONNECT BY LEVEL <= 600");
        dropTable(jdbc, LATE_TABLE);
        recording = new RecordingDataSource(dataSource);
        defRepository = mock(WidgetDefRepository.class);
        resolver = mock(WidgetUserContextResolver.class);
        clock = new MutableClock(T0);
        // 앱 기본 DataSource(전용 설정 없음) — Oracle 은 읽기 전용 트랜잭션을 거는 갈래라 전용 DataSource 가 없어도 실행한다.
        executor = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(recording), clock);
    }

    @AfterEach
    void tearDown() {
        dropTable(jdbc, LATE_TABLE);
    }

    /** 표가 있으면 지운다(ORA-00942 만 무시). */
    private static void dropTable(JdbcTemplate jdbc, String table) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + table + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }

    // ── 행 상한·컬럼·값 ───────────────────────────────────────────────

    @Test
    @DisplayName("행 상한을 넘으면 상한만큼만 돌려주고 truncated=true, 딱 상한이면 false")
    void truncatesAtMaxRows() {
        def("def.all", "query-table", "SELECT ID, NM FROM T_C4_WIDGET_T ORDER BY ID");
        WidgetQueryResult r = executor.runDefinition("def.all", 500);
        assertThat(r.rows()).hasSize(500);
        assertThat(r.truncated()).isTrue();
        assertThat(num(r.rows().get(0).get("ID"))).isEqualTo(1L);
        assertThat(r.rows().get(0)).containsEntry("NM", "N1");
        assertThat(num(r.rows().get(499).get("ID"))).isEqualTo(500L);

        def("def.five", "query-table", "SELECT ID FROM T_C4_WIDGET_T WHERE ID <= 500 ORDER BY ID");
        WidgetQueryResult exact = executor.runDefinition("def.five", 500);
        assertThat(exact.rows()).hasSize(500);
        assertThat(exact.truncated()).isFalse();
    }

    @Test
    @DisplayName("컬럼은 SELECT 순서(라벨)대로, 행의 키도 같은 순서다")
    void keepsColumnOrder() {
        def("def.order", "query-number", "SELECT NM, ID AS ROW_NO, AMT FROM T_C4_WIDGET_T WHERE ID = 3");
        WidgetQueryResult r = executor.runDefinition("def.order", 500);
        assertThat(r.columns()).containsExactly("NM", "ROW_NO", "AMT");
        assertThat(r.rows()).hasSize(1);
        assertThat(r.rows().get(0).keySet()).containsExactly("NM", "ROW_NO", "AMT");
        assertThat(num(r.rows().get(0).get("ROW_NO"))).isEqualTo(3L);
        assertThat((BigDecimal) r.rows().get(0).get("AMT")).isEqualByComparingTo("4.50"); // NUMBER 는 BigDecimal — 끝자리 0 의 자릿수는 DB 몫
        assertThat(r.truncated()).isFalse();
    }

    @Test
    @DisplayName("값은 JSON 으로 보낼 수 있는 형으로 바꾼다 — 일시·날짜는 ISO 문자열, CLOB 은 4000자, 바이너리는 null")
    void convertsValues() {
        jdbc.update("UPDATE T_C4_WIDGET_T SET DT = TIMESTAMP '2026-10-02 09:15:30', D = DATE '2026-10-02', MEMO = ?, BIN = HEXTORAW('0102') WHERE ID = 1",
                "가".repeat(5000));
        def("def.values", "query-table", "SELECT DT, D, MEMO, BIN, AMT FROM T_C4_WIDGET_T WHERE ID = 1");
        Map<String, Object> row = executor.runDefinition("def.values", 500).rows().get(0);
        assertThat(row.get("DT")).isEqualTo("2026-10-02T09:15:30");
        // Oracle DATE 는 시각을 가진 형(드라이버가 Timestamp 로 돌려준다)이라 ISO 일시 문자열 — 날짜 부분만 확인한다.
        assertThat((String) row.get("D")).startsWith("2026-10-02");
        assertThat((String) row.get("MEMO")).hasSize(4000);
        assertThat(row).containsEntry("BIN", null);
        assertThat((BigDecimal) row.get("AMT")).isEqualByComparingTo("1.50");
    }

    // ── 시스템 변수 ──────────────────────────────────────────────────

    @Test
    @DisplayName(":userId·:deptCd 는 인증 사용자 값으로 바인딩한다(요청 값이 아니다)")
    void bindsUserVariables() {
        when(resolver.current()).thenReturn(user("userA", "D100"));
        def("def.mine", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T WHERE OWNER_ID = :userId AND DEPT_CD = :deptCd");
        assertThat(num(executor.runDefinition("def.mine", 500).rows().get(0).get("CNT"))).isEqualTo(100L);
    }

    @Test
    @DisplayName("부서가 없는 사용자의 :deptCd 는 NULL 로 바인딩한다")
    void bindsNullDept() {
        when(resolver.current()).thenReturn(user("userA", null));
        def("def.dept", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T WHERE DEPT_CD = :deptCd OR (CAST(:deptCd AS VARCHAR2(30)) IS NULL AND ID = 1)");
        assertThat(num(executor.runDefinition("def.dept", 500).rows().get(0).get("CNT"))).isEqualTo(1L);
    }

    @Test
    @DisplayName(":today·:yesterday·:monthStart·:now 는 Asia/Seoul 기준 — 사용자 변수가 없으면 사용자 정보를 읽지 않는다")
    void bindsDateVariablesInSeoul() {
        def("def.dates", "query-table", "SELECT CAST(:today AS VARCHAR2(8)) AS T, CAST(:yesterday AS VARCHAR2(8)) AS Y,"
                + " CAST(:monthStart AS VARCHAR2(8)) AS M, CAST(:now AS TIMESTAMP) AS N FROM T_C4_WIDGET_T WHERE ID = 1");
        Map<String, Object> row = executor.runDefinition("def.dates", 500).rows().get(0);
        assertThat(row).containsEntry("T", "20261001").containsEntry("Y", "20260930").containsEntry("M", "20261001")
                .containsEntry("N", "2026-10-01T00:30:00");
        verify(resolver, never()).current();
    }

    @Test
    @DisplayName("SQL 이 쓰지 않은 변수는 값을 만들지도 바인딩하지도 않는다")
    void bindsOnlyUsedVariables() {
        assertThat(executor.systemValues(List.of("today")).keySet()).containsExactly("today");
        assertThat(executor.systemValues(List.of())).isEmpty();
        verify(resolver, never()).current();

        when(resolver.current()).thenReturn(user("userB", "D200"));
        Map<String, Object> values = executor.systemValues(List.of("deptCd", "now"));
        assertThat(values.keySet()).containsExactlyInAnyOrder("deptCd", "now");
        assertThat(values.get("deptCd")).isEqualTo("D200");
    }

    // ── 전기일 시스템 변수(:bizDate·:bizYesterday·:baseHour, 07시 기준) ──

    @Test
    @DisplayName("전기일 시스템 변수 — 07시 경계 세 경우(06:59·07:00·연도 경계)와 baseHour=7")
    void bindsBizDayVariablesAtBoundaries() {
        // 2026-01-03 06:59 KST(서울) = UTC 2026-01-02 21:59 — 전기일은 전날
        assertBizDayValues(Instant.parse("2026-01-02T21:59:00Z"), "20260102", "20260101");
        // 2026-01-03 07:00 KST = UTC 2026-01-02 22:00 — 전기일이 바뀐다
        assertBizDayValues(Instant.parse("2026-01-02T22:00:00Z"), "20260103", "20260102");
        // 2026-01-01 06:59 KST = UTC 2025-12-31 21:59 — 연도를 넘긴 전날
        assertBizDayValues(Instant.parse("2025-12-31T21:59:00Z"), "20251231", "20251230");
    }

    private void assertBizDayValues(Instant at, String bizDate, String bizYesterday) {
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver,
                WidgetQueryDataSource.shared(recording), new MutableClock(at));
        assertThat(ex.systemValues(List.of("bizDate", "bizYesterday", "baseHour")))
                .containsEntry("bizDate", bizDate)
                .containsEntry("bizYesterday", bizYesterday)
                .containsEntry("baseHour", 7);
    }

    @Test
    @DisplayName(":bizDate·:bizYesterday·:baseHour 바인딩 값을 실제 조회로 확인한다")
    void bindsBizDayVariablesInQuery() {
        def("def.biz", "query-number", "SELECT :bizDate AS B, :bizYesterday AS Y, :baseHour AS H FROM T_C4_WIDGET_T WHERE ID = 1");
        clock = new MutableClock(Instant.parse("2026-01-02T21:59:00Z")); // 01-03 06:59 KST
        executor = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(recording), clock);
        Map<String, Object> row = executor.runDefinition("def.biz", 500).rows().get(0);
        assertThat(row).containsEntry("B", "20260102").containsEntry("Y", "20260101");
        assertThat(num(row.get("H"))).isEqualTo(7L);
        verify(resolver, never()).current();
    }

    @Test
    @DisplayName("07시를 넘으면 :bizDate 캐시 키가 달라진다 — 옛 전기일 값을 돌려주지 않는다(TTL 30초 안)")
    void bizDateCacheKeyChangesAfterBaseHour() {
        MutableClock fixed = new MutableClock(Instant.parse("2026-01-02T21:59:50Z")); // 01-03 06:59:50 KST
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver,
                WidgetQueryDataSource.shared(recording), fixed);
        Map<String, Object> before = ex.systemValues(List.of("bizDate"));
        assertThat(WidgetQueryExecutor.cacheKeyValues(before, fixed.instant()))
                .containsEntry("bizDate", "20260102");

        def("def.bizcount", "query-number",
                "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T WHERE CAST(:bizDate AS VARCHAR2(8)) IS NOT NULL");
        assertThat(((Number) ex.runDefinition("def.bizcount", 500).rows().get(0).get("CNT")).longValue()).isEqualTo(600L);
        insertRow(601);
        fixed.advance(Duration.ofSeconds(20)); // 01-03 07:00:10 KST — TTL(30초) 안, 전기일만 바뀐다
        Map<String, Object> after = ex.systemValues(List.of("bizDate"));
        assertThat(WidgetQueryExecutor.cacheKeyValues(after, fixed.instant()))
                .containsEntry("bizDate", "20260103");
        assertThat(after).isNotEqualTo(before);
        // TTL 이 지나지 않았지만 전기일이 바뀌어 캐시를 비껴간다 — 새 조회(601)
        assertThat(((Number) ex.runDefinition("def.bizcount", 500).rows().get(0).get("CNT")).longValue()).isEqualTo(601L);
    }

    // ── 결과 캐시 ────────────────────────────────────────────────────

    @Test
    @DisplayName("결과는 30초 동안 다시 쓰고, 지나면 다시 조회한다")
    void cachesFor30Seconds() {
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");
        assertThat(count("def.count")).isEqualTo(600L);
        insertRow(601);
        clock.advance(Duration.ofSeconds(29));
        assertThat(count("def.count")).isEqualTo(600L);
        clock.advance(Duration.ofSeconds(2));
        assertThat(count("def.count")).isEqualTo(601L);
    }

    @Test
    @DisplayName("캐시 키에는 행 상한과 SQL 이 쓰는 시스템 변수 값이 들어간다 — 사용자마다 따로")
    void cacheKeyIncludesVariablesAndMaxRows() {
        def("def.owner", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T WHERE OWNER_ID = :userId");
        when(resolver.current()).thenReturn(user("userA", "D100"));
        assertThat(count("def.owner")).isEqualTo(100L);
        when(resolver.current()).thenReturn(user("userB", "D100"));
        assertThat(count("def.owner")).isEqualTo(500L);

        def("def.rows", "query-table", "SELECT ID FROM T_C4_WIDGET_T ORDER BY ID");
        assertThat(executor.runDefinition("def.rows", 500).rows()).hasSize(500);
        assertThat(executor.runDefinition("def.rows", 50).rows()).hasSize(50);
    }

    @Test
    @DisplayName(":now 를 쓰는 SQL 은 30초 구간마다 한 항목만 캐시한다 — 여러 번 불러도 다른 정의의 캐시가 유지된다")
    void nowVariableDoesNotFloodCache() {
        def("def.other", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");
        def("def.now", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T WHERE DT IS NULL OR DT <= :now");
        assertThat(count("def.other")).isEqualTo(600L);
        assertThat(count("def.now")).isEqualTo(600L);
        insertRow(601);

        // 상한(1000)을 넘게 부른다 — 10ms 씩 12초, 모두 T0 에서 시작한 같은 30초 구간이다.
        for (int i = 0; i < WidgetQueryExecutor.CACHE_MAX_ENTRIES + 200; i++) {
            clock.advance(Duration.ofMillis(10));
            assertThat(count("def.now")).isEqualTo(600L);
        }
        assertThat(executor.cacheSize()).isEqualTo(2);
        assertThat(count("def.other")).isEqualTo(600L);

        clock.advance(Duration.ofSeconds(19)); // T0+31초 — 다음 구간, def.other 도 만료
        assertThat(count("def.now")).isEqualTo(601L);
        assertThat(count("def.other")).isEqualTo(601L);
    }

    @Test
    @DisplayName("캐시 키의 :now 는 30초 구간 시작으로 내리고, 다른 변수는 그대로 둔다")
    void cacheKeyTruncatesNowToTtlWindow() {
        Map<String, Object> values = Map.of("now", java.sql.Timestamp.valueOf("2026-10-01 00:30:17"), "userId", "userA");
        Map<String, Object> key = WidgetQueryExecutor.cacheKeyValues(values, T0.plusSeconds(17));
        assertThat(key).containsEntry("now", T0).containsEntry("userId", "userA");
        assertThat(WidgetQueryExecutor.cacheKeyValues(values, T0.plusSeconds(29))).isEqualTo(key);
        assertThat(WidgetQueryExecutor.cacheKeyValues(values, T0.plusSeconds(30))).containsEntry("now", T0.plusSeconds(30));
        Map<String, Object> noNow = Map.of("userId", "userA");
        assertThat(WidgetQueryExecutor.cacheKeyValues(noNow, T0)).isSameAs(noNow);
    }

    @Test
    @DisplayName("정의 저장 이벤트는 그 정의의 캐시만 비운다")
    void evictsOnDefSaved() {
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");
        def("def.other", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T WHERE ID > 0");
        assertThat(count("def.count")).isEqualTo(600L);
        assertThat(count("def.other")).isEqualTo(600L);
        insertRow(601);

        executor.onDefSaved(new WidgetDefSavedEvent("def.count"));

        assertThat(count("def.count")).isEqualTo(601L);
        assertThat(count("def.other")).isEqualTo(600L);
    }

    @Test
    @DisplayName("정의 SQL 이 바뀌면 캐시 비우기 이벤트가 없어도 새 SQL 로 조회한다 — 저장 순간 실행 중이던 호출의 옛 결과가 남지 않는다")
    void cacheKeyIncludesSql() {
        def("def.race", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");
        assertThat(count("def.race")).isEqualTo(600L);
        // 저장 뒤: 이벤트로 비운 다음 옛 SQL 로 돌던 호출이 늦게 옛 결과를 넣은 상황 — 이벤트 없이 SQL 만 바꿔 흉내 낸다.
        def("def.race", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T WHERE ID <= 10");
        assertThat(count("def.race")).isEqualTo(10L);
    }

    @Test
    @DisplayName("실패한 실행은 캐시하지 않는다")
    void doesNotCacheFailures() {
        def("def.late", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_LATE_T");
        assertThatThrownBy(() -> executor.runDefinition("def.late", 500)).isInstanceOf(BusinessException.class);
        jdbc.execute("CREATE TABLE " + LATE_TABLE + " (ID NUMBER(10))");
        McmCoreOraTestDb.awaitReadOnlyReadable(McmCoreOraTestDb.APP_USER, LATE_TABLE);
        assertThat(count("def.late")).isEqualTo(0L);
    }

    // ── 거절 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("없는 정의·사용 중지·쿼리 유형 아님·mcm 밖 모듈은 실행하지 않는다")
    void rejectsInvalidDefinitions() {
        assertMessage(() -> executor.runDefinition("def.none", 500), "위젯 정의를 찾을 수 없습니다");
        assertMessage(() -> executor.runDefinition(null, 500), "위젯 정의를 찾을 수 없습니다");

        WidgetDef off = def("def.off", "query-table", "SELECT 1 AS A FROM T_C4_WIDGET_T");
        off.setUseYn("N");
        assertMessage(() -> executor.runDefinition("def.off", 500), "사용 중지된 위젯입니다");

        def("def.md", "markdown", "SELECT 1 AS A FROM T_C4_WIDGET_T");
        assertMessage(() -> executor.runDefinition("def.md", 500), "쿼리 위젯이 아닙니다");

        WidgetDef code = def("home.notice", null, null);
        code.setSrcTp(WidgetDef.SRC_CODE);
        assertMessage(() -> executor.runDefinition("home.notice", 500), "쿼리 위젯이 아닙니다");

        WidgetDef mls = def("def.mls", "query-table", "SELECT 1 AS A FROM T_C4_WIDGET_T");
        mls.setDataSrc("mls");
        assertMessage(() -> executor.runDefinition("def.mls", 500), "아직 지원하지 않는 모듈입니다");
        assertMessage(() -> executor.preview("mls", "SELECT 1 AS A FROM T_C4_WIDGET_T", 50), "아직 지원하지 않는 모듈입니다");

        WidgetDef noSql = def("def.nosql", "query-table", null);
        noSql.setConfigJson("{\"columns\":[]}");
        assertMessage(() -> executor.runDefinition("def.nosql", 500), "위젯 정의에 SQL 이 없습니다");

        assertThat(recording.connections).isZero(); // 검사에서 걸리면 연결을 빌리지도 않는다
    }

    @Test
    @DisplayName("저장된 SQL 도 실행 전에 다시 검사한다 — 쓰기 문은 DB 에 닿지 않는다")
    void revalidatesStoredSql() {
        def("def.bad", "query-table", "UPDATE T_C4_WIDGET_T SET NM = 'x'");
        assertMessage(() -> executor.runDefinition("def.bad", 500), "SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM T_C4_WIDGET_T WHERE NM = 'x'", Long.class)).isZero();
        assertThat(recording.connections).isZero();

        assertThatThrownBy(() -> executor.validateSql("SELECT 1; DELETE FROM T_C4_WIDGET_T"))
                .isInstanceOf(BusinessException.class).hasMessage("문장은 하나만 쓸 수 있습니다");
        executor.validateSql("SELECT ID FROM T_C4_WIDGET_T WHERE OWNER_ID = :userId");
    }

    // ── DB 오류 ──────────────────────────────────────────────────────

    @Test
    @DisplayName("DB 오류는 사용자에게 고정 문구만, 미리보기는 DB 원인을 담는다")
    void hidesDbErrorsFromUsersButNotFromPreview() {
        def("def.broken", "query-table", "SELECT * FROM NO_SUCH_TABLE");
        assertMessage(() -> executor.runDefinition("def.broken", 500), "위젯 데이터를 불러오지 못했습니다");

        assertThatThrownBy(() -> executor.preview("mcm", "SELECT * FROM NO_SUCH_TABLE", 50))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("쿼리 오류: ")
                .hasMessageContaining("ORA-00942"); // 없는 표 — DB 원인(오류 번호)을 그대로 보여 준다
    }

    // ── 미리보기 ─────────────────────────────────────────────────────

    @Test
    @DisplayName("미리보기는 같은 검사·행 상한을 쓰고 캐시하지 않는다. dataSrc 를 비우면 mcm 으로 본다")
    void previewIsNotCached() {
        when(resolver.current()).thenReturn(user("userA", "D100"));
        WidgetQueryResult r = executor.preview("mcm", "SELECT ID FROM T_C4_WIDGET_T WHERE OWNER_ID = :userId ORDER BY ID", 50);
        assertThat(r.rows()).hasSize(50);
        assertThat(r.truncated()).isTrue();

        assertThat(num(executor.preview("mcm", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T", 50).rows().get(0).get("CNT"))).isEqualTo(600L);
        insertRow(601);
        assertThat(num(executor.preview(null, "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T;", 50).rows().get(0).get("CNT"))).isEqualTo(601L);

        assertMessage(() -> executor.preview("mcm", "select * into x from T_C4_WIDGET_T", 50), SqlGuard.forbiddenWord("INTO"));
    }

    // ── 트랜잭션 ─────────────────────────────────────────────────────

    @Test
    @DisplayName("실행마다 따로 빌린 연결을 readOnly·자동 커밋 끔으로 걸고 늘 롤백한다 — 커밋 0, 돌려줄 때는 빌릴 때 상태")
    void alwaysRollsBackOnReadOnlyConnection() {
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");
        count("def.count");
        executor.preview("mcm", "SELECT 1 AS A FROM T_C4_WIDGET_T WHERE ID = 1", 50);
        assertThat(recording.connections).isEqualTo(3); // 처음 한 번 DB 갈래 판정(메타데이터만) + 실행 2

        assertThat(recording.readOnlyOn).isEqualTo(2);
        assertThat(recording.autoCommitOff).isEqualTo(2);
        assertThat(recording.rollbacks).isEqualTo(2);
        assertThat(recording.commits).isZero();
        assertThat(recording.dirtyCloses).isZero();
        assertThat(executor.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);

        def("def.broken", "query-table", "SELECT * FROM NO_SUCH_TABLE");
        assertThatThrownBy(() -> executor.runDefinition("def.broken", 500)).isInstanceOf(BusinessException.class);
        assertThat(recording.rollbacks).isEqualTo(3);
        assertThat(recording.commits).isZero();
        assertThat(recording.dirtyCloses).isZero();
    }

    @Test
    @DisplayName("readOnly 가 힌트뿐인 갈래(OTHER 로 보이게 한 연결)에서도 검사를 거치지 않은 쓰기는 롤백되어 남지 않는다")
    void writesBelowGuardAreRolledBackWhereReadOnlyIsAHint() throws Exception {
        // 같은 Oracle 연결의 제품 이름만 OTHER 갈래로 바꾼다 — 읽기 전용 트랜잭션을 걸지 않아 쓰기가 실행되고, 늘 롤백이 막는다.
        RecordingDataSource hintOnly = new RecordingDataSource(productAs("MariaDB", dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.dedicated(hintOnly, null), clock);
        int changed = ex.readOnlyJdbc().execute(con -> {
            try (Statement st = con.createStatement()) {
                return st.executeUpdate("UPDATE T_C4_WIDGET_T SET NM = 'x' WHERE ID <= 10");
            }
        });
        assertThat(changed).isEqualTo(10); // 이 갈래는 readOnly 를 강제하지 않는다 — 그래서 늘 롤백이 막는다
        assertThat(ex.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM T_C4_WIDGET_T WHERE NM = 'x'", Long.class)).isZero();
        assertThat(hintOnly.commits).isZero();
        assertThat(hintOnly.dirtyCloses).isZero();
    }

    // ── 읽기 전용 트랜잭션이 없는 DB — 전용 연결 없으면 실패 닫힘 ─────────────────

    @ParameterizedTest(name = "[{index}] {0}")
    @ValueSource(strings = {"Microsoft SQL Server", "SQLite"})
    @DisplayName("SQL Server·SQLite 연결은 OTHER 로 보고, 전용 연결이 없으면 미리보기·저장 검사·실행을 모두 거절한다(실패 닫힘) — SQL 은 DB 에 닿지 않는다")
    void sqlServerAndSqliteAreOtherAndFailClosedWithoutDedicatedDataSource(String product) {
        RecordingDataSource legacy = new RecordingDataSource(productAs(product, dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(legacy), clock);
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");

        assertThatThrownBy(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T", 50))
                .isInstanceOf(BusinessException.class).hasMessage(WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR));
        assertMessage(() -> ex.validateSql("SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T"), WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED);
        assertMessage(() -> ex.runDefinition("def.count", 500), WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED);

        assertThat(ex.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(legacy.connections).isEqualTo(1); // 갈래 판정 한 번뿐 — 실행 연결은 빌리지 않는다
        assertThat(legacy.autoCommitOff).isZero();
        assertThat(legacy.rollbacks).isZero();

        // 어느 DB 에나 적용하는 검사에서 걸리는 SQL 은 갈래 판정 전에 그 문구로 거절된다
        assertMessage(() -> ex.validateSql("UPDATE T_C4_WIDGET_T SET NM = 'x'"), "SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다");
    }

    @Test
    @DisplayName("방언을 모르는 DB 도 전용 연결이 없으면 거절한다 — 읽기 전용 트랜잭션을 걸 수 없는 갈래(제품 이름만 바꾼 연결)")
    void unknownDialectWithoutDedicatedDataSourceFailsClosed() {
        RecordingDataSource unknown = new RecordingDataSource(productAs("MariaDB", dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(unknown), clock);
        assertMessage(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T", 50), WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED);
        assertMessage(() -> ex.validateSql("SELECT 1 AS A FROM T_C4_WIDGET_T"), WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED);
        assertThat(ex.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(unknown.connections).isEqualTo(1); // 갈래 판정 한 번뿐 — 실행 연결은 빌리지 않는다
        assertThat(unknown.rollbacks).isZero();
    }

    @Test
    @DisplayName("require-dedicated=true 면 Oracle 도 전용 연결이 없을 때 미리보기·저장 검사·실행을 거절한다 — 운영 안내 문구(정책 B)")
    void requireDedicatedRejectsOracleWithoutDedicatedDataSource() {
        RecordingDataSource oracle = new RecordingDataSource(productAs("Oracle", dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(oracle, true), clock);
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");

        assertMessage(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T", 50), WidgetQueryExecutor.MSG_REQUIRE_DEDICATED);
        assertMessage(() -> ex.validateSql("SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T"), WidgetQueryExecutor.MSG_REQUIRE_DEDICATED);
        assertMessage(() -> ex.runDefinition("def.count", 500), WidgetQueryExecutor.MSG_REQUIRE_DEDICATED);
        assertThat(WidgetQueryExecutor.MSG_REQUIRE_DEDICATED).contains("자율 트랜잭션 함수의 EXECUTE 권한과 DB 링크");

        assertThat(ex.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);
        assertThat(oracle.connections).isEqualTo(1); // 갈래 판정 한 번뿐 — 실행 연결은 빌리지 않는다
        assertThat(oracle.autoCommitOff).isZero();
    }

    @Test
    @DisplayName("require-dedicated=false(기본)면 Oracle 은 전용 연결 없이도 지금처럼 검사를 지난다 — 전용 연결이면 키와 상관없이 지난다")
    void requireDedicatedOffKeepsOracleSharedBehaviour() {
        WidgetQueryExecutor shared = new WidgetQueryExecutor(defRepository, resolver,
                WidgetQueryDataSource.shared(productAs("Oracle", dataSource), false), clock);
        shared.validateSql("SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");
        assertThat(shared.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);

        WidgetQueryExecutor dedicated = new WidgetQueryExecutor(defRepository, resolver,
                WidgetQueryDataSource.dedicated(productAs("Oracle", dataSource), null), clock);
        dedicated.validateSql("SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T");
    }

    @Test
    @DisplayName("require-dedicated 설정은 전용 DataSource 가 없을 때만 실린다 — WidgetQueryConfig.create")
    void requireDedicatedPropertyReachesSharedDataSource() {
        WidgetQueryProperties props = new WidgetQueryProperties();
        assertThat(WidgetQueryConfig.create(props, () -> dataSource).requireDedicated()).isFalse();
        props.setRequireDedicated(true);
        WidgetQueryDataSource shared = WidgetQueryConfig.create(props, () -> dataSource);
        assertThat(shared.dedicated()).isFalse();
        assertThat(shared.requireDedicated()).isTrue();
    }

    @Test
    @DisplayName("OTHER 갈래라도 전용 연결이면 실행하되, ; 없이 이어 쓴 USE·WHILE 같은 문장은 일반 검사(금지 낱말)가 거절한다")
    void otherWithDedicatedDataSourceRunsButGeneralGuardStillRejects() {
        RecordingDataSource other = new RecordingDataSource(productAs("Microsoft SQL Server", dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.dedicated(other, null), clock);

        assertThat(num(ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T", 50).rows().get(0).get("CNT"))).isEqualTo(600L);
        assertThat(ex.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);

        String base = "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_T ";
        assertMessage(() -> ex.preview("mcm", base + "USE master", 50), SqlGuard.forbiddenWord("USE"));
        assertMessage(() -> ex.validateSql(base + "WHILE 1=1 BEGIN SELECT 1 END"), SqlGuard.forbiddenWord("WHILE"));
        assertMessage(() -> ex.validateSql(base + "WAITFOR DELAY '00:00:10'"), SqlGuard.forbiddenWord("WAITFOR"));
        def("def.use", "query-number", base + "USE master");
        assertMessage(() -> ex.runDefinition("def.use", 500), SqlGuard.forbiddenWord("USE"));
        assertThat(other.commits).isZero();
    }

    @Test
    @DisplayName("PostgreSQL 연결(전용 아님)은 갈래를 걷어내 OTHER 로 보고 거절한다(사용자 확정 3) — Oracle 연결은 SET()·IF() 함수 이름을 막지 않는다")
    void postgresqlSharedFailsClosedAndOracleAllowsSetIfNames() {
        WidgetQueryExecutor pg = new WidgetQueryExecutor(defRepository, resolver,
                WidgetQueryDataSource.shared(productAs("PostgreSQL", dataSource)), clock);
        assertMessage(() -> pg.validateSql("SELECT 1 AS A FROM DUAL"), WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED);
        assertThat(pg.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);

        WidgetQueryExecutor ora = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(dataSource), clock);
        ora.validateSql("SELECT SET(TAGS) AS S, IF(AMT > 0, 1, 0) AS F FROM T_C4_WIDGET_T"); // 저장 검사만 — 실행하지 않는다
        assertThat(ora.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);
    }

    @Test
    @DisplayName("DB 갈래를 판정하지 못하면(연결 실패) 실행·저장 검사를 거절한다 — DB 메시지는 보내지 않는다")
    void failsClosedWhenDialectCannotBeResolved() {
        DataSource down = new DelegatingDataSource(dataSource) {
            @Override
            public Connection getConnection() throws SQLException {
                throw new SQLException("Connection refused: db-host:1433");
            }
        };
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.dedicated(down, null), clock);
        assertMessage(() -> ex.validateSql("SELECT 1 AS A FROM T_C4_WIDGET_T"), WidgetQueryExecutor.MSG_DB_UNAVAILABLE);
        assertMessage(() -> ex.preview("mcm", "SELECT 1 AS A FROM T_C4_WIDGET_T", 50), WidgetQueryExecutor.MSG_DB_UNAVAILABLE);
    }

    // ── helpers ─────────────────────────────────────────────────────

    /** 실제 연결(Oracle)로 실행하되 메타데이터의 제품 이름만 바꿔 다른 DB 갈래로 보이게 한다 — 실제 DB 가 없는 갈래의 판정 로직 시험용. */
    private static DataSource productAs(String productName, DataSource target) {
        return new DelegatingDataSource(target) {
            @Override
            public Connection getConnection() throws SQLException {
                Connection real = super.getConnection();
                return (Connection) Proxy.newProxyInstance(WidgetQueryExecutorTest.class.getClassLoader(), new Class<?>[] {Connection.class},
                        (proxy, method, args) -> {
                            if ("getMetaData".equals(method.getName())) {
                                DatabaseMetaData md = real.getMetaData();
                                return Proxy.newProxyInstance(WidgetQueryExecutorTest.class.getClassLoader(),
                                        new Class<?>[] {DatabaseMetaData.class}, (p, m, a) -> "getDatabaseProductName".equals(m.getName())
                                                ? productName : invokeOn(m, md, a));
                            }
                            return invokeOn(method, real, args);
                        });
            }
        };
    }

    private static Object invokeOn(java.lang.reflect.Method method, Object target, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }

    private WidgetDef def(String id, String typeId, String sql) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(id);
        d.setSrcTp(WidgetDef.SRC_DEF);
        d.setTypeId(typeId);
        d.setUseYn("Y");
        d.setDataSrc(typeId != null && typeId.startsWith("query-") ? "mcm" : null);
        try {
            d.setConfigJson(sql == null ? null : JSON.writeValueAsString(Map.of("sql", sql, "columns", List.of())));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        when(defRepository.findById(id)).thenReturn(Optional.of(d));
        return d;
    }

    private static long num(Object value) {
        return ((Number) value).longValue();
    }

    private long count(String defId) {
        return ((Number) executor.runDefinition(defId, 500).rows().get(0).get("CNT")).longValue();
    }

    private void insertRow(int id) {
        jdbc.update("INSERT INTO T_C4_WIDGET_T (ID, NM, OWNER_ID, DEPT_CD) VALUES (?, ?, 'userB', 'D100')", id, "N" + id);
    }

    private static WidgetUserContext user(String userId, String deptCd) {
        return new WidgetUserContext(userId, userId, deptCd, null, deptCd == null ? List.of() : List.of(deptCd));
    }

    private static void assertMessage(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String message) {
        assertThatThrownBy(call).isInstanceOf(BusinessException.class).hasMessage(message);
    }

    /**
     * 빌린 연결의 commit·rollback·setReadOnly(true)·setAutoCommit(false) 를 세고, 닫을 때 autoCommit=false 또는 readOnly=true 로
     * 남았으면 dirtyCloses 를 센다(풀에 그대로 돌아갔다면 업무 코드에 넘어갈 상태).
     */
    static final class RecordingDataSource extends DelegatingDataSource {
        int connections;
        int commits;
        int rollbacks;
        int readOnlyOn;
        int autoCommitOff;
        int dirtyCloses;

        RecordingDataSource(DataSource target) {
            super(target);
        }

        @Override
        public Connection getConnection() throws SQLException {
            connections++;
            Connection real = super.getConnection();
            return (Connection) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {Connection.class},
                    (proxy, method, args) -> {
                        switch (method.getName()) {
                            case "commit" -> commits++;
                            case "rollback" -> {
                                if (args == null) rollbacks++;
                            }
                            case "setReadOnly" -> {
                                if (Boolean.TRUE.equals(args[0])) readOnlyOn++;
                            }
                            case "setAutoCommit" -> {
                                if (Boolean.FALSE.equals(args[0])) autoCommitOff++;
                            }
                            case "close" -> {
                                if (!real.isClosed() && (!real.getAutoCommit() || real.isReadOnly())) dirtyCloses++;
                            }
                            default -> {
                                // 그대로 넘긴다
                            }
                        }
                        try {
                            return method.invoke(real, args);
                        } catch (InvocationTargetException e) {
                            throw e.getCause();
                        }
                    });
        }
    }

    /** 시험용 움직이는 시계. 시간대는 일부러 UTC — 실행기가 스스로 Asia/Seoul 로 바꿔야 한다. */
    static final class MutableClock extends Clock {
        private Instant now;

        MutableClock(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
