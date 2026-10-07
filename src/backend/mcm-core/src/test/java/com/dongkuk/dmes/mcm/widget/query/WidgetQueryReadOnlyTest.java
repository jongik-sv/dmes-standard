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
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.DriverManager;
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
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 쿼리 위젯 실행기 읽기 전용 강제 — 실제 Oracle 시험 PDB({@link McmCoreOraTestDb}, MCMAPUSER) + Hikari 풀(운영과 같은 구성)로 확인한다(스펙 §7.3).
 * 시험 전용 표는 {@code T_C4_RO_*} 접두다.
 * <ul>
 *   <li>검사(SqlGuard)를 거치지 않고 실행 경로 아래층에 쓰기 문장을 넣어도 읽기 전용 트랜잭션({@code SET TRANSACTION READ ONLY})이
 *       INSERT·UPDATE·DELETE·MERGE·{@code FOR UPDATE} 를 ORA-01456 으로 거절하고 DB 는 그대로다.
 *       막지 못하는 것 — 시퀀스 {@code NEXTVAL}·DDL(암묵 커밋)·자율 트랜잭션 함수 — 은 {@link SqlGuard} 와 운영 읽기 계정 권한 몫이다(2026-10-07 실측).</li>
 *   <li>실행 뒤 같은 풀의 <b>같은 물리 연결</b>이 readOnly·autoCommit 이 되돌려진 채 업무 쓰기를 한다(성공·실패 모두 —
 *       읽기 전용 트랜잭션이 새지 않는다).</li>
 *   <li>바깥 업무 트랜잭션(같은 DataSource)의 연결을 쓰지도, 읽기 전용으로 만들지도 않는다.</li>
 *   <li>되돌리지 못한 연결은 풀에서 빠진다. 전용 DataSource 설정이 있으면 그것(다른 스키마 계정 MCM_SOURCE)을 쓴다.</li>
 *   <li>PostgreSQL·Oracle 문장 순서와 실패 닫힘은 실제 DB 없이 대본 연결로 확인한다(읽기 전용을 걸지 못하면 SQL 을 실행하지 않는다).
 *       대본 연결은 JDBC 규약과 pgjdbc 실제 제약을 흉내 낸다 — 트랜잭션 중 {@code setReadOnly} 는 예외, 트랜잭션 중 autoCommit 을 켜면
 *       커밋(기록에 {@code commit}), autoCommit 에서 롤백은 예외. 실 PostgreSQL 확인은 스펙 §7.3(2026-10-03 실측).</li>
 * </ul>
 */
class WidgetQueryReadOnlyTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final String TBL_T = "T_C4_RO_T";
    private static final String TBL_P = "T_C4_RO_P";
    private static final String TBL_EVIL = "T_C4_RO_EVIL";
    private static final String TBL_ONLY_B = "T_C4_RO_ONLYB";
    /** 전용 DataSource 시험의 읽기 계정 — 앱 기본(MCMAPUSER)과 다른 스키마라 서로의 표가 보이지 않는다. */
    private static final String OTHER_USER = McmCoreOraTestDb.SCHEMAS.get(1);

    /** 확인용 풀 — 시험 대상 풀과 따로 두어 다른 연결에서 본 값(커밋된 것)만 확인한다. */
    private static HikariDataSource adminPool;

    private JdbcTemplate admin;
    private HikariDataSource pool;
    private WidgetDefRepository defRepository;
    private WidgetUserContextResolver resolver;
    private WidgetQueryExecutor executor;
    private final List<HikariDataSource> extraPools = new ArrayList<>();
    private int bizId = 1000;

    @BeforeAll
    static void createTables() {
        adminPool = McmCoreOraTestDb.appDataSource("widget-query-ro-admin");
        JdbcTemplate ddl = new JdbcTemplate(adminPool);
        dropTable(ddl, TBL_T);
        dropTable(ddl, TBL_P);
        dropTable(ddl, TBL_EVIL);
        ddl.execute("CREATE TABLE " + TBL_T + " (ID NUMBER(10) PRIMARY KEY, NM VARCHAR2(50))");
        ddl.execute("CREATE TABLE " + TBL_P + " (ID NUMBER(10) PRIMARY KEY, NM VARCHAR2(50), QTY NUMBER, OWNER_ID VARCHAR2(20))");
        McmCoreOraTestDb.awaitReadOnlyReadable(McmCoreOraTestDb.APP_USER, TBL_T, TBL_P); // ORA-01466 — 만든 직후 읽기 전용 스냅샷
    }

    @AfterAll
    static void dropTablesAndClosePool() {
        try {
            JdbcTemplate ddl = new JdbcTemplate(adminPool);
            dropTable(ddl, TBL_T);
            dropTable(ddl, TBL_P);
            dropTable(ddl, TBL_EVIL);
        } finally {
            adminPool.close();
        }
    }

    @BeforeEach
    void setUp() {
        admin = new JdbcTemplate(adminPool); // 확인용 — 시험 대상 풀과 다른 연결
        admin.update("DELETE FROM " + TBL_T);
        admin.update("DELETE FROM " + TBL_P);
        admin.update("INSERT INTO " + TBL_T + " (ID, NM) VALUES (1, 'a')");
        admin.update("INSERT INTO " + TBL_T + " (ID, NM) VALUES (2, 'b')");
        admin.update("INSERT INTO " + TBL_T + " (ID, NM) VALUES (3, 'c')");
        pool = hikari(1);
        defRepository = mock(WidgetDefRepository.class);
        resolver = mock(WidgetUserContextResolver.class);
        executor = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(pool), Clock.systemUTC());
    }

    @AfterEach
    void tearDown() {
        pool.close();
        extraPools.forEach(HikariDataSource::close);
    }

    /** 표가 있으면 지운다(ORA-00942 만 무시). */
    private static void dropTable(JdbcTemplate jdbc, String table) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + table + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }

    // ── 쓰기 거절 ────────────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {
            "INSERT INTO " + TBL_T + " (ID, NM) VALUES (99, 'x')",
            "UPDATE " + TBL_T + " SET NM = 'x'",
            "DELETE FROM " + TBL_T,
            "MERGE INTO " + TBL_T + " t USING DUAL ON (t.ID = 1) WHEN MATCHED THEN UPDATE SET t.NM = 'x'",
            "SELECT ID FROM " + TBL_T + " FOR UPDATE"})
    @DisplayName("읽기 전용 연결 범위 안에서 쓰기·잠금 문장을 직접 실행하면 ORA-01456 으로 거절되고 DB 는 바뀌지 않는다")
    void writesInsideReadOnlyScopeAreRejected(String sql) {
        assertThatThrownBy(() -> executor.readOnlyJdbc().execute(con -> {
            try (Statement st = con.createStatement()) {
                return st.execute(sql);
            }
        })).isInstanceOf(SQLException.class).hasMessageContaining("ORA-01456");
        assertThat(executor.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);
        assertUnchanged();
        assertPooledConnectionRestoredAndWritable();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "INSERT INTO " + TBL_T + " (ID, NM) VALUES (99, 'x')",
            "UPDATE " + TBL_T + " SET NM = 'x'",
            "DELETE FROM " + TBL_T})
    @DisplayName("SqlGuard 를 거치지 않은 쓰기 문장을 실행 경로(execute)에 넣어도 ORA-01456 으로 거절된다")
    void writesBelowGuardOnExecutePathAreRejected(String sql) {
        assertThatThrownBy(() -> SqlGuard.check(sql)).isInstanceOf(BusinessException.class); // 1차 방어선이 막는 문장을 아래층에 직접 넣는다
        assertThatThrownBy(() -> executor.execute(sql, Map.of(), 50))
                .satisfies(e -> assertThat(rootMessage(e)).contains("ORA-01456"));
        assertUnchanged();
        assertPooledConnectionRestoredAndWritable();
    }

    @Test
    @DisplayName("DDL 은 Oracle 읽기 전용 트랜잭션이 막지 못한다(암묵 커밋) — 1차 방어선 SqlGuard 가 거절하고 표가 생기지 않는다")
    void createTableIsRejectedByGuardBeforeReachingTheDatabase() {
        String ddl = "CREATE TABLE " + TBL_EVIL + " AS SELECT * FROM " + TBL_T;
        assertThatThrownBy(() -> SqlGuard.check(ddl)).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> executor.preview("mcm", ddl, 50)).isInstanceOf(BusinessException.class);
        assertUnchanged();
        assertPooledConnectionRestoredAndWritable();
    }

    // ── 사용자 입력 조건(Oracle) ─────────────────────────────────────

    @Test
    @DisplayName("입력 조건: 값 없는 선택 조건은 (:x IS NULL OR COL = :x) 로 전체를 돌려주고, 값이 있으면(text·number) 거르며, 인젝션 문자열은 값일 뿐이다")
    void userParamsOnOracle() {
        insertP(1, "a", "5", null);
        insertP(2, "b", "10.5", null);
        insertP(3, "c", "20", null);
        admin.update("INSERT INTO " + TBL_P + " (ID, NM, QTY) VALUES (4, ?, 1)", "' OR 1=1 --");
        def("def.opt", "SELECT ID FROM " + TBL_P + " WHERE (:nm IS NULL OR NM = :nm) AND (:min IS NULL OR QTY >= :min) ORDER BY ID",
                "[{\"name\":\"nm\",\"type\":\"text\"},{\"name\":\"min\",\"type\":\"number\"}]");

        assertThat(ids("def.opt", Map.of())).containsExactly(1, 2, 3, 4);
        assertThat(ids("def.opt", Map.of("nm", "  ", "min", ""))).containsExactly(1, 2, 3, 4);
        assertThat(ids("def.opt", Map.of("nm", "b"))).containsExactly(2);
        assertThat(ids("def.opt", Map.of("min", "10.5"))).containsExactly(2, 3);
        assertThat(ids("def.opt", Map.of("nm", "' OR 1=1 --"))).containsExactly(4);
        assertThat(ids("def.opt", Map.of("nm", "x' OR '1'='1"))).isEmpty();
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL_P, Long.class)).isEqualTo(4L);
        assertPooledConnectionRestoredAndWritable();
    }

    @Test
    @DisplayName("입력 조건(Oracle): \\:userId·@x·$x·$1 자리 밀기 SQL 은 거절하고, 10·1E+1·10.0 은 같은 값으로 같은 결과를 낸다")
    void userParamsPlaceholderShiftAndNumberNormalizationOnOracle() {
        insertP(1, "a", "5", "u1");
        insertP(2, "b", "10", "u2");
        insertP(3, "c", "20", "u3");
        for (String leak : List.of("\\:userId", "@userId", "$userId", "$1")) {
            def("def.leak", "SELECT ID FROM " + TBL_P + " WHERE OWNER_ID = " + leak + " OR QTY = :p", "[{\"name\":\"p\",\"type\":\"number\"}]");
            assertThatThrownBy(() -> executor.runDefinition("def.leak", 500, Map.of("p", "10")))
                    .as(leak).isInstanceOf(BusinessException.class).hasMessage(SqlGuard.MSG_DB_PLACEHOLDER);
        }
        def("def.norm", "SELECT ID FROM " + TBL_P + " WHERE QTY >= :min ORDER BY ID", "[{\"name\":\"min\",\"type\":\"number\"}]");
        for (String text : List.of("10", "1E+1", "10.0", "1e1", "100E-1")) {
            assertThat(ids("def.norm", Map.of("min", text))).as(text).containsExactly(2, 3);
        }
        assertThat(executor.cacheSize()).isEqualTo(1);
    }

    private void insertP(int id, String nm, String qty, String ownerId) {
        admin.update("INSERT INTO " + TBL_P + " (ID, NM, QTY, OWNER_ID) VALUES (?, ?, ?, ?)", id, nm, new java.math.BigDecimal(qty), ownerId);
    }

    private List<Integer> ids(String defId, Map<String, String> values) {
        return executor.runDefinition(defId, 500, values).rows().stream().map(r -> ((Number) r.get("ID")).intValue()).toList();
    }

    // ── 풀 연결 복원 ─────────────────────────────────────────────────

    @Test
    @DisplayName("성공·실패 실행 뒤 풀(1개)의 같은 물리 연결이 readOnly=false·autoCommit=true 로 업무 쓰기를 한다 — 읽기 전용 트랜잭션이 새지 않는다")
    void pooledConnectionIsRestoredAfterSuccessAndFailure() throws Exception {
        Connection physical = physicalConnection();
        def("def.count", "SELECT COUNT(*) AS CNT FROM " + TBL_T);
        assertThat(((Number) executor.runDefinition("def.count", 500).rows().get(0).get("CNT")).longValue()).isEqualTo(3L);
        assertPooledConnectionRestoredAndWritable();

        assertThatThrownBy(() -> executor.execute("DELETE FROM " + TBL_T, Map.of(), 50)).isInstanceOf(RuntimeException.class);
        assertPooledConnectionRestoredAndWritable();

        assertThatThrownBy(() -> executor.preview("mcm", "SELECT * FROM NO_SUCH_TABLE", 50)).isInstanceOf(BusinessException.class);
        assertPooledConnectionRestoredAndWritable();

        assertThat(physicalConnection()).isSameAs(physical); // 빼고 새로 만든 연결이 아니라 되돌린 그 연결이다
        assertThat(pool.getHikariPoolMXBean().getTotalConnections()).isEqualTo(1);

        // 같은 연결로 이어지는 업무 트랜잭션(autoCommit 끔 → 쓰기 → 커밋)도 정상 — 읽기 전용 상태가 남았다면 ORA-01456
        try (Connection c = pool.getConnection(); Statement st = c.createStatement()) {
            c.setAutoCommit(false);
            st.executeUpdate("INSERT INTO " + TBL_T + " (ID, NM) VALUES (" + (bizId++) + ", 'tx')");
            c.commit();
        }
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL_T + " WHERE NM = 'tx'", Long.class)).isEqualTo(1L);
    }

    @Test
    @DisplayName("바깥 업무 트랜잭션(같은 DataSource) 안에서 불러도 그 연결을 쓰지 않고, 바깥 연결은 계속 쓸 수 있다")
    void doesNotUseOrLockOuterBusinessTransaction() {
        HikariDataSource pool2 = hikari(2);
        WidgetQueryExecutor ex2 = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(pool2), Clock.systemUTC());
        def("def.count", "SELECT COUNT(*) AS CNT FROM " + TBL_T);
        JdbcTemplate biz = new JdbcTemplate(pool2);

        new TransactionTemplate(new DataSourceTransactionManager(pool2)).executeWithoutResult(status -> {
            biz.update("INSERT INTO " + TBL_T + " (ID, NM) VALUES (100, 'outer1')"); // 바깥 연결에서 아직 커밋 전
            Object cnt = ex2.runDefinition("def.count", 500).rows().get(0).get("CNT");
            assertThat(((Number) cnt).longValue()).isEqualTo(3L); // 다른 연결에서 돌았다 — 커밋 전 바깥 쓰기가 안 보인다
            try {
                Connection outer = DataSourceUtils.getConnection(pool2);
                assertThat(outer.isReadOnly()).isFalse();
                assertThat(outer.getAutoCommit()).isFalse(); // 바깥 트랜잭션은 그대로 열려 있다
            } catch (SQLException e) {
                throw new IllegalStateException(e);
            }
            biz.update("INSERT INTO " + TBL_T + " (ID, NM) VALUES (101, 'outer2')"); // 바깥은 여전히 쓸 수 있다
        });

        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL_T + " WHERE NM LIKE 'outer%'", Long.class)).isEqualTo(2L);
    }

    @Test
    @DisplayName("연결 상태를 되돌리지 못한 연결은 먼저 끊고(abort) 그다음 풀에서 빠진다 — 다음에 빌리는 연결은 새 물리 연결이고 업무 쓰기를 한다")
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
        faulty.setMinimumIdle(0);
        faulty.setDataSource(failingRestoreDataSource(
                new DriverManagerDataSource(McmCoreOraTestDb.url(), McmCoreOraTestDb.APP_USER, McmCoreOraTestDb.password()), failRestore, calls));
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
            assertThat(c.isReadOnly()).isFalse();
            try (Statement st = c.createStatement()) {
                st.executeUpdate("INSERT INTO " + TBL_T + " (ID, NM) VALUES (200, 'after-evict')");
            }
        }
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL_T + " WHERE ID = 200", Long.class)).isEqualTo(1L);
    }

    @Test
    @DisplayName("풀이 Hikari 가 아니면 되돌리지 못한 연결을 abort 로 끊는다")
    void nonHikariConnectionThatCannotBeRestoredIsAborted() throws Exception {
        Script script = new Script("MariaDB"); // OTHER — 방언 보강 문장 없이 되돌리기 실패만 본다
        script.failOn = "setAutoCommit(true)";
        String ok = new WidgetReadOnlyJdbc(script.dataSource()).execute(con -> "ok");
        assertThat(ok).isEqualTo("ok");
        assertThat(script.calls).contains("abort", "close");
    }

    // ── 전용 DataSource ──────────────────────────────────────────────

    @Test
    @DisplayName("dmes.widget.query.datasource.url 이 있으면 전용 풀(다른 스키마 계정)을 쓰고, 없으면 기본 DataSource, url 없이 계정만 있으면 기동을 막는다")
    void usesDedicatedDataSourceWhenConfigured() throws Exception {
        try (Connection owner = DriverManager.getConnection(McmCoreOraTestDb.url(), OTHER_USER, McmCoreOraTestDb.password());
             Statement st = owner.createStatement()) {
            dropTable(st, TBL_ONLY_B);
            st.execute("CREATE TABLE " + TBL_ONLY_B + " (ID NUMBER(10))");
            McmCoreOraTestDb.awaitReadOnlyReadable(OTHER_USER, TBL_ONLY_B);
            try {
                st.execute("INSERT INTO " + TBL_ONLY_B + " (ID) VALUES (7)");

                WidgetQueryProperties props = new WidgetQueryProperties();
                props.getDatasource().setUrl(McmCoreOraTestDb.url());
                props.getDatasource().setDriverClassName("oracle.jdbc.OracleDriver");
                props.getDatasource().setUsername(OTHER_USER);
                props.getDatasource().setPassword(McmCoreOraTestDb.password());
                WidgetQueryDataSource dedicated = WidgetQueryConfig.create(props, () -> pool);
                try {
                    assertThat(dedicated.dedicated()).isTrue();
                    assertThat(dedicated.dataSource()).isNotSameAs(pool);
                    assertThat(props.toString()).doesNotContain(McmCoreOraTestDb.password()).doesNotContain(McmCoreOraTestDb.url());
                    WidgetQueryExecutor ex = new WidgetQueryExecutor(defRepository, resolver, dedicated);
                    Object cnt = ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM " + TBL_ONLY_B, 50).rows().get(0).get("CNT");
                    assertThat(((Number) cnt).longValue()).isEqualTo(1L);
                    // 앱 기본 계정의 표는 전용 계정에서 보이지 않는다 — 전용 풀로 실행했다는 증거
                    assertThatThrownBy(() -> ex.preview("mcm", "SELECT COUNT(*) AS CNT FROM " + TBL_T, 50))
                            .isInstanceOf(BusinessException.class).hasMessageContaining("ORA-00942");
                } finally {
                    dedicated.destroy();
                }
                assertThat(((HikariDataSource) dedicated.dataSource()).isClosed()).isTrue();
            } finally {
                dropTable(st, TBL_ONLY_B);
            }
        }

        WidgetQueryDataSource shared = WidgetQueryConfig.create(new WidgetQueryProperties(), () -> pool);
        assertThat(shared.dedicated()).isFalse();
        assertThat(shared.dataSource()).isSameAs(pool);

        WidgetQueryProperties bad = new WidgetQueryProperties();
        bad.getDatasource().setUsername("widget_ro");
        assertThatThrownBy(() -> WidgetQueryConfig.create(bad, () -> pool)).isInstanceOf(IllegalStateException.class);
    }

    private static void dropTable(Statement st, String table) throws SQLException {
        st.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + table + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
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
        assertThat(WidgetReadOnlyJdbc.dialectOf("PostgreSQL")).isEqualTo(WidgetReadOnlyJdbc.Dialect.POSTGRESQL);
        assertThat(WidgetReadOnlyJdbc.dialectOf("Oracle")).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);
        // SQLite·SQL Server 갈래는 걷어냈다(oracle-1007) — 읽기 전용 트랜잭션을 걸 수 없는 OTHER(실패 닫힘)로 본다
        assertThat(WidgetReadOnlyJdbc.dialectOf("SQLite")).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(WidgetReadOnlyJdbc.dialectOf("Microsoft SQL Server")).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(WidgetReadOnlyJdbc.dialectOf("MariaDB")).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
        assertThat(WidgetReadOnlyJdbc.dialectOf(null)).isEqualTo(WidgetReadOnlyJdbc.Dialect.OTHER);
    }

    // ── helpers ─────────────────────────────────────────────────────

    /** 앱 계정(MCMAPUSER) 풀 — 최대 {@code size}·쉬는 연결 0. 닫는 것은 시험(풀 1개는 tearDown, 그 밖은 extraPools). */
    private HikariDataSource hikari(int size) {
        HikariDataSource ds = McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "widget-query-test-" + size);
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
        assertThat(admin.queryForList("SELECT ID, NM FROM " + TBL_T + " WHERE ID <= 3 ORDER BY ID"))
                .extracting(r -> r.get("NM")).containsExactly("a", "b", "c");
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL_T + " WHERE ID = 99 OR NM = 'x'", Long.class)).isZero();
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM USER_TABLES WHERE TABLE_NAME = '" + TBL_EVIL + "'", Long.class)).isZero();
    }

    /** 풀(1개)에서 다시 빌린 연결 = 실행기가 쓴 그 연결. 상태가 되돌려졌고 업무 쓰기가 다른 연결에서 보인다(읽기 전용이었다면 ORA-01456). */
    private void assertPooledConnectionRestoredAndWritable() {
        long before = admin.queryForObject("SELECT COUNT(*) FROM " + TBL_T + " WHERE NM = 'biz'", Long.class);
        try (Connection c = pool.getConnection()) {
            assertThat(c.getAutoCommit()).isTrue();
            assertThat(c.isReadOnly()).isFalse();
            try (Statement st = c.createStatement()) {
                st.executeUpdate("INSERT INTO " + TBL_T + " (ID, NM) VALUES (" + (bizId++) + ", 'biz')");
            }
        } catch (SQLException e) {
            throw new AssertionError("풀 연결로 업무 쓰기를 하지 못했습니다: " + e.getMessage(), e);
        }
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL_T + " WHERE NM = 'biz'", Long.class)).isEqualTo(before + 1);
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
     * 실제 Oracle 연결이지만 상태 되돌리기({@code setAutoCommit(true)})를 실패시키는 DataSource — failRestore 가 켜진 동안만.
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
                                if ("setAutoCommit".equals(cm.getName()) && failRestore.get() && Boolean.TRUE.equals(ca[0])) {
                                    throw new SQLException("되돌리기 실패(시험)");
                                }
                                return invoke(cm, real, ca);
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
