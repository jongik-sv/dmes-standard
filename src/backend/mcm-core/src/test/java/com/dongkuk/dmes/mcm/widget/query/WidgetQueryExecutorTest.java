package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * {@link WidgetQueryExecutor} — H2 메모리 DB 에 600행 표를 만들어 실제 JDBC 로 확인한다(스펙 2026-10-02-widget-admin-generic §7).
 * 행 상한·잘림, 컬럼 순서, 시스템 변수 바인딩(Asia/Seoul), 30초 캐시·이벤트 비우기, 거절 메시지, DB 오류 메시지, 늘 롤백.
 * 연결 단위 확인(커밋 0·롤백·readOnly 걸기·닫을 때 상태)은 {@link RecordingDataSource} 로 센다. SQLite 의 쓰기 거절·풀 연결 복원은
 * {@link WidgetQueryReadOnlyTest}.
 */
class WidgetQueryExecutorTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    /** UTC 로는 9월 30일 15:30, 서울로는 10월 1일 00:30 — 시간대를 서울로 바꾸는지 드러난다. */
    private static final Instant T0 = Instant.parse("2026-09-30T15:30:00Z");

    private DriverManagerDataSource dataSource;
    private JdbcTemplate jdbc;
    private RecordingDataSource recording;
    private WidgetDefRepository defRepository;
    private WidgetUserContextResolver resolver;
    private MutableClock clock;
    private WidgetQueryExecutor executor;

    @BeforeEach
    void setUp() {
        dataSource = new DriverManagerDataSource("jdbc:h2:mem:widgetq" + UUID.randomUUID().toString().replace("-", "") + ";DB_CLOSE_DELAY=-1");
        jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("CREATE TABLE WIDGET_T (ID INT PRIMARY KEY, NM VARCHAR(20), AMT DECIMAL(10,2), DT TIMESTAMP, D DATE,"
                + " MEMO CLOB, BIN VARBINARY(10), OWNER_ID VARCHAR(30), DEPT_CD VARCHAR(30))");
        jdbc.execute("INSERT INTO WIDGET_T (ID, NM, AMT, OWNER_ID, DEPT_CD)"
                + " SELECT X, CONCAT('N', X), X * 1.5, CASE WHEN X <= 100 THEN 'userA' ELSE 'userB' END, 'D100'"
                + " FROM SYSTEM_RANGE(1, 600)");
        recording = new RecordingDataSource(dataSource);
        defRepository = mock(WidgetDefRepository.class);
        resolver = mock(WidgetUserContextResolver.class);
        clock = new MutableClock(T0);
        // H2 는 읽기 전용 트랜잭션을 걸 수 없는 갈래(OTHER)라 전용 DataSource 가 아니면 실패 닫힘으로 거절된다 — 읽기 계정 전용 연결로 붙인다.
        executor = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.dedicated(recording, null), clock);
    }

    @AfterEach
    void tearDown() {
        jdbc.execute("SHUTDOWN");
    }

    // ── 행 상한·컬럼·값 ───────────────────────────────────────────────

    @Test
    @DisplayName("행 상한을 넘으면 상한만큼만 돌려주고 truncated=true, 딱 상한이면 false")
    void truncatesAtMaxRows() {
        def("def.all", "query-table", "SELECT ID, NM FROM WIDGET_T ORDER BY ID");
        WidgetQueryResult r = executor.runDefinition("def.all", 500);
        assertThat(r.rows()).hasSize(500);
        assertThat(r.truncated()).isTrue();
        assertThat(r.rows().get(0)).containsEntry("ID", 1).containsEntry("NM", "N1");
        assertThat(r.rows().get(499)).containsEntry("ID", 500);

        def("def.five", "query-table", "SELECT ID FROM WIDGET_T WHERE ID <= 500 ORDER BY ID");
        WidgetQueryResult exact = executor.runDefinition("def.five", 500);
        assertThat(exact.rows()).hasSize(500);
        assertThat(exact.truncated()).isFalse();
    }

    @Test
    @DisplayName("컬럼은 SELECT 순서(라벨)대로, 행의 키도 같은 순서다")
    void keepsColumnOrder() {
        def("def.order", "query-number", "SELECT NM, ID AS ROW_NO, AMT FROM WIDGET_T WHERE ID = 3");
        WidgetQueryResult r = executor.runDefinition("def.order", 500);
        assertThat(r.columns()).containsExactly("NM", "ROW_NO", "AMT");
        assertThat(r.rows()).hasSize(1);
        assertThat(r.rows().get(0).keySet()).containsExactly("NM", "ROW_NO", "AMT");
        assertThat(r.rows().get(0).get("ROW_NO")).isEqualTo(3);
        assertThat(r.rows().get(0).get("AMT")).isEqualTo(new BigDecimal("4.50"));
        assertThat(r.truncated()).isFalse();
    }

    @Test
    @DisplayName("값은 JSON 으로 보낼 수 있는 형으로 바꾼다 — 일시·날짜는 ISO 문자열, CLOB 은 4000자, 바이너리는 null")
    void convertsValues() {
        jdbc.update("UPDATE WIDGET_T SET DT = TIMESTAMP '2026-10-02 09:15:30', D = DATE '2026-10-02', MEMO = ?, BIN = X'0102' WHERE ID = 1",
                "가".repeat(5000));
        def("def.values", "query-table", "SELECT DT, D, MEMO, BIN, AMT FROM WIDGET_T WHERE ID = 1");
        Map<String, Object> row = executor.runDefinition("def.values", 500).rows().get(0);
        assertThat(row.get("DT")).isEqualTo("2026-10-02T09:15:30");
        assertThat(row.get("D")).isEqualTo("2026-10-02");
        assertThat((String) row.get("MEMO")).hasSize(4000);
        assertThat(row).containsEntry("BIN", null);
        assertThat(row.get("AMT")).isEqualTo(new BigDecimal("1.50"));
    }

    // ── 시스템 변수 ──────────────────────────────────────────────────

    @Test
    @DisplayName(":userId·:deptCd 는 인증 사용자 값으로 바인딩한다(요청 값이 아니다)")
    void bindsUserVariables() {
        when(resolver.current()).thenReturn(user("userA", "D100"));
        def("def.mine", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T WHERE OWNER_ID = :userId AND DEPT_CD = :deptCd");
        assertThat(executor.runDefinition("def.mine", 500).rows().get(0).get("CNT")).isEqualTo(100L);
    }

    @Test
    @DisplayName("부서가 없는 사용자의 :deptCd 는 NULL 로 바인딩한다")
    void bindsNullDept() {
        when(resolver.current()).thenReturn(user("userA", null));
        def("def.dept", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T WHERE DEPT_CD = :deptCd OR (CAST(:deptCd AS VARCHAR(30)) IS NULL AND ID = 1)");
        assertThat(executor.runDefinition("def.dept", 500).rows().get(0).get("CNT")).isEqualTo(1L);
    }

    @Test
    @DisplayName(":today·:yesterday·:monthStart·:now 는 Asia/Seoul 기준 — 사용자 변수가 없으면 사용자 정보를 읽지 않는다")
    void bindsDateVariablesInSeoul() {
        def("def.dates", "query-table", "SELECT CAST(:today AS VARCHAR(8)) AS T, CAST(:yesterday AS VARCHAR(8)) AS Y,"
                + " CAST(:monthStart AS VARCHAR(8)) AS M, CAST(:now AS TIMESTAMP) AS N FROM WIDGET_T WHERE ID = 1");
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

    // ── 결과 캐시 ────────────────────────────────────────────────────

    @Test
    @DisplayName("결과는 30초 동안 다시 쓰고, 지나면 다시 조회한다")
    void cachesFor30Seconds() {
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T");
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
        def("def.owner", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T WHERE OWNER_ID = :userId");
        when(resolver.current()).thenReturn(user("userA", "D100"));
        assertThat(count("def.owner")).isEqualTo(100L);
        when(resolver.current()).thenReturn(user("userB", "D100"));
        assertThat(count("def.owner")).isEqualTo(500L);

        def("def.rows", "query-table", "SELECT ID FROM WIDGET_T ORDER BY ID");
        assertThat(executor.runDefinition("def.rows", 500).rows()).hasSize(500);
        assertThat(executor.runDefinition("def.rows", 50).rows()).hasSize(50);
    }

    @Test
    @DisplayName(":now 를 쓰는 SQL 은 30초 구간마다 한 항목만 캐시한다 — 여러 번 불러도 다른 정의의 캐시가 유지된다")
    void nowVariableDoesNotFloodCache() {
        def("def.other", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T");
        def("def.now", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T WHERE DT IS NULL OR DT <= :now");
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
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T");
        def("def.other", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T WHERE ID > 0");
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
        def("def.race", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T");
        assertThat(count("def.race")).isEqualTo(600L);
        // 저장 뒤: 이벤트로 비운 다음 옛 SQL 로 돌던 호출이 늦게 옛 결과를 넣은 상황 — 이벤트 없이 SQL 만 바꿔 흉내 낸다.
        def("def.race", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T WHERE ID <= 10");
        assertThat(count("def.race")).isEqualTo(10L);
    }

    @Test
    @DisplayName("실패한 실행은 캐시하지 않는다")
    void doesNotCacheFailures() {
        def("def.late", "query-number", "SELECT COUNT(*) AS CNT FROM LATE_T");
        assertThatThrownBy(() -> executor.runDefinition("def.late", 500)).isInstanceOf(BusinessException.class);
        jdbc.execute("CREATE TABLE LATE_T (ID INT)");
        assertThat(count("def.late")).isEqualTo(0L);
    }

    // ── 거절 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("없는 정의·사용 중지·쿼리 유형 아님·mcm 밖 모듈은 실행하지 않는다")
    void rejectsInvalidDefinitions() {
        assertMessage(() -> executor.runDefinition("def.none", 500), "위젯 정의를 찾을 수 없습니다");
        assertMessage(() -> executor.runDefinition(null, 500), "위젯 정의를 찾을 수 없습니다");

        WidgetDef off = def("def.off", "query-table", "SELECT 1 AS A FROM WIDGET_T");
        off.setUseYn("N");
        assertMessage(() -> executor.runDefinition("def.off", 500), "사용 중지된 위젯입니다");

        def("def.md", "markdown", "SELECT 1 AS A FROM WIDGET_T");
        assertMessage(() -> executor.runDefinition("def.md", 500), "쿼리 위젯이 아닙니다");

        WidgetDef code = def("home.notice", null, null);
        code.setSrcTp(WidgetDef.SRC_CODE);
        assertMessage(() -> executor.runDefinition("home.notice", 500), "쿼리 위젯이 아닙니다");

        WidgetDef mls = def("def.mls", "query-table", "SELECT 1 AS A FROM WIDGET_T");
        mls.setDataSrc("mls");
        assertMessage(() -> executor.runDefinition("def.mls", 500), "아직 지원하지 않는 모듈입니다");
        assertMessage(() -> executor.preview("mls", "SELECT 1 AS A FROM WIDGET_T", 50), "아직 지원하지 않는 모듈입니다");

        WidgetDef noSql = def("def.nosql", "query-table", null);
        noSql.setConfigJson("{\"columns\":[]}");
        assertMessage(() -> executor.runDefinition("def.nosql", 500), "위젯 정의에 SQL 이 없습니다");

        assertThat(recording.connections).isZero(); // 검사에서 걸리면 연결을 빌리지도 않는다
    }

    @Test
    @DisplayName("저장된 SQL 도 실행 전에 다시 검사한다 — 쓰기 문은 DB 에 닿지 않는다")
    void revalidatesStoredSql() {
        def("def.bad", "query-table", "UPDATE WIDGET_T SET NM = 'x'");
        assertMessage(() -> executor.runDefinition("def.bad", 500), "SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM WIDGET_T WHERE NM = 'x'", Long.class)).isZero();
        assertThat(recording.connections).isZero();

        assertThatThrownBy(() -> executor.validateSql("SELECT 1; DELETE FROM WIDGET_T"))
                .isInstanceOf(BusinessException.class).hasMessage("문장은 하나만 쓸 수 있습니다");
        executor.validateSql("SELECT ID FROM WIDGET_T WHERE OWNER_ID = :userId");
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
                .hasMessageContaining("NO_SUCH_TABLE");
    }

    // ── 미리보기 ─────────────────────────────────────────────────────

    @Test
    @DisplayName("미리보기는 같은 검사·행 상한을 쓰고 캐시하지 않는다. dataSrc 를 비우면 mcm 으로 본다")
    void previewIsNotCached() {
        when(resolver.current()).thenReturn(user("userA", "D100"));
        WidgetQueryResult r = executor.preview("mcm", "SELECT ID FROM WIDGET_T WHERE OWNER_ID = :userId ORDER BY ID", 50);
        assertThat(r.rows()).hasSize(50);
        assertThat(r.truncated()).isTrue();

        assertThat(executor.preview("mcm", "SELECT COUNT(*) AS CNT FROM WIDGET_T", 50).rows().get(0).get("CNT")).isEqualTo(600L);
        insertRow(601);
        assertThat(executor.preview(null, "SELECT COUNT(*) AS CNT FROM WIDGET_T;", 50).rows().get(0).get("CNT")).isEqualTo(601L);

        assertMessage(() -> executor.preview("mcm", "select * into x from WIDGET_T", 50), SqlGuard.forbiddenWord("INTO"));
    }

    // ── 로컬 SQLite ──────────────────────────────────────────────────

    @Test
    @DisplayName("로컬 SQLite 모드면 MCMAPUSER. 접두·N'' 접두를 지우고 실행한다(운영 DB 는 원문 그대로)")
    void adaptsSchemaPrefixOnLocalSqliteOnly() {
        String sql = "SELECT COUNT(*) AS CNT FROM mcmapuser.WIDGET_T WHERE NM = N'N1'";
        boolean before = McmAuditStatementInspector.isSqlite();
        try {
            McmAuditStatementInspector.setSqlite(false);
            assertThat(WidgetQueryExecutor.adaptForLocalSqlite(sql)).isEqualTo(sql);

            McmAuditStatementInspector.setSqlite(true);
            assertThat(WidgetQueryExecutor.adaptForLocalSqlite(sql)).isEqualTo("SELECT COUNT(*) AS CNT FROM WIDGET_T WHERE NM = 'N1'");
            def("def.schema", "query-number", sql);
            assertThat(count("def.schema")).isEqualTo(1L); // H2 에는 MCMAPUSER 스키마가 없다 — 지우지 않으면 실패한다
        } finally {
            McmAuditStatementInspector.setSqlite(before);
        }
    }

    // ── 트랜잭션 ─────────────────────────────────────────────────────

    @Test
    @DisplayName("실행마다 따로 빌린 연결을 readOnly·자동 커밋 끔으로 걸고 늘 롤백한다 — 커밋 0, 돌려줄 때는 빌릴 때 상태")
    void alwaysRollsBackOnReadOnlyConnection() {
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T");
        count("def.count");
        executor.preview("mcm", "SELECT 1 AS A FROM WIDGET_T WHERE ID = 1", 50);
        assertThat(recording.connections).isEqualTo(3); // 처음 한 번 DB 갈래 판정(메타데이터만) + 실행 2

        assertThat(recording.readOnlyOn).isEqualTo(2);
        assertThat(recording.autoCommitOff).isEqualTo(2);
        assertThat(recording.rollbacks).isEqualTo(2);
        assertThat(recording.commits).isZero();
        assertThat(recording.dirtyCloses).isZero();
        assertThat(executor.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER); // H2

        def("def.broken", "query-table", "SELECT * FROM NO_SUCH_TABLE");
        assertThatThrownBy(() -> executor.runDefinition("def.broken", 500)).isInstanceOf(BusinessException.class);
        assertThat(recording.rollbacks).isEqualTo(3);
        assertThat(recording.commits).isZero();
        assertThat(recording.dirtyCloses).isZero();
    }

    @Test
    @DisplayName("readOnly 가 힌트뿐인 DB(H2·SQL Server)에서도 검사를 거치지 않은 쓰기는 롤백되어 남지 않는다")
    void writesBelowGuardAreRolledBackWhereReadOnlyIsAHint() throws Exception {
        int changed = executor.readOnlyJdbc().execute(con -> {
            try (Statement st = con.createStatement()) {
                return st.executeUpdate("UPDATE WIDGET_T SET NM = 'x' WHERE ID <= 10");
            }
        });
        assertThat(changed).isEqualTo(10); // H2 는 readOnly 를 강제하지 않는다 — 그래서 늘 롤백이 막는다
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM WIDGET_T WHERE NM = 'x'", Long.class)).isZero();
        assertThat(recording.commits).isZero();
        assertThat(recording.dirtyCloses).isZero();
    }

    // ── 읽기 전용 트랜잭션이 없는 DB — 전용 연결 없으면 실패 닫힘 ─────────────────

    @Test
    @DisplayName("SQL Server 는 전용 연결이 없으면 미리보기·저장 검사·실행을 모두 거절한다 — SQL 은 DB 에 닿지 않는다(갈래 판정만)")
    void sqlServerWithoutDedicatedDataSourceFailsClosed() {
        RecordingDataSource sqlServer = new RecordingDataSource(productAs("Microsoft SQL Server", dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(sqlServer), clock);
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T");

        assertThatThrownBy(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM WIDGET_T", 50))
                .isInstanceOf(BusinessException.class).hasMessage(WidgetQueryExecutor.MSG_SQLSERVER_NEEDS_DEDICATED)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.BUSINESS_ERROR));
        assertMessage(() -> ex.validateSql("SELECT COUNT(*) AS CNT FROM WIDGET_T"), WidgetQueryExecutor.MSG_SQLSERVER_NEEDS_DEDICATED);
        assertMessage(() -> ex.runDefinition("def.count", 500), WidgetQueryExecutor.MSG_SQLSERVER_NEEDS_DEDICATED);

        assertThat(ex.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.SQLSERVER);
        assertThat(sqlServer.connections).isEqualTo(1); // 갈래 판정 한 번뿐 — 실행 연결은 빌리지 않는다
        assertThat(sqlServer.autoCommitOff).isZero();
        assertThat(sqlServer.rollbacks).isZero();

        // 어느 DB 에나 적용하는 검사에서 걸리는 SQL 은 갈래 판정 전에 그 문구로 거절된다
        assertMessage(() -> ex.validateSql("UPDATE WIDGET_T SET NM = 'x'"), "SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다");
    }

    @Test
    @DisplayName("방언을 모르는 DB(H2)도 전용 연결이 없으면 거절한다 — 읽기 전용 트랜잭션을 걸 수 없는 갈래")
    void unknownDialectWithoutDedicatedDataSourceFailsClosed() {
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(recording), clock);
        assertMessage(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM WIDGET_T", 50), WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED);
        assertMessage(() -> ex.validateSql("SELECT 1 AS A FROM WIDGET_T"), WidgetQueryExecutor.MSG_OTHER_NEEDS_DEDICATED);
        assertThat(ex.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(recording.rollbacks).isZero();
    }

    @Test
    @DisplayName("require-dedicated=true 면 Oracle 도 전용 연결이 없을 때 미리보기·저장 검사·실행을 거절한다 — 운영 안내 문구(정책 B)")
    void requireDedicatedRejectsOracleWithoutDedicatedDataSource() {
        RecordingDataSource oracle = new RecordingDataSource(productAs("Oracle", dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(oracle, true), clock);
        def("def.count", "query-number", "SELECT COUNT(*) AS CNT FROM WIDGET_T");

        assertMessage(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM WIDGET_T", 50), WidgetQueryExecutor.MSG_REQUIRE_DEDICATED);
        assertMessage(() -> ex.validateSql("SELECT COUNT(*) AS CNT FROM WIDGET_T"), WidgetQueryExecutor.MSG_REQUIRE_DEDICATED);
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
        shared.validateSql("SELECT COUNT(*) AS CNT FROM WIDGET_T");
        assertThat(shared.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);

        WidgetQueryExecutor dedicated = new WidgetQueryExecutor(defRepository, resolver,
                WidgetQueryDataSource.dedicated(productAs("Oracle", dataSource), null), clock);
        dedicated.validateSql("SELECT COUNT(*) AS CNT FROM WIDGET_T");
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
    @DisplayName("SQL Server 전용 연결이면 실행하되, ; 없이 이어 쓴 SET·USE·WHILE·IF 같은 T-SQL 은 거절한다")
    void sqlServerWithDedicatedDataSourceRunsButRejectsTsql() {
        RecordingDataSource sqlServer = new RecordingDataSource(productAs("Microsoft SQL Server", dataSource));
        WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.dedicated(sqlServer, null), clock);

        assertThat(ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM WIDGET_T", 50).rows().get(0).get("CNT")).isEqualTo(600L);
        ex.validateSql("SELECT ID, \"SET\", [IF] FROM WIDGET_T"); // 같은 이름의 열은 감싸면 통과

        String base = "SELECT COUNT(*) AS CNT FROM WIDGET_T ";
        assertMessage(() -> ex.preview("mcm", base + "SET IMPLICIT_TRANSACTIONS OFF", 50), SqlGuard.forbiddenWord("SET"));
        assertMessage(() -> ex.validateSql(base + "set language us_english"), SqlGuard.forbiddenWord("SET"));
        assertMessage(() -> ex.validateSql(base + "SET ANSI_WARNINGS OFF"), SqlGuard.forbiddenWord("SET"));
        assertMessage(() -> ex.validateSql(base + "USE master"), SqlGuard.forbiddenWord("USE"));
        assertMessage(() -> ex.validateSql(base + "WHILE 1=1 BEGIN SELECT 1 END"), SqlGuard.forbiddenWord("WHILE"));
        assertMessage(() -> ex.validateSql(base + "IF 1=1 SELECT 1"), SqlGuard.forbiddenWord("IF"));
        def("def.tsql", "query-number", base + "SET IMPLICIT_TRANSACTIONS OFF");
        assertMessage(() -> ex.runDefinition("def.tsql", 500), SqlGuard.forbiddenWord("SET"));
        assertThat(sqlServer.commits).isZero();
    }

    @Test
    @DisplayName("SET·IF 는 SQL Server 갈래에서만 막는다 — PostgreSQL 연결(전용 아님)은 같은 SQL 을 갈래 검사에서 거절하지 않는다")
    void setAndIfAreSqlServerOnly() {
        WidgetQueryExecutor pg = new WidgetQueryExecutor(defRepository, resolver,
                WidgetQueryDataSource.shared(productAs("PostgreSQL", dataSource)), clock);
        // 실제로는 H2 연결이라 실행 결과는 보지 않는다 — 저장 검사(갈래 판정·실패 닫힘·갈래별 검사)를 지나는지만 본다
        pg.validateSql("SELECT SET(TAGS) AS S, IF(AMT > 0, 1, 0) AS F FROM WIDGET_T");
        assertThat(pg.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.POSTGRESQL);
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
        assertMessage(() -> ex.validateSql("SELECT 1 AS A FROM WIDGET_T"), WidgetQueryExecutor.MSG_DB_UNAVAILABLE);
        assertMessage(() -> ex.preview("mcm", "SELECT 1 AS A FROM WIDGET_T", 50), WidgetQueryExecutor.MSG_DB_UNAVAILABLE);
    }

    // ── helpers ─────────────────────────────────────────────────────

    /** 실제 연결(H2)로 실행하되 메타데이터의 제품 이름만 바꿔 다른 DB 갈래로 보이게 한다. */
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

    private long count(String defId) {
        return ((Number) executor.runDefinition(defId, 500).rows().get(0).get("CNT")).longValue();
    }

    private void insertRow(int id) {
        jdbc.update("INSERT INTO WIDGET_T (ID, NM, OWNER_ID, DEPT_CD) VALUES (?, ?, 'userB', 'D100')", id, "N" + id);
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
