package com.dongkuk.dmes.mdm.common.testdb;

import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;

/**
 * {@link AbstractMdmSharedDbTest} 가 쓰는 Oracle 시험 PDB 의 MDMAPUSER 스키마 한 벌(oracle-1007 m3, 2026-10-07).
 *
 * <p>접속값은 시험 하니스(build-logic dmes.test-conventions, {@code -Pdmes.ora.test=clone} 또는 {@code -Pdmes.ora.pdb=<PDB>})가
 * 넘기는 시스템 속성 {@code dmes.ora.url}·{@code dmes.ora.password}(없으면 env {@code DMES_ORA_URL}·{@code DMES_ORA_PASSWORD})다.
 * 없으면 건너뛰지 않고 실패한다 — local 프로파일의 기본 URL(레인 개발 PDB {@code L_ORA_MDM})로 붙지 않게 한다.
 *
 * <ul>
 *   <li>JVM 당 한 번({@link #ensureMigrated}): 스키마를 Flyway clean 후 V1 기준선으로 migrate 한다. 컨텍스트가 뜨기 전
 *       ({@code @DynamicPropertySource})에 돌므로 컨텍스트의 Flyway 는 할 일이 없다(적용할 버전 없음).
 *       {@code -Pdmes.ora.pdb} 로 있는 PDB 를 쓰면 앞 실행의 행이 남아 있을 수 있어 첫 클래스도 늘 이 상태에서 시작한다.</li>
 *   <li>클래스마다({@link #resetForTestClass}): 표를 다시 만들지 않고 행만 지운 뒤 V1 의 초기 행을 다시 넣는다. 외래 키(V1 52개)가 있어
 *       TRUNCATE 는 ORA-02266 이 나므로 자식 → 부모 순서로 DELETE 한다. 시험이 만든 표·뷰·트리거(기준선에 없던 것)는 먼저 지운다 —
 *       SQLite 때 DROP+migrate 가 하던 일이다.</li>
 * </ul>
 *
 * <p>IDENTITY(8칸)는 되돌리지 않는다 — 생성된 ID 값을 숫자로 단언하는 시험이 없다(2026-10-07 grep).
 * Oracle IDENTITY 는 직접 넣은 ID 를 따라가지 않으니(다음 생성 값이 직접 넣은 값과 겹칠 수 있다), 시험이 ID 를 직접 넣을 때는
 * 900000 이상을 쓴다. 지우기 전에는 늘 대상 PDB 가
 * 시험 PDB 인지 확인한다({@link #checkResettable}).
 */
public final class MdmSharedTestDb {

    private static final Logger log = LoggerFactory.getLogger(MdmSharedTestDb.class);

    /** 앱 접속 사용자 = 스키마 주인. */
    static final String APP_USER = "MDMAPUSER";

    /** Flyway 위치 — application-local.yml 의 spring.flyway.locations 와 같다. */
    static final String LOCATION = "classpath:db/migration/mdm/oracle";

    /** 초기 행을 다시 읽을 기준선(클래스패스). V1 의 INSERT 를 그대로 다시 실행하므로 행을 손으로 옮겨 적지 않는다(V1 이 바뀌면 따라간다). */
    static final String BASELINE = "db/migration/mdm/oracle/V1__baseline.sql";

    private static final String HISTORY_TABLE = "FLYWAY_SCHEMA_HISTORY";

    /** 어떤 경우에도 지우지 않는 PDB 이름 — 기본 PDB·루트 컨테이너·시드. */
    private static final Set<String> NEVER_RESET = Set.of("FREEPDB1", "CDB$ROOT", "PDB$SEED");

    /** 어떤 경우에도 지우지 않는 PDB 이름 접두 — 레인 개발 PDB({@code L_<레인>})·템플릿({@code TPL_*}). */
    private static final List<String> NEVER_RESET_PREFIXES = List.of("L_", "TPL_");

    /** 시험 PDB 접두(복제본). 이 접두는 허용 이름 없이도 지운다. */
    private static final String TEST_PDB_PREFIX = "T_";

    private static final Pattern SERVICE_NAME = Pattern.compile("(?i)SERVICE_NAME\\s*=\\s*([^)\\s]+)");

    private static boolean migrated;
    /** migrate 직후 스키마의 표·뷰·트리거({@code 형:이름}). 이 밖의 것은 시험이 만든 것이라 클래스마다 지운다. */
    private static Set<String> baselineObjects;
    /** 자식 → 부모 DELETE 순서(처음 한 번 계산). */
    private static List<String> deleteOrder;
    /** V1 의 INSERT 문(끝 {@code ;} 뺌). */
    private static List<String> seedInserts;

    private MdmSharedTestDb() {
    }

    /** 시험 PDB JDBC URL. 하니스 값이 없으면 바로 실패한다. */
    static String url() {
        String url = setting("dmes.ora.url", "DMES_ORA_URL");
        if (url == null) {
            throw new IllegalStateException("Oracle 시험 PDB 접속값(dmes.ora.url·DMES_ORA_URL)이 없다 — "
                    + "-Pdmes.ora.test=clone(또는 -Pdmes.ora.pdb=<PDB>)로 돌린다 (scripts/oracle/README.md 「Gradle 시험 하니스」).");
        }
        return url;
    }

    /** 스키마 사용자 비밀번호(로컬 PDB 는 모든 사용자가 같다). */
    static String password() {
        String pw = setting("dmes.ora.password", "DMES_ORA_PASSWORD");
        return pw == null ? "dmes_password_123" : pw;
    }

    /**
     * JVM 당 한 번: 안전장치를 거친 뒤 MDMAPUSER 스키마를 Flyway clean → migrate 하고, 기준선 객체 목록을 적어 둔다.
     * 컨텍스트를 띄우기 전({@code @DynamicPropertySource})에 부른다.
     */
    static synchronized void ensureMigrated() {
        if (migrated) {
            return;
        }
        long start = System.nanoTime();
        String url = url();
        checkResettable(setting("dmes.ora.pdb", "DMES_ORA_PDB"), "dmes.ora.pdb");
        checkResettable(serviceName(url), "URL 서비스 이름");
        try (Connection c = DriverManager.getConnection(url, APP_USER, password())) {
            checkConnection(c);
        } catch (SQLException e) {
            throw new IllegalStateException("Oracle 시험 PDB 접속 실패(" + url + "): " + e.getMessage(), e);
        }
        Flyway flyway = Flyway.configure()
                .dataSource(url, APP_USER, password())
                .locations(LOCATION)
                .cleanDisabled(false)
                .load();
        flyway.clean();
        flyway.migrate();
        try (Connection c = DriverManager.getConnection(url, APP_USER, password()); Statement st = c.createStatement()) {
            baselineObjects = schemaObjects(st);
        } catch (SQLException e) {
            throw new IllegalStateException("기준선 객체 목록 읽기 실패: " + e.getMessage(), e);
        }
        migrated = true;
        log.info("[MdmSharedTestDb] 시험 스키마 clean+migrate {}ms ({})", (System.nanoTime() - start) / 1_000_000, url);
    }

    /**
     * 테스트 클래스 시작 시 DB 와 테스트 가짜 빈을 "새 컨텍스트를 막 띄운 상태" 로 되돌린다. 첫 클래스도 늘 한다.
     *
     * <ul>
     *   <li>DB: 시험이 만든 트리거·뷰·표를 지우고, 기준선 표의 행을 자식 → 부모 순서로 DELETE 한 뒤(Flyway 이력 제외) V1 초기 행을
     *       다시 넣는다. 한 연결·한 트랜잭션이다.</li>
     *   <li>{@link SharedContextResettable} 빈(테스트 가짜 사용자·시계·명부 등): 생성 직후 값으로.</li>
     *   <li>{@link TermRecommendationCache}: 부팅 때({@code ApplicationReadyEvent}) 하던 전체 적재를 다시 한다.</li>
     * </ul>
     */
    static synchronized void resetForTestClass(ApplicationContext context) {
        ensureMigrated();
        long start = System.nanoTime();
        resetRows(context.getBean(DataSource.class));
        context.getBeansOfType(SharedContextResettable.class).values().forEach(SharedContextResettable::resetForTestClass);
        context.getBeanProvider(TermRecommendationCache.class).ifAvailable(TermRecommendationCache::reloadAll);
        log.info("[MdmSharedTestDb] 공유 테스트 DB 초기화 {}ms", (System.nanoTime() - start) / 1_000_000);
    }

    private static void resetRows(DataSource dataSource) {
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            checkConnection(c);
            dropTestObjects(st);
            boolean autoCommit = c.getAutoCommit();
            c.setAutoCommit(false);
            try {
                for (String table : deleteOrder(st)) {
                    st.executeUpdate("DELETE FROM \"" + table + "\"");
                }
                for (String insert : seedInserts()) {
                    st.executeUpdate(insert);
                }
                c.commit();
            } catch (SQLException | RuntimeException e) {
                try {
                    c.rollback();
                } catch (SQLException rollbackFailure) {
                    // rollback 실패가 원래 예외를 가리지 않게 붙여 둔다.
                    e.addSuppressed(rollbackFailure);
                }
                throw e;
            } finally {
                c.setAutoCommit(autoCommit);
            }
        } catch (SQLException e) {
            throw new IllegalStateException("공유 테스트 DB 초기화 실패: " + e.getMessage(), e);
        }
    }

    /** 기준선에 없던 트리거 → 뷰 → 표를 지운다(DDL 이라 각각 커밋된다). 표는 서로 건 외래 키째 지우고 휴지통에 남기지 않는다. */
    private static void dropTestObjects(Statement st) throws SQLException {
        Set<String> extra = new TreeSet<>(schemaObjects(st));
        extra.removeAll(baselineObjects);
        if (extra.isEmpty()) {
            return;
        }
        for (String type : List.of("TRIGGER", "VIEW", "TABLE")) {
            for (String object : extra) {
                if (object.startsWith(type + ":")) {
                    String name = object.substring(type.length() + 1);
                    st.execute("DROP " + type + " \"" + name + "\"" + ("TABLE".equals(type) ? " CASCADE CONSTRAINTS PURGE" : ""));
                }
            }
        }
        log.info("[MdmSharedTestDb] 시험이 만든 객체 지움 {}", extra);
    }

    private static Set<String> schemaObjects(Statement st) throws SQLException {
        Set<String> out = new HashSet<>();
        try (ResultSet rs = st.executeQuery("SELECT OBJECT_TYPE, OBJECT_NAME FROM USER_OBJECTS "
                + "WHERE OBJECT_TYPE IN ('TABLE', 'VIEW', 'TRIGGER') AND OBJECT_NAME NOT LIKE 'BIN$%'")) {
            while (rs.next()) {
                out.add(rs.getString(1) + ":" + rs.getString(2));
            }
        }
        return out;
    }

    /**
     * 자식 → 부모 DELETE 순서. {@code USER_CONSTRAINTS}(R 형)의 부모·자식 표로 위상 정렬한다 — 자기 참조(DOMAIN.PARENT_DOMAIN_ID)는
     * 한 문장 DELETE 끝에 검사되므로 뺀다. 여러 표에 걸친 순환이 생기면 순서를 정할 수 없어 실패한다(V1 에는 없다).
     */
    private static List<String> deleteOrder(Statement st) throws SQLException {
        if (deleteOrder != null) {
            return deleteOrder;
        }
        Set<String> remaining = new TreeSet<>();
        try (ResultSet rs = st.executeQuery("SELECT TABLE_NAME FROM USER_TABLES WHERE DROPPED = 'NO' AND TEMPORARY = 'N' "
                + "AND NESTED = 'NO' AND TABLE_NAME NOT LIKE 'BIN$%'")) {
            while (rs.next()) {
                if (!HISTORY_TABLE.equalsIgnoreCase(rs.getString(1))) {
                    remaining.add(rs.getString(1));
                }
            }
        }
        Map<String, Set<String>> children = new HashMap<>();
        try (ResultSet rs = st.executeQuery("SELECT c.TABLE_NAME, p.TABLE_NAME FROM USER_CONSTRAINTS c "
                + "JOIN USER_CONSTRAINTS p ON p.OWNER = c.R_OWNER AND p.CONSTRAINT_NAME = c.R_CONSTRAINT_NAME "
                + "WHERE c.CONSTRAINT_TYPE = 'R'")) {
            while (rs.next()) {
                String child = rs.getString(1);
                String parent = rs.getString(2);
                if (!child.equals(parent)) {
                    children.computeIfAbsent(parent, k -> new HashSet<>()).add(child);
                }
            }
        }
        List<String> order = new ArrayList<>();
        while (!remaining.isEmpty()) {
            List<String> ready = new ArrayList<>();
            for (String table : remaining) {
                if (children.getOrDefault(table, Set.of()).stream().noneMatch(remaining::contains)) {
                    ready.add(table);
                }
            }
            if (ready.isEmpty()) {
                throw new IllegalStateException("외래 키 순환이 있어 DELETE 순서를 정하지 못했다: " + remaining);
            }
            order.addAll(ready);
            ready.forEach(remaining::remove);
        }
        deleteOrder = List.copyOf(order);
        log.info("[MdmSharedTestDb] DELETE 순서(자식 → 부모) {}개 {}", deleteOrder.size(), deleteOrder);
        return deleteOrder;
    }

    /** 클래스패스 V1 기준선의 INSERT 문만(주석 줄 건너뜀, 끝 {@code ;} 뺌 — JDBC 는 {@code ;} 가 있으면 ORA-00911).
     * {@code /*} 블록 주석이나 줄 가운데 {@code ;} 를 만나면 잘못 읽지 않고 바로 실패한다(지금 V1 은 한 줄 INSERT 7개). */
    static synchronized List<String> seedInserts() {
        if (seedInserts != null) {
            return seedInserts;
        }
        String sql;
        try (InputStream in = MdmSharedTestDb.class.getClassLoader().getResourceAsStream(BASELINE)) {
            if (in == null) {
                throw new IllegalStateException("클래스패스에 " + BASELINE + " 가 없다");
            }
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
        List<String> out = new ArrayList<>();
        StringBuilder current = null;
        for (String line : sql.split("\\R")) {
            String trimmed = line.strip();
            if (trimmed.startsWith("--")) {
                continue;
            }
            if (trimmed.contains("/*")) {
                throw new IllegalStateException(BASELINE + " 에 /* 블록 주석이 있다 — 이 읽기 도우미는 -- 줄 주석만 안다: " + trimmed);
            }
            if (current == null) {
                if (!trimmed.regionMatches(true, 0, "INSERT INTO", 0, "INSERT INTO".length())) {
                    continue;
                }
                current = new StringBuilder();
            }
            int semicolon = trimmed.indexOf(';');
            if (semicolon >= 0 && semicolon != trimmed.length() - 1) {
                throw new IllegalStateException(BASELINE + " 의 문장 가운데(줄 끝이 아닌 곳)에 ; 가 있다 — 이 읽기 도우미는 문장 끝 ; 만 안다: "
                        + trimmed);
            }
            current.append(current.isEmpty() ? "" : "\n").append(line);
            if (trimmed.endsWith(";")) {
                String statement = current.toString().strip();
                out.add(statement.substring(0, statement.length() - 1));
                current = null;
            }
        }
        if (current != null || out.isEmpty()) {
            throw new IllegalStateException(BASELINE + " 의 초기 행 INSERT 문을 읽지 못했다(" + out.size() + "개, 끝나지 않은 문장 "
                    + (current != null) + ")");
        }
        seedInserts = List.copyOf(out);
        return seedInserts;
    }

    /**
     * 안전장치 — 이 이름의 PDB 를 지워도 되는가. {@code L_}·{@code TPL_} 로 시작하는 PDB(레인 개발 PDB·템플릿)와 {@code FREEPDB1}·
     * {@code CDB$ROOT}·{@code PDB$SEED} 는 늘 거부한다. {@code T_} 로 시작하지 않는 그 밖의 PDB 는 시스템 속성
     * {@code dmes.ora.allowReset=<PDB 이름>} 이 이 이름과 대소문자 무시로 같을 때만 허용한다({@code true} 같은 값은 거부).
     * 이름이 없으면 넘어간다(실제 접속 PDB 는 {@link #checkConnection} 이 늘 본다).
     */
    static void checkResettable(String pdb, String source) {
        if (pdb == null || pdb.isBlank()) {
            return;
        }
        String name = pdb.strip().toUpperCase(Locale.ROOT);
        String head = name.contains(".") ? name.substring(0, name.indexOf('.')) : name;
        if (NEVER_RESET.contains(head) || NEVER_RESET_PREFIXES.stream().anyMatch(head::startsWith)) {
            throw new IllegalStateException(source + " 가 " + name + " 이다 — 이 PDB 는 시험이 지우지 않는다"
                    + "(L_·TPL_ 로 시작하는 레인 개발 PDB·템플릿, FREEPDB1, CDB$ROOT, PDB$SEED). "
                    + "-Pdmes.ora.test=clone 으로 T_ 시험 PDB 를 복제해 돌린다.");
        }
        if (head.startsWith(TEST_PDB_PREFIX)) {
            return;
        }
        String allowed = System.getProperty("dmes.ora.allowReset");
        if (allowed == null || !allowed.strip().equalsIgnoreCase(head)) {
            throw new IllegalStateException(source + " 가 " + name + " 이다 — T_ 로 시작하는 시험 PDB 만 지운다. "
                    + "레인이 정한 이 PDB 를 지워도 되면 -Pdmes.ora.allowReset=" + head + " 처럼 PDB 이름을 준다"
                    + "(true 는 받지 않는다. 지금 값: " + (allowed == null || allowed.isBlank() ? "없음" : allowed) + ").");
        }
    }

    /** 실제 접속한 PDB(CON_NAME)와 스키마를 확인한다. */
    private static void checkConnection(Connection c) throws SQLException {
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT SYS_CONTEXT('USERENV', 'CON_NAME'), SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA') FROM DUAL")) {
            rs.next();
            checkResettable(rs.getString(1), "접속한 PDB(CON_NAME)");
            if (!APP_USER.equalsIgnoreCase(rs.getString(2))) {
                throw new IllegalStateException("접속 스키마가 " + rs.getString(2) + " 이다 — " + APP_USER + " 만 초기화한다.");
            }
        }
    }

    /** JDBC URL 의 서비스 이름 — {@code @//호스트:포트/서비스[?…]} 또는 TNS 기술자의 {@code SERVICE_NAME=}. 못 읽으면 null. */
    static String serviceName(String url) {
        Matcher m = SERVICE_NAME.matcher(url);
        if (m.find()) {
            return m.group(1);
        }
        String u = url.contains("?") ? url.substring(0, url.indexOf('?')) : url;
        int slash = u.lastIndexOf('/');
        if (slash < 0 || slash == u.length() - 1) {
            return null;
        }
        String tail = u.substring(slash + 1);
        return tail.contains(":") ? null : tail;
    }

    private static String setting(String property, String env) {
        String v = System.getProperty(property);
        if (v == null || v.isBlank()) {
            v = System.getenv(env);
        }
        return v == null || v.isBlank() ? null : v;
    }
}
