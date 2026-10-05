package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 쿼리 위젯 실행기 읽기 전용 강제 — 실제 SQLite 파일 + Hikari 풀(로컬 실행과 같은 구성)로 확인한다(스펙 §7.3, 도커 없음).
 * <ul>
 *   <li>검사(SqlGuard)를 거치지 않고 실행 경로 아래층에 쓰기 문장을 넣어도 {@code SQLITE_READONLY} 로 거절되고 DB 는 그대로다.</li>
 *   <li>실행 뒤 같은 풀의 <b>같은 물리 연결</b>이 query_only·readOnly·autoCommit 이 되돌려진 채 업무 쓰기를 한다(성공·실패 모두).</li>
 *   <li>바깥 업무 트랜잭션(같은 DataSource)의 연결을 쓰지도, 읽기 전용으로 만들지도 않는다.</li>
 *   <li>되돌리지 못한 연결은 풀에서 빠진다. 전용 DataSource 설정이 있으면 그것을 쓴다.</li>
 *   <li>PostgreSQL·Oracle 은 실제 DB 없이 대본 연결로 확인한다(읽기 전용을 걸지 못하면 SQL 을 실행하지 않는다). 대본 연결은 JDBC 규약과
 *       pgjdbc 실제 제약을 흉내 낸다 — 트랜잭션 중 {@code setReadOnly} 는 예외, 트랜잭션 중 autoCommit 을 켜면 커밋(기록에 {@code commit}),
 *       autoCommit 에서 롤백은 예외. 실 PostgreSQL 확인은 스펙 §7.3(2026-10-03 실측).</li>
 * </ul>
 */
class WidgetQueryReadOnlyTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @TempDir
    Path dir;

    private String url;
    private JdbcTemplate admin;
    private HikariDataSource pool;
    private WidgetDefRepository defRepository;
    private WidgetUserContextResolver resolver;
    private WidgetQueryExecutor executor;
    private final List<HikariDataSource> extraPools = new ArrayList<>();

    @BeforeEach
    void setUp() {
        url = "jdbc:sqlite:" + dir.resolve("widget.db");
        admin = new JdbcTemplate(new DriverManagerDataSource(url)); // 확인용 — 호출마다 새 연결
        admin.execute("CREATE TABLE T (ID INTEGER PRIMARY KEY, NM TEXT)");
        admin.update("INSERT INTO T (ID, NM) VALUES (1, 'a'), (2, 'b'), (3, 'c')");
        pool = hikari(url, 1);
        defRepository = mock(WidgetDefRepository.class);
        resolver = mock(WidgetUserContextResolver.class);
        executor = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(pool), Clock.systemUTC());
    }

    @AfterEach
    void tearDown() {
        pool.close();
        extraPools.forEach(HikariDataSource::close);
    }

    // ── 쓰기 거절 ────────────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {
            "INSERT INTO T (ID, NM) VALUES (99, 'x')",
            "UPDATE T SET NM = 'x'",
            "DELETE FROM T",
            "CREATE TABLE EVIL (ID INTEGER)"})
    @DisplayName("읽기 전용 연결 범위 안에서 쓰기 문장을 직접 실행하면 SQLITE_READONLY 로 거절되고 DB 는 바뀌지 않는다")
    void writesInsideReadOnlyScopeAreRejected(String sql) {
        assertThatThrownBy(() -> executor.readOnlyJdbc().execute(con -> {
            try (Statement st = con.createStatement()) {
                return st.execute(sql);
            }
        })).isInstanceOf(SQLException.class).hasMessageContaining("SQLITE_READONLY");
        assertThat(executor.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.SQLITE);
        assertUnchanged();
        assertPooledConnectionRestoredAndWritable();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "INSERT INTO T (ID, NM) VALUES (99, 'x') RETURNING ID",
            "UPDATE T SET NM = 'x' RETURNING ID",
            "DELETE FROM T RETURNING ID"})
    @DisplayName("SqlGuard 를 거치지 않은 쓰기 문장을 실행 경로(execute)에 넣어도 SQLITE_READONLY 로 거절된다 — RETURNING 이라 실제로 실행된다")
    void writesBelowGuardOnExecutePathAreRejected(String sql) {
        assertThatThrownBy(() -> SqlGuard.check(sql)).isInstanceOf(BusinessException.class); // 1차 방어선이 막는 문장을 아래층에 직접 넣는다
        assertThatThrownBy(() -> executor.execute(sql, Map.of(), 50))
                .satisfies(e -> assertThat(rootMessage(e)).contains("SQLITE_READONLY"));
        assertUnchanged();
        assertPooledConnectionRestoredAndWritable();
    }

    @Test
    @DisplayName("결과 없는 CREATE TABLE … AS SELECT 도 실행 경로에서 실패하고 표가 생기지 않는다")
    void createTableOnExecutePathLeavesNoTable() {
        assertThatThrownBy(() -> executor.execute("CREATE TABLE EVIL AS SELECT * FROM T", Map.of(), 50))
                .isInstanceOf(RuntimeException.class);
        assertUnchanged();
        assertPooledConnectionRestoredAndWritable();
    }

    // ── 사용자 입력 조건(SQLite) ─────────────────────────────────────

    @Test
    @DisplayName("입력 조건: 값 없는 선택 조건은 (:x IS NULL OR COL = :x) 로 전체를 돌려주고, 값이 있으면(text·number) 거르며, 인젝션 문자열은 값일 뿐이다")
    void userParamsOnSqlite() {
        admin.execute("CREATE TABLE P (ID INTEGER PRIMARY KEY, NM TEXT, QTY NUMERIC)");
        admin.update("INSERT INTO P (ID, NM, QTY) VALUES (1, 'a', 5), (2, 'b', 10.5), (3, 'c', 20), (4, ?, 1)", "' OR 1=1 --");
        def("def.opt", "SELECT ID FROM P WHERE (:nm IS NULL OR NM = :nm) AND (:min IS NULL OR QTY >= :min) ORDER BY ID",
                "[{\"name\":\"nm\",\"type\":\"text\"},{\"name\":\"min\",\"type\":\"number\"}]");

        assertThat(ids("def.opt", Map.of())).containsExactly(1, 2, 3, 4);
        assertThat(ids("def.opt", Map.of("nm", "  ", "min", ""))).containsExactly(1, 2, 3, 4);
        assertThat(ids("def.opt", Map.of("nm", "b"))).containsExactly(2);
        assertThat(ids("def.opt", Map.of("min", "10.5"))).containsExactly(2, 3);
        assertThat(ids("def.opt", Map.of("nm", "' OR 1=1 --"))).containsExactly(4);
        assertThat(ids("def.opt", Map.of("nm", "x' OR '1'='1"))).isEmpty();
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM P", Long.class)).isEqualTo(4L);
        assertPooledConnectionRestoredAndWritable();
    }

    private List<Integer> ids(String defId, Map<String, String> values) {
        return executor.runDefinition(defId, 500, values).rows().stream().map(r -> ((Number) r.get("ID")).intValue()).toList();
    }

    // ── 풀 연결 복원 ─────────────────────────────────────────────────

    @Test
    @DisplayName("성공·실패 실행 뒤 풀(1개)의 같은 물리 연결이 query_only=0·readOnly=false·autoCommit=true 로 업무 쓰기를 한다")
    void pooledConnectionIsRestoredAfterSuccessAndFailure() throws Exception {
        Connection physical = physicalConnection();
        def("def.count", "SELECT COUNT(*) AS CNT FROM T");
        assertThat(((Number) executor.runDefinition("def.count", 500).rows().get(0).get("CNT")).longValue()).isEqualTo(3L);
        assertPooledConnectionRestoredAndWritable();

        assertThatThrownBy(() -> executor.execute("DELETE FROM T RETURNING ID", Map.of(), 50)).isInstanceOf(RuntimeException.class);
        assertPooledConnectionRestoredAndWritable();

        assertThatThrownBy(() -> executor.preview("mcm", "SELECT * FROM NO_SUCH_TABLE", 50)).isInstanceOf(BusinessException.class);
        assertPooledConnectionRestoredAndWritable();

        assertThat(physicalConnection()).isSameAs(physical); // 빼고 새로 만든 연결이 아니라 되돌린 그 연결이다
        assertThat(pool.getHikariPoolMXBean().getTotalConnections()).isEqualTo(1);
    }

    @Test
    @DisplayName("바깥 업무 트랜잭션(같은 DataSource) 안에서 불러도 그 연결을 쓰지 않고, 바깥 연결은 계속 쓸 수 있다")
    void doesNotUseOrLockOuterBusinessTransaction() {
        HikariDataSource pool2 = hikari(url, 2);
        WidgetQueryExecutor ex2 = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(pool2), Clock.systemUTC());
        def("def.count", "SELECT COUNT(*) AS CNT FROM T");
        JdbcTemplate biz = new JdbcTemplate(pool2);

        new TransactionTemplate(new DataSourceTransactionManager(pool2)).executeWithoutResult(status -> {
            biz.update("INSERT INTO T (ID, NM) VALUES (100, 'outer1')"); // 바깥 연결에서 아직 커밋 전
            Object cnt = ex2.runDefinition("def.count", 500).rows().get(0).get("CNT");
            assertThat(((Number) cnt).longValue()).isEqualTo(3L); // 다른 연결에서 돌았다 — 커밋 전 바깥 쓰기가 안 보인다
            try {
                Connection outer = DataSourceUtils.getConnection(pool2);
                assertThat(outer.isReadOnly()).isFalse();
                assertThat(pragmaQueryOnly(outer)).isEqualTo("0");
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
            biz.update("INSERT INTO T (ID, NM) VALUES (101, 'outer2')"); // 바깥은 여전히 쓸 수 있다
        });

        assertThat(admin.queryForObject("SELECT COUNT(*) FROM T WHERE NM LIKE 'outer%'", Long.class)).isEqualTo(2L);
    }

    @Test
    @DisplayName("query_only 를 되돌리지 못한 연결은 먼저 끊고(abort) 그다음 풀에서 빠진다 — 다음에 빌리는 연결은 새 물리 연결이고 업무 쓰기를 한다")
    void connectionThatCannotBeRestoredIsEvicted() throws Exception {
        AtomicBoolean failRestore = new AtomicBoolean(true);
        List<String> calls = new CopyOnWriteArrayList<>(); // 물리 연결 abort·close 는 Hikari 닫기 스레드에서도 적힌다
        HikariDataSource faulty = new HikariDataSource() {
            @Override
            public void evictConnection(Connection connection) {
                calls.add("evict");
                super.evictConnection(connection);
            }
        };
        faulty.setPoolName("widget-query-test-faulty");
        faulty.setMaximumPoolSize(1);
        faulty.setDataSource(failingRestoreDataSource(new DriverManagerDataSource(url), failRestore, calls));
        extraPools.add(faulty);
        Connection before;
        try (Connection c = faulty.getConnection()) {
            before = c.unwrap(Connection.class);
        }
        calls.clear();

        WidgetReadOnlyJdbc ro = new WidgetReadOnlyJdbc(faulty);
        Integer one = ro.execute(con -> 1);
        assertThat(one).isEqualTo(1);

        // Hikari 7 의 evictConnection 은 물리 close 를 다른 스레드에 넘긴다 — 끊기가 빼기보다 먼저여야 그 close(닫을 때 커밋하는
        // 드라이버라면 커밋)가 끊기 전에 돌 수 없다. 물리 close 는 닫기 스레드가 하므로 적힐 때까지 기다린다.
        assertThat(calls).contains("abort:physical", "evict");
        assertThat(calls.indexOf("abort:physical")).isLessThan(calls.indexOf("evict"));
        long deadline = System.nanoTime() + java.util.concurrent.TimeUnit.SECONDS.toNanos(5);
        while (!calls.contains("close:physical") && System.nanoTime() < deadline) Thread.sleep(10);
        assertThat(calls).contains("close:physical");
        assertThat(calls.indexOf("abort:physical")).isLessThan(calls.indexOf("close:physical"));

        failRestore.set(false);
        try (Connection c = faulty.getConnection()) {
            assertThat(c.unwrap(Connection.class)).isNotSameAs(before);
            assertThat(pragmaQueryOnly(c)).isEqualTo("0");
            try (Statement st = c.createStatement()) {
                st.executeUpdate("INSERT INTO T (ID, NM) VALUES (200, 'after-evict')");
            }
        }
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM T WHERE ID = 200", Long.class)).isEqualTo(1L);
    }

    @Test
    @DisplayName("풀이 Hikari 가 아니면 되돌리지 못한 연결을 abort 로 끊는다")
    void nonHikariConnectionThatCannotBeRestoredIsAborted() throws Exception {
        Script script = new Script("H2");
        script.failOn = "setAutoCommit(true)";
        String ok = new WidgetReadOnlyJdbc(script.dataSource()).execute(con -> "ok");
        assertThat(ok).isEqualTo("ok");
        assertThat(script.calls).contains("abort", "close");
    }

    // ── 전용 DataSource ──────────────────────────────────────────────

    @Test
    @DisplayName("dmes.widget.query.datasource.url 이 있으면 전용 풀을 쓰고, 없으면 기본 DataSource, url 없이 계정만 있으면 기동을 막는다")
    void usesDedicatedDataSourceWhenConfigured() throws Exception {
        String urlB = "jdbc:sqlite:" + dir.resolve("readonly-account.db");
        JdbcTemplate b = new JdbcTemplate(new DriverManagerDataSource(urlB));
        b.execute("CREATE TABLE ONLY_B (ID INTEGER)");
        b.update("INSERT INTO ONLY_B (ID) VALUES (7)");

        WidgetQueryProperties props = new WidgetQueryProperties();
        props.getDatasource().setUrl(urlB);
        props.getDatasource().setDriverClassName("org.sqlite.JDBC");
        props.getDatasource().setPassword("secret-pw");
        WidgetQueryDataSource dedicated = WidgetQueryConfig.create(props, () -> pool);
        try {
            assertThat(dedicated.dedicated()).isTrue();
            assertThat(dedicated.dataSource()).isNotSameAs(pool);
            assertThat(props.toString()).doesNotContain("secret-pw").doesNotContain(urlB);
            WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, dedicated);
            Object cnt = ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM ONLY_B", 50).rows().get(0).get("CNT");
            assertThat(((Number) cnt).longValue()).isEqualTo(1L);
            assertThatThrownBy(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM T", 50))
                    .isInstanceOf(BusinessException.class).hasMessageContaining("no such table");
        } finally {
            dedicated.destroy();
        }
        assertThat(((HikariDataSource) dedicated.dataSource()).isClosed()).isTrue();

        WidgetQueryDataSource shared = WidgetQueryConfig.create(new WidgetQueryProperties(), () -> pool);
        assertThat(shared.dedicated()).isFalse();
        assertThat(shared.dataSource()).isSameAs(pool);

        WidgetQueryProperties bad = new WidgetQueryProperties();
        bad.getDatasource().setUsername("widget_ro");
        assertThatThrownBy(() -> WidgetQueryConfig.create(bad, () -> pool)).isInstanceOf(IllegalStateException.class);
    }

    // ── PostgreSQL·Oracle 문장 순서(대본 연결) ──────────────────────────

    @Test
    @DisplayName("PostgreSQL — readOnly·자동 커밋 끔 뒤 SET TRANSACTION READ ONLY, transaction_read_only=on 확인 뒤 실행, 끝나면 롤백·되돌리기")
    void postgresqlSequence() throws Exception {
        Script script = new Script("PostgreSQL");
        script.showReadOnly = "on";
        Integer one = new WidgetReadOnlyJdbc(script.dataSource()).execute(con -> {
            script.calls.add("WORK");
            return 1;
        });
        assertThat(one).isEqualTo(1);
        assertThat(script.calls).containsSubsequence("setReadOnly(true)", "setAutoCommit(false)",
                "execute:SET TRANSACTION READ ONLY", "query:SHOW transaction_read_only", "WORK", "rollback",
                "setAutoCommit(true)", "setReadOnly(false)", "close");
        assertThat(script.calls).doesNotContain("commit", "abort");
        assertThat(script.autoCommit).isTrue();
        assertThat(script.readOnly).isFalse();
    }

    @Test
    @DisplayName("PostgreSQL — 실행 중 실패해도 롤백 뒤 autoCommit·readOnly 를 되돌려 돌려준다(커밋·끊기 없음)")
    void postgresqlRestoresAfterWorkFailure() {
        Script script = new Script("PostgreSQL");
        assertThatThrownBy(() -> new WidgetReadOnlyJdbc(script.dataSource()).execute(con -> {
            try (Statement st = con.createStatement()) {
                st.execute("SELECT broken");
            }
            throw new SQLException("relation does not exist");
        })).isInstanceOf(SQLException.class).hasMessageContaining("relation");
        assertThat(script.calls).containsSubsequence("execute:SELECT broken", "rollback", "setAutoCommit(true)", "setReadOnly(false)", "close");
        assertThat(script.calls).doesNotContain("commit", "abort");
    }

    @Test
    @DisplayName("롤백이 실패하면 autoCommit 을 켜지 않고(열린 트랜잭션 커밋 방지) readOnly 도 그대로 둔 채 연결을 끊는다")
    void rollbackFailureDiscardsWithoutCommit() throws Exception {
        Script script = new Script("PostgreSQL");
        script.failOn = "rollback";
        Integer one = new WidgetReadOnlyJdbc(script.dataSource()).execute(con -> 1);
        assertThat(one).isEqualTo(1);
        assertThat(script.calls).contains("rollback", "abort", "close")
                .doesNotContain("setAutoCommit(true)", "setReadOnly(false)", "commit");
        assertThat(script.calls.indexOf("abort")).isLessThan(script.calls.indexOf("close")); // 반납 처리 전에 끊는다
    }

    @Test
    @DisplayName("PostgreSQL — transaction_read_only 가 on 이 아니면 SQL 을 실행하지 않는다(실패 닫힘), 연결은 되돌려 돌려준다")
    void postgresqlFailsClosedWhenNotReadOnly() {
        Script script = new Script("PostgreSQL");
        script.showReadOnly = "off";
        assertThatThrownBy(() -> new WidgetReadOnlyJdbc(script.dataSource()).execute(con -> {
            script.calls.add("WORK");
            return 1;
        })).isInstanceOf(SQLException.class).hasMessageContaining("읽기 전용");
        assertThat(script.calls).doesNotContain("WORK", "commit", "abort")
                .containsSubsequence("rollback", "setAutoCommit(true)", "setReadOnly(false)", "close");
    }

    @Test
    @DisplayName("Oracle — SET TRANSACTION READ ONLY 뒤 실행, 그 문장이 실패하면(예: ORA-01453) SQL 을 실행하지 않는다")
    void oracleSequenceAndFailClosed() throws Exception {
        Script ok = new Script("Oracle");
        new WidgetReadOnlyJdbc(ok.dataSource()).execute(con -> {
            ok.calls.add("WORK");
            return 1;
        });
        assertThat(ok.calls).containsSubsequence("setReadOnly(true)", "setAutoCommit(false)",
                "execute:SET TRANSACTION READ ONLY", "WORK", "rollback", "setAutoCommit(true)", "setReadOnly(false)", "close");
        assertThat(ok.calls).doesNotContain("commit", "abort");

        Script bad = new Script("Oracle");
        bad.failOn = "execute:SET TRANSACTION READ ONLY";
        assertThatThrownBy(() -> new WidgetReadOnlyJdbc(bad.dataSource()).execute(con -> {
            bad.calls.add("WORK");
            return 1;
        })).isInstanceOf(SQLException.class);
        assertThat(bad.calls).doesNotContain("WORK", "commit", "abort")
                .containsSubsequence("rollback", "setAutoCommit(true)", "setReadOnly(false)", "close");
    }

    @Test
    @DisplayName("제품 이름 → 갈래")
    void dialectOfProductName() {
        assertThat(WidgetReadOnlyJdbc.dialectOf("SQLite")).isEqualTo(WidgetReadOnlyJdbc.Dialect.SQLITE);
        assertThat(WidgetReadOnlyJdbc.dialectOf("PostgreSQL")).isEqualTo(WidgetReadOnlyJdbc.Dialect.POSTGRESQL);
        assertThat(WidgetReadOnlyJdbc.dialectOf("Oracle")).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);
        assertThat(WidgetReadOnlyJdbc.dialectOf("Microsoft SQL Server")).isEqualTo(WidgetReadOnlyJdbc.Dialect.SQLSERVER);
        assertThat(WidgetReadOnlyJdbc.dialectOf("H2")).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(WidgetReadOnlyJdbc.dialectOf(null)).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
    }

    // ── helpers ─────────────────────────────────────────────────────

    private HikariDataSource hikari(String jdbcUrl, int size) {
        HikariDataSource ds = new HikariDataSource();
        ds.setPoolName("widget-query-test-" + size);
        ds.setJdbcUrl(jdbcUrl);
        ds.setMaximumPoolSize(size);
        if (size != 1) extraPools.add(ds);
        return ds;
    }

    private Connection physicalConnection() throws SQLException {
        try (Connection c = pool.getConnection()) {
            return c.unwrap(Connection.class);
        }
    }

    private void assertUnchanged() {
        assertThat(admin.queryForList("SELECT ID, NM FROM T WHERE ID <= 3 ORDER BY ID"))
                .extracting(r -> r.get("NM")).containsExactly("a", "b", "c");
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM T WHERE ID = 99 OR NM = 'x'", Long.class)).isZero();
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM sqlite_master WHERE name = 'EVIL'", Long.class)).isZero();
    }

    /** 풀(1개)에서 다시 빌린 연결 = 실행기가 쓴 그 연결. 상태가 되돌려졌고 업무 쓰기가 다른 연결에서 보인다. */
    private void assertPooledConnectionRestoredAndWritable() {
        long before = admin.queryForObject("SELECT COUNT(*) FROM T WHERE NM = 'biz'", Long.class);
        try (Connection c = pool.getConnection()) {
            assertThat(c.getAutoCommit()).isTrue();
            assertThat(c.isReadOnly()).isFalse();
            assertThat(pragmaQueryOnly(c)).isEqualTo("0");
            try (Statement st = c.createStatement()) {
                st.executeUpdate("INSERT INTO T (NM) VALUES ('biz')");
            }
        } catch (SQLException e) {
            throw new AssertionError("풀 연결로 업무 쓰기를 하지 못했습니다: " + e.getMessage(), e);
        }
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM T WHERE NM = 'biz'", Long.class)).isEqualTo(before + 1);
    }

    private static String pragmaQueryOnly(Connection c) throws SQLException {
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("PRAGMA query_only")) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    private void def(String id, String sql) {
        def(id, sql, null);
    }

    private void def(String id, String sql, String paramsJson) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(id);
        d.setSrcTp(WidgetDef.SRC_DEF);
        d.setTypeId("query-number");
        d.setUseYn("Y");
        d.setDataSrc("mcm");
        try {
            com.fasterxml.jackson.databind.node.ObjectNode config = JSON.createObjectNode();
            config.put("sql", sql);
            if (paramsJson != null) config.set("params", JSON.readTree(paramsJson));
            d.setConfigJson(JSON.writeValueAsString(config));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        when(defRepository.findById(id)).thenReturn(Optional.of(d));
    }

    private static String rootMessage(Throwable e) {
        Throwable root = e;
        while (root.getCause() != null && root.getCause() != root) root = root.getCause();
        return String.valueOf(root.getMessage());
    }

    /**
     * 실제 SQLite 연결이지만 {@code PRAGMA query_only = 0}(되돌리기)을 실패시키는 DataSource — failRestore 가 켜진 동안만.
     * 물리 연결의 abort·close 를 calls 에 {@code abort:physical}·{@code close:physical} 로 적는다.
     */
    private static DataSource failingRestoreDataSource(DataSource target, AtomicBoolean failRestore, List<String> calls) {
        return (DataSource) Proxy.newProxyInstance(WidgetQueryReadOnlyTest.class.getClassLoader(), new Class<?>[] {DataSource.class},
                (p, m, a) -> {
                    Object out = invoke(m, target, a);
                    if (!"getConnection".equals(m.getName())) return out;
                    Connection real = (Connection) out;
                    return Proxy.newProxyInstance(WidgetQueryReadOnlyTest.class.getClassLoader(), new Class<?>[] {Connection.class},
                            (cp, cm, ca) -> {
                                if ("abort".equals(cm.getName()) || "close".equals(cm.getName())) calls.add(cm.getName() + ":physical");
                                if (!"createStatement".equals(cm.getName())) return invoke(cm, real, ca);
                                Statement st = (Statement) invoke(cm, real, ca);
                                return Proxy.newProxyInstance(WidgetQueryReadOnlyTest.class.getClassLoader(),
                                        new Class<?>[] {Statement.class}, (sp, sm, sa) -> {
                                            if ("execute".equals(sm.getName()) && failRestore.get()
                                                    && String.valueOf(sa[0]).contains("query_only = 0")) {
                                                throw new SQLException("되돌리기 실패(시험)");
                                            }
                                            return invoke(sm, st, sa);
                                        });
                            });
                });
    }

    private static Object invoke(java.lang.reflect.Method m, Object target, Object[] args) throws Throwable {
        try {
            return m.invoke(target, args);
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }

    /**
     * 실제 DB 없이 연결 호출 순서를 적는 대본 연결. SHOW transaction_read_only 는 showReadOnly 를 돌려준다.
     * 트랜잭션 규칙은 JDBC 규약과 pgjdbc 42.7.8 실제 동작을 흉내 낸다 — autoCommit 이 꺼진 채 문장을 실행하면 트랜잭션이 열리고,
     * 열린 트랜잭션에서 {@code setReadOnly} 는 예외("Cannot change transaction read-only property in the middle of a transaction."),
     * autoCommit 을 켜면 커밋(기록 {@code commit}), autoCommit 에서 {@code rollback} 은 예외. 롤백·커밋은 트랜잭션을 닫는다.
     */
    private static final class Script {
        final String product;
        final List<String> calls = new ArrayList<>();
        String showReadOnly = "on";
        String failOn;
        boolean autoCommit = true;
        boolean readOnly;
        boolean txOpen;

        Script(String product) {
            this.product = product;
        }

        DataSource dataSource() {
            return (DataSource) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {DataSource.class},
                    (p, m, a) -> {
                        if ("getConnection".equals(m.getName())) return connection();
                        if ("isWrapperFor".equals(m.getName())) return false;
                        throw new UnsupportedOperationException(m.getName());
                    });
        }

        private Connection connection() {
            return (Connection) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {Connection.class},
                    (p, m, a) -> {
                        String call = switch (m.getName()) {
                            case "setReadOnly", "setAutoCommit" -> m.getName() + "(" + a[0] + ")";
                            default -> m.getName();
                        };
                        switch (m.getName()) {
                            case "getMetaData" -> {
                                return metaData();
                            }
                            case "getAutoCommit" -> {
                                return autoCommit;
                            }
                            case "isReadOnly" -> {
                                return readOnly;
                            }
                            case "isClosed" -> {
                                return false;
                            }
                            case "createStatement" -> {
                                return statement();
                            }
                            default -> {
                                // 아래에서 기록
                            }
                        }
                        calls.add(call);
                        if (call.equals(failOn)) throw new SQLException("대본 실패: " + call);
                        switch (m.getName()) {
                            case "setAutoCommit" -> {
                                boolean on = (Boolean) a[0];
                                if (on && !autoCommit && txOpen) {
                                    calls.add("commit"); // JDBC 규약: 트랜잭션 중 autoCommit 을 바꾸면 커밋한다
                                    txOpen = false;
                                }
                                autoCommit = on;
                            }
                            case "setReadOnly" -> {
                                if (txOpen) {
                                    throw new SQLException("Cannot change transaction read-only property in the middle of a transaction.");
                                }
                                readOnly = (Boolean) a[0];
                            }
                            case "rollback", "commit" -> {
                                if (autoCommit) throw new SQLException("Cannot " + m.getName() + " when autoCommit is enabled.");
                                txOpen = false;
                            }
                            default -> {
                                // close·abort 등은 기록만
                            }
                        }
                        return null;
                    });
        }

        /** autoCommit 이 꺼진 채 문장을 실행하면 트랜잭션이 열린다(pgjdbc 는 첫 문장 앞에 BEGIN 을 보낸다). */
        private void statementRan() {
            if (!autoCommit) txOpen = true;
        }

        private DatabaseMetaData metaData() {
            return (DatabaseMetaData) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {DatabaseMetaData.class},
                    (p, m, a) -> {
                        if ("getDatabaseProductName".equals(m.getName())) return product;
                        throw new UnsupportedOperationException(m.getName());
                    });
        }

        private Statement statement() {
            return (Statement) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {Statement.class},
                    (p, m, a) -> switch (m.getName()) {
                        case "execute" -> {
                            String call = "execute:" + a[0];
                            calls.add(call);
                            statementRan();
                            if (call.equals(failOn)) throw new SQLException("대본 실패: " + call);
                            yield false;
                        }
                        case "executeQuery" -> {
                            calls.add("query:" + a[0]);
                            statementRan();
                            yield resultSet(showReadOnly);
                        }
                        case "close" -> null;
                        default -> throw new UnsupportedOperationException(m.getName());
                    });
        }

        private ResultSet resultSet(String value) {
            boolean[] read = {false};
            return (ResultSet) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[] {ResultSet.class},
                    (p, m, a) -> switch (m.getName()) {
                        case "next" -> {
                            boolean has = !read[0];
                            read[0] = true;
                            yield has;
                        }
                        case "getString" -> value;
                        case "close" -> null;
                        default -> throw new UnsupportedOperationException(m.getName());
                    });
        }
    }
}
