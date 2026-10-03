package com.dongkuk.dmes.mcm.widget.query;

import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 쿼리 위젯 SQL 을 <b>읽기 전용</b>으로 실행하는 연결 범위(스펙 2026-10-02-widget-admin-generic §7.3). 어느 DataSource 든 실행마다:
 * <ol>
 *   <li>연결은 {@link DataSource#getConnection()} 으로 따로 빌린다 — 스레드에 묶인 업무 트랜잭션(OASIS txBiz) 연결을 쓰지 않는다.</li>
 *   <li>{@code setReadOnly(true)} → {@code setAutoCommit(false)} → 방언별 보강(아래). 보강이 실패하면 SQL 을 실행하지 않는다(실패 닫힘).</li>
 *   <li>끝나면 성공·실패와 관계없이 <b>롤백</b>한다. 커밋은 하지 않는다.</li>
 *   <li>풀에 돌려주기 전에 빌릴 때 상태로 되돌린다. 순서는 <b>롤백 → autoCommit → SQLite {@code query_only} → readOnly</b> —
 *       autoCommit 을 먼저 켜 트랜잭션 밖에서 나머지를 바꾼다(JDBC 규약·pgjdbc: 트랜잭션 중 {@code setReadOnly} 는 예외, 트랜잭션 중
 *       autoCommit 을 켜면 커밋). 롤백이 실패하면 autoCommit 을 켜지 않는다(열린 트랜잭션이 커밋되지 않게).</li>
 *   <li>롤백·되돌리기에 실패한 연결은 <b>먼저 끊고</b>({@code abort}) 그다음 풀에서 뺀다(Hikari {@code evictConnection}) — 읽기 전용으로
 *       남은 연결이 업무 쓰기를 막지 않게, 그리고 풀이 반납·축출 처리에서 autoCommit 을 되돌리거나 물리 연결을 닫으며 커밋하지 못하게.</li>
 * </ol>
 * 실 PostgreSQL 18 + pgjdbc 42.7.8 + Hikari 7 실측(2026-10-03): 서버 로그가 {@code BEGIN READ ONLY → SET TRANSACTION READ ONLY →
 * SHOW transaction_read_only → SELECT → ROLLBACK} 이고 {@code COMMIT} 은 없다. 풀(1개)의 같은 물리 연결(백엔드 PID 동일)이 다음 실행과
 * 업무 쓰기에 다시 쓰인다(pgjdbc {@code readOnlyMode} transaction·always·ignore 모두).
 * 방언별 보강(방언은 연결 메타데이터의 제품 이름으로 판정한다):
 * <ul>
 *   <li>SQLite — {@code setReadOnly} 는 연결 뒤 바꿀 수 없어 드라이버가 거절한다. 대신 {@code PRAGMA query_only = 1} 을 걸고 다시 읽어
 *       확인한다. 이 값은 트랜잭션이 아니라 연결에 남으므로 돌려주기 전에 원래 값으로 되돌리고 다시 읽어 확인한다.</li>
 *   <li>PostgreSQL·Oracle — {@code SET TRANSACTION READ ONLY}(Spring {@code DataSourceTransactionManager#setEnforceReadOnly} 와 같은 문장).
 *       PostgreSQL 은 {@code SHOW transaction_read_only} 가 {@code on} 인지 확인한다. Oracle 은 문장이 성공하면 걸린 것으로 본다.</li>
 *   <li>SQL Server·그 밖 — 읽기 전용 트랜잭션이 없다. {@code setReadOnly} 힌트와 늘 롤백뿐이라 읽기 계정 전용 DataSource 가 필요하다
 *       (처음 실행 때 한 번 경고 로그). 그래서 {@link WidgetQueryExecutor} 는 이 갈래({@link #enforcesReadOnly} 가 false)에서 전용
 *       DataSource 가 없으면 실행·미리보기·저장 검사를 거절한다(실패 닫힘). 이 클래스 자체는 갈래를 판정해 알려 줄 뿐 거절하지 않는다.</li>
 * </ul>
 * 이 클래스는 Spring 에 기대지 않는다(로그만) — 다른 모듈이 자기 DataSource 로 그대로 쓸 수 있다.
 */
public final class WidgetReadOnlyJdbc {

    private static final Logger log = LoggerFactory.getLogger(WidgetReadOnlyJdbc.class);
    private static final boolean HIKARI_PRESENT = isPresent("com.zaxxer.hikari.HikariDataSource");

    /** 읽기 전용 연결에서 할 일. */
    @FunctionalInterface
    public interface Work<T> {
        T run(Connection connection) throws SQLException;
    }

    /** 읽기 전용을 거는 방법이 다른 DB 갈래. */
    public enum Dialect { SQLITE, POSTGRESQL, ORACLE, SQLSERVER, OTHER }

    private final DataSource dataSource;
    private volatile Dialect dialect;
    private final AtomicBoolean warned = new AtomicBoolean();

    public WidgetReadOnlyJdbc(DataSource dataSource) {
        if (dataSource == null) throw new IllegalArgumentException("DataSource 가 없습니다");
        this.dataSource = dataSource;
    }

    /** 제품 이름(DatabaseMetaData#getDatabaseProductName) → 갈래. H2 등은 OTHER. */
    public static Dialect dialectOf(String productName) {
        String p = productName == null ? "" : productName.toLowerCase(Locale.ROOT);
        if (p.contains("sqlite")) return Dialect.SQLITE;
        if (p.contains("postgresql")) return Dialect.POSTGRESQL;
        if (p.contains("oracle")) return Dialect.ORACLE;
        if (p.contains("sql server")) return Dialect.SQLSERVER;
        return Dialect.OTHER;
    }

    /** 처음 빌린 연결로 판정한 갈래(아직 실행 전이면 null). */
    public Dialect dialect() {
        return dialect;
    }

    /**
     * 실행 DB 갈래. 아직 모르면 연결을 하나 빌려 메타데이터(제품 이름)만 읽고 바로 돌려준다(상태를 바꾸지 않는다) — 실행 전에 갈래별 검사·
     * 실패 닫힘을 판단하려고 쓴다(저장 검사처럼 SQL 을 실행하지 않는 경로 포함). 한 번 알면 다시 빌리지 않는다.
     */
    public Dialect resolveDialect() throws SQLException {
        Dialect d = dialect;
        if (d != null) return d;
        try (Connection con = dataSource.getConnection()) {
            return dialect(con);
        }
    }

    /** 이 갈래에서 읽기 전용 트랜잭션(또는 SQLite query_only)을 걸 수 있는가. false 면 늘 롤백·readOnly 힌트뿐이다. */
    public static boolean enforcesReadOnly(Dialect d) {
        return d == Dialect.SQLITE || d == Dialect.POSTGRESQL || d == Dialect.ORACLE;
    }

    /**
     * 읽기 전용 트랜잭션에서 {@code work} 를 실행하고 늘 롤백한다. {@code work} 의 예외는 그대로 던진다. 읽기 전용을 걸지 못하면
     * {@code work} 를 부르지 않고 예외를 던진다.
     */
    public <T> T execute(Work<T> work) throws SQLException {
        Connection con = dataSource.getConnection();
        boolean origAutoCommit = true;
        boolean origReadOnly = false;
        boolean readOnlyChanged = false;
        boolean autoCommitChanged = false;
        Boolean origQueryOnly = null;
        Dialect d = null;
        try {
            d = dialect(con);
            origAutoCommit = con.getAutoCommit();
            origReadOnly = con.isReadOnly();
            if (d == Dialect.SQLITE) origQueryOnly = queryOnly(con);
            if (!origReadOnly) readOnlyChanged = trySetReadOnly(con);
            if (origAutoCommit) {
                con.setAutoCommit(false);
                autoCommitChanged = true;
            } else {
                con.rollback(); // 빌린 연결에 열린 트랜잭션이 남아 있었다면 버리고 새로 시작한다(SET TRANSACTION 은 첫 문장이어야 한다)
            }
            enforce(con, d);
            return work.run(con);
        } finally {
            // work 가 실패해도(쓰기 거절 등) 되돌리기에 성공하면 연결은 멀쩡하다 — 풀에 돌려줄지는 되돌리기 결과로만 정한다.
            release(con, restore(con, d, origAutoCommit, autoCommitChanged, origReadOnly, readOnlyChanged, origQueryOnly));
        }
    }

    // ── 걸기 ────────────────────────────────────────────────────────────

    private Dialect dialect(Connection con) throws SQLException {
        Dialect d = dialect;
        if (d == null) {
            d = dialectOf(con.getMetaData().getDatabaseProductName());
            dialect = d;
        }
        if (!enforcesReadOnly(d) && warned.compareAndSet(false, true)) {
            log.warn("[widgetQuery] {} 는 읽기 전용 트랜잭션을 걸 수 없어 롤백·readOnly 힌트만 씁니다 — 읽기 권한만 가진 계정의 전용 DataSource"
                    + "(dmes.widget.query.datasource.*)를 붙이세요", con.getMetaData().getDatabaseProductName());
        }
        return d;
    }

    /** JDBC readOnly 힌트. SQLite 처럼 연결 뒤 바꿀 수 없는 드라이버는 거절하므로 실패는 무시하고 방언 보강에 맡긴다. */
    private static boolean trySetReadOnly(Connection con) {
        try {
            con.setReadOnly(true);
            return true;
        } catch (SQLException | RuntimeException e) {
            log.debug("[widgetQuery] setReadOnly(true) 를 드라이버가 받지 않음: {}", e.getMessage());
            return false;
        }
    }

    private static void enforce(Connection con, Dialect d) throws SQLException {
        switch (d) {
            case SQLITE -> {
                setQueryOnly(con, true);
                if (!queryOnly(con)) throw new SQLException("SQLite query_only 를 걸지 못했습니다");
            }
            case POSTGRESQL -> {
                exec(con, "SET TRANSACTION READ ONLY");
                String state = singleString(con, "SHOW transaction_read_only");
                if (!"on".equalsIgnoreCase(state == null ? "" : state.trim())) {
                    throw new SQLException("PostgreSQL 읽기 전용 트랜잭션을 걸지 못했습니다(transaction_read_only=" + state + ")");
                }
            }
            case ORACLE -> exec(con, "SET TRANSACTION READ ONLY");
            default -> {
                // SQL Server·그 밖: 읽기 전용 트랜잭션 없음 — readOnly 힌트 + 늘 롤백(클래스 설명)
            }
        }
    }

    // ── 되돌리기 ────────────────────────────────────────────────────────

    /**
     * 롤백하고 빌릴 때 상태로 되돌린다. 하나라도 실패하면 false(그 연결은 풀에 돌려보내지 않는다).
     * 순서: 롤백 → autoCommit → SQLite query_only → readOnly(클래스 설명). 롤백이 실패하면 나머지를 하지 않는다 —
     * autoCommit 을 켜면 드라이버가 열린 트랜잭션을 커밋한다(JDBC {@code setAutoCommit} 규약).
     */
    private static boolean restore(Connection con, Dialect d, boolean origAutoCommit, boolean autoCommitChanged,
                                   boolean origReadOnly, boolean readOnlyChanged, Boolean origQueryOnly) {
        try {
            if (!con.getAutoCommit()) con.rollback();
        } catch (SQLException | RuntimeException e) {
            log.warn("[widgetQuery] 롤백 실패 — 되돌리지 않고 연결을 버립니다: {}", e.getMessage());
            return false;
        }
        boolean ok = true;
        if (autoCommitChanged) {
            // 롤백 뒤라 열린 트랜잭션이 없다 — autoCommit 을 켜도 커밋할 것이 없다(pgjdbc 는 COMMIT 을 보내지 않는다).
            try {
                con.setAutoCommit(origAutoCommit);
            } catch (SQLException | RuntimeException e) {
                ok = false;
                log.warn("[widgetQuery] autoCommit 되돌리기 실패: {}", e.getMessage());
            }
        }
        if (d == Dialect.SQLITE && origQueryOnly != null) {
            try {
                setQueryOnly(con, origQueryOnly);
                if (queryOnly(con) != origQueryOnly) {
                    ok = false;
                    log.warn("[widgetQuery] SQLite query_only 를 되돌리지 못했습니다");
                }
            } catch (SQLException | RuntimeException e) {
                ok = false;
                log.warn("[widgetQuery] SQLite query_only 되돌리기 실패: {}", e.getMessage());
            }
        }
        if (readOnlyChanged) {
            // autoCommit 을 먼저 되돌려 트랜잭션 밖에서 바꾼다 — 트랜잭션 중 setReadOnly 는 pgjdbc 가 거절한다.
            try {
                con.setReadOnly(origReadOnly);
            } catch (SQLException | RuntimeException e) {
                ok = false;
                log.warn("[widgetQuery] readOnly 되돌리기 실패: {}", e.getMessage());
            }
        }
        return ok;
    }

    /** 되돌린 연결은 풀에 돌려주고, 되돌리지 못한 연결은 풀에서 뺀다. */
    private void release(Connection con, boolean reusable) {
        if (!reusable) discard(con);
        try {
            con.close();
        } catch (SQLException | RuntimeException e) {
            log.debug("[widgetQuery] 연결 닫기 실패: {}", e.getMessage());
        }
    }

    /**
     * 바로 끊고({@code abort}) 그다음 풀에서 뺀다(Hikari). 순서가 중요하다 — Hikari 7 의 {@code evictConnection} 은 물리 연결 닫기를
     * <b>다른 스레드</b>(closeConnectionExecutor)에 넘기므로, 빼기를 먼저 하면 그 스레드의 {@code close} 가 이 스레드의 {@code abort} 보다
     * 먼저 돌 수 있고, 닫을 때 커밋하는 드라이버(Oracle 기본 등)에서는 롤백하지 못한 쓰기가 커밋된다. 끊어 두면 서버가 그 트랜잭션을
     * 버리고, 뒤이은 빼기·반납({@code close})은 이미 끊긴 연결을 다룰 뿐이다. 끊기가 실패해도 빼기는 따로 한다(풀이 다시 내주지 않게).
     */
    private void discard(Connection con) {
        log.error("[widgetQuery] 연결을 빌릴 때 상태로 되돌리지 못해 끊고 풀에서 뺍니다(읽기 전용 상태로 업무 코드에 넘어가지 않게)");
        try {
            con.abort(Runnable::run);
        } catch (SQLException | RuntimeException e) {
            log.warn("[widgetQuery] 연결 끊기 실패: {}", e.getMessage());
        }
        try {
            if (HIKARI_PRESENT) Hikari.evict(dataSource, con);
        } catch (SQLException | RuntimeException | LinkageError e) {
            log.warn("[widgetQuery] 풀에서 빼기 실패: {}", e.getMessage());
        }
    }

    // ── 도우미 ──────────────────────────────────────────────────────────

    private static boolean queryOnly(Connection con) throws SQLException {
        String v = singleString(con, "PRAGMA query_only");
        return v != null && !"0".equals(v.trim());
    }

    private static void setQueryOnly(Connection con, boolean on) throws SQLException {
        exec(con, on ? "PRAGMA query_only = 1" : "PRAGMA query_only = 0");
    }

    private static void exec(Connection con, String sql) throws SQLException {
        try (Statement st = con.createStatement()) {
            st.execute(sql);
        }
    }

    private static String singleString(Connection con, String sql) throws SQLException {
        try (Statement st = con.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    private static boolean isPresent(String className) {
        try {
            Class.forName(className, false, WidgetReadOnlyJdbc.class.getClassLoader());
            return true;
        } catch (ClassNotFoundException | LinkageError e) {
            return false;
        }
    }

    /** Hikari 가 있을 때만 읽히는 클래스(없으면 로드하지 않는다). */
    private static final class Hikari {
        /**
         * Hikari 풀이 직접 내준 연결만 뺀다(Hikari 연결이 아니면 아무것도 하지 않는다 — 그때도 앞선 abort 가 이미 끊었다). 뺐으면 true.
         * 끊긴 뒤에도 프록시의 {@code isClosed()} 는 false 라 Hikari 는 이 연결을 주인으로 보고 바로 뺀다.
         */
        static boolean evict(DataSource ds, Connection con) throws SQLException {
            if (!con.getClass().getName().startsWith("com.zaxxer.hikari.")) return false;
            if (!ds.isWrapperFor(com.zaxxer.hikari.HikariDataSource.class)) return false;
            ds.unwrap(com.zaxxer.hikari.HikariDataSource.class).evictConnection(con);
            return true;
        }
    }
}
