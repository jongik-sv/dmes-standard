package com.dongkuk.dmes.mcm.init;

import static org.junit.jupiter.api.Assertions.fail;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Parameter;
import jakarta.persistence.Query;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.hibernate.Session;
import org.hibernate.jdbc.ReturningWork;
import org.hibernate.jdbc.Work;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * DataInitializer MSSQL 경로 SQL 기록 특성 테스트 — 실제 DB 없이 MSSQL 분기가 내보내는 SQL 을 실행 순서대로 골든으로 고정한다.
 *
 * <p><b>왜</b> — {@link DataInitializerSeedFingerprintTest}(SQLite 지문)는 SQLite 분기만 지나므로, 약 1,300줄의 MSSQL 전용
 * DDL(sys.objects·OBJECT_ID·ALTER·EXEC CREATE SCHEMA)과 T-SQL 시드(SYSDATETIME()·N'…'·MCMAPUSER. 접두 원문)를 지키지 못한다.
 * DataInitializer 를 도메인별 Seeder 로 나누는 동안 이 경로가 한 글자도 바뀌지 않았는지 이 테스트가 지킨다.
 *
 * <p><b>구성</b>
 * <ul>
 *   <li>EntityManager — {@link Proxy} 로 만든 기록용 가짜. {@code createNativeQuery} 가 돌려주는 {@link Query} 도 가짜이며
 *       setParameter 인자를 모아 실행 호출(executeUpdate·getSingleResult·getResultList) 줄에 같이 적는다.
 *       결과값은 {@link Fixture} 의 고정값 규칙(이 클래스 한곳)으로만 정한다.</li>
 *   <li>방언 — {@code entityManager.unwrap(Session).doReturningWork(conn → getMetaData().getDatabaseProductName())} 경로를
 *       가짜로 만들어 {@code "Microsoft SQL Server"} 를 돌려준다. 그래서 MSSQL 분기를 탄다.</li>
 *   <li>PasswordEncoder — 고정값 스텁. Environment — {@link MockEnvironment}(local / 프로필 없음).</li>
 *   <li>SecMenuNativeRepository — 실제 객체에 같은 가짜 EntityManager 를 넣는다(recomputeMenuFullSeq 의 SQL 도 기록).</li>
 *   <li>RuleMasterRepository — existsById·saveAll 인자를 기록하는 가짜. caravan 저장소 2개는 null(skip).</li>
 *   <li>run() 은 트랜잭션 프록시 없이 직접 부른다(@Transactional 은 프록시가 없으면 아무 일도 하지 않는다).</li>
 * </ul>
 *
 * <p><b>분할 뒤에도 그대로 도는 조건</b> — 이 테스트는 DataInitializer 의 공개 생성자 {@code (PasswordEncoder, Environment)},
 * {@code run(ApplicationArguments)}, 필드 이름 {@code entityManager · secMenuNativeRepository · ruleMasterRepository ·
 * initEnabled}(reflection 주입)만 쓴다. private 메서드 이름·Seeder 내부에는 기대지 않는다.
 * <b>가정</b>: 분할 뒤 Seeder 들은 DataInitializer 에 주입된 {@code entityManager}(와 secMenuNativeRepository·ruleMasterRepository)를
 * 생성자·인자로 넘겨받아 쓴다. Seeder 가 스프링 빈으로 따로 주입받는 구조로 바뀌면 이 테스트의 주입부만 맞춰 고친다(골든은 그대로).
 *
 * <p><b>골든 형식</b> — 한 줄에 호출 하나: {@code 순번 | 종류 | SQL | 파라미터 | 반환}.
 * <ul>
 *   <li>{@code createNativeQuery} 줄은 SQL 원문을 담는다. 실행 줄은 SQL 대신 만든 줄 순번 {@code @00012} 를 가리킨다.</li>
 *   <li>SQL 의 역슬래시·줄바꿈·CR·탭은 {@code \\ \n \r \t} 로 이스케이프한다.</li>
 *   <li>파라미터는 이름순으로 정렬한다(setParameter 호출 순서는 의미가 없다). 문자열이 아닌 값은 {@code (타입)값}.</li>
 * </ul>
 *
 * <p><b>골든 갱신</b> — 골든이 없거나 {@code -Dmssqlsql.update=true}(IDE) 또는 환경 변수 {@code MSSQLSQL_UPDATE=true}(gradle —
 * mcm build.gradle 은 시스템 속성을 테스트 JVM 으로 넘기지 않는다)면 비교하지 않고 새로 쓴다. 기본은 파일 전체 문자열 완전 일치이며,
 * 다르면 첫 차이 줄과 앞뒤 3줄을 보여 주고 실패한다. 골든은 소스 경로(작업 디렉터리 mcm/api 기준)를 읽고 쓴다.
 *
 * <p><b>도달 진단</b> — 기록 때마다 호출 스택에서 {@code com.dongkuk.dmes.mcm.init} 패키지 클래스의 메서드를 모아,
 * 네 시나리오 어디서도 SQL 을 내지 않은 메서드 목록을 {@code build/reports/mssql-sql-characterization/unreached-methods.txt}
 * 에 쓴다(검증 대상 아님 — 고정값 규칙 때문에 건너뛴 분기를 찾는 참고 자료).
 */
class DataInitializerMssqlSqlCharacterizationTest {

    private static final Path GOLDEN_DIR = Path.of("src/test/resources/init");
    private static final Path REPORT = Path.of("build/reports/mssql-sql-characterization/unreached-methods.txt");
    private static final String FIXED_ENC_PWD = "{mssql-sql-stub}fixed-encoded-password";
    private static final String MSSQL_PRODUCT_NAME = "Microsoft SQL Server";
    private static final String INIT_PACKAGE = "com.dongkuk.dmes.mcm.init.";

    /** 네 시나리오 전체에서 SQL 을 낸 호출 스택의 init 패키지 메서드(클래스#메서드). 진단 전용. */
    private static final Set<String> REACHED = new TreeSet<>();
    private static final Set<Class<?>> SEEN_CLASSES = new java.util.LinkedHashSet<>();

    // ─────────────────────────────────────────────────────────────────────
    // 고정값 규칙 — 결과를 읽는 모든 호출의 반환값은 여기서만 정한다. 분할 뒤 코드도 같은 규칙으로 돌기 때문에 공정한 비교가 된다.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * <ul>
     *   <li>{@link #ABSENT} — "아무것도 없음". 존재 확인(COUNT)·컬럼 길이 조회는 0/null → CREATE·ADD·INSERT 경로가 최대한 돈다.
     *       대신 {@code if (tableExists) { 보강 }} 쪽 업그레이드·마이그레이션 분기는 건너뛴다.</li>
     *   <li>{@link #EXISTING} — "이미 있음". 존재 확인은 1 → 업그레이드·ALTER·마이그레이션·레거시 정리 분기가 돈다
     *       (시드 INSERT 는 대부분 건너뛴다). 컬럼 길이는 1(VARCHAR(1) 옛 폭), PERMISSION_ACTION 은 'search' 하나만 있다고 본다.
     *       단, 컬럼·인덱스도 다 있다고 보므로 addColumnIfAbsent 류 ALTER ADD 는 돌지 않는다.</li>
     *   <li>{@link #LEGACY_STUB} — "옛 스텁 테이블". {@link #EXISTING} 과 같되 {@code sys.columns}·{@code sys.indexes} 존재 확인만 0 →
     *       테이블은 있는데 컬럼·인덱스가 빠진 옛 스키마를 올리는 ALTER ADD COLUMN·CREATE INDEX·PK 재설계(DROP/ADD CONSTRAINT)
     *       분기가 돈다(ABSENT 는 테이블이 없어서, EXISTING 은 컬럼이 있어서 둘 다 이 분기를 지나지 않는다).</li>
     * </ul>
     * 모든 시나리오 공통: 중복 행 조회({@code HAVING COUNT(*) > 1})는 0(중복 없음), PK 이름 조회는 고정 문자열,
     * executeUpdate 는 0, 그 밖의 getResultList 는 빈 목록(recomputeMenuFullSeq 의 Object[] 행 조회 포함),
     * 규칙에 없는 getSingleResult 는 예외로 알린다. 판정은 SQL 문자열로만 한다(메서드 이름에 기대지 않는다).
     */
    enum Fixture {
        ABSENT, EXISTING, LEGACY_STUB;

        Object singleResult(String sql) {
            String s = sql.strip();
            if (s.contains("sys.key_constraints") && s.startsWith("SELECT name")) {
                return "PK_STUB_TB_MCM_SEC_MENU";                 // 기존 PK 제약 이름
            }
            if (s.contains("max_length")) {
                return this == ABSENT ? null : Integer.valueOf(1);    // 컬럼 없음 / VARCHAR(1)
            }
            if (s.contains("HAVING COUNT(*) > 1")) {
                return Integer.valueOf(0);                           // 중복 없음
            }
            if (this == LEGACY_STUB
                    && (s.startsWith("SELECT COUNT(*) FROM sys.columns") || s.startsWith("SELECT COUNT(*) FROM sys.indexes"))) {
                return Integer.valueOf(0);                           // 옛 스텁 — 컬럼·인덱스 없음
            }
            if (s.startsWith("SELECT COUNT(*)")) {
                return Integer.valueOf(this == ABSENT ? 0 : 1);      // 없음 / 있음
            }
            throw new IllegalStateException("고정값 규칙에 없는 getSingleResult — Fixture 에 규칙을 추가하라: " + sql);
        }

        List<?> resultList(String sql) {
            if (this != ABSENT && sql.contains("SELECT PERMISSION_ACTION")) {
                return List.of("search");                            // 빠진 action 덧붙이기(UPDATE) 경로
            }
            return List.of();
        }

        int executeUpdate(String sql) {
            return 0;
        }

        boolean ruleMasterExists(Object id) {
            return this != ABSENT;
        }
    }

    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("local 프로필 · 아무것도 없음 — MSSQL 경로 SQL 이 골든과 같다")
    void localAbsent() throws Exception {
        verify("local", new String[] {"local"}, Fixture.ABSENT);
    }

    @Test
    @DisplayName("프로필 없음 · 아무것도 없음 — MSSQL 경로 SQL 이 골든과 같다 (unlockLocalAdmin·RuleMaster 샘플 skip)")
    void noProfileAbsent() throws Exception {
        verify("no-profile", new String[0], Fixture.ABSENT);
    }

    @Test
    @DisplayName("local 프로필 · 이미 있음 — 업그레이드·마이그레이션 분기 SQL 이 골든과 같다")
    void localExisting() throws Exception {
        verify("local-existing", new String[] {"local"}, Fixture.EXISTING);
    }

    @Test
    @DisplayName("local 프로필 · 옛 스텁 테이블(컬럼·인덱스 없음) — ALTER ADD·PK 재설계 분기 SQL 이 골든과 같다")
    void localLegacyStub() throws Exception {
        verify("local-legacy-stub", new String[] {"local"}, Fixture.LEGACY_STUB);
    }

    @AfterAll
    static void writeReachReport() throws Exception {
        List<String> lines = new ArrayList<>();
        lines.add("# SQL 을 낸 호출 스택에 한 번도 나타나지 않은 init 패키지 메서드 (네 시나리오 합). 진단용 — 골든 아님.");
        for (Class<?> c : SEEN_CLASSES) {
            Set<String> names = new TreeSet<>();
            for (Method m : c.getDeclaredMethods()) {
                if (m.isSynthetic() || m.getName().startsWith("lambda$")) continue;
                names.add(m.getName());
            }
            for (String n : names) {
                if (!REACHED.contains(c.getName() + "#" + n)) lines.add(c.getSimpleName() + "#" + n);
            }
        }
        Files.createDirectories(REPORT.getParent());
        Files.write(REPORT, lines, StandardCharsets.UTF_8);
        System.out.println("[mssql-sql] 도달하지 않은 메서드 " + (lines.size() - 1) + "개 → " + REACHED.size()
                + "개 도달. 목록: " + REPORT.toAbsolutePath());
    }

    // ─────────────────────────────────────────────────────────────────────

    private static void verify(String label, String[] profiles, Fixture fixture) throws Exception {
        Recorder rec = new Recorder(fixture);
        EntityManager em = rec.entityManager();

        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        DataInitializer initializer = new DataInitializer(new FixedPasswordEncoder(), env);

        SecMenuNativeRepository secMenuNativeRepository = new SecMenuNativeRepository();
        ReflectionTestUtils.setField(secMenuNativeRepository, "entityManager", em);

        ReflectionTestUtils.setField(initializer, "entityManager", em);
        ReflectionTestUtils.setField(initializer, "secMenuNativeRepository", secMenuNativeRepository);
        ReflectionTestUtils.setField(initializer, "ruleMasterRepository", rec.ruleMasterRepository());
        ReflectionTestUtils.setField(initializer, "initEnabled", true);
        // appHostJpaRepository · consoleCaravanHubConfigJpaRepository 는 null 그대로(secondary EMF — skip).

        initializer.run(null);

        List<String> actual = new ArrayList<>();
        actual.add("# DataInitializer MSSQL 경로 SQL 기록 — DataInitializerMssqlSqlCharacterizationTest 가 비교한다. 손으로 고치지 않는다.");
        actual.add("# 시나리오: " + label + " · 프로필=" + Arrays.toString(profiles) + " · 고정값=" + fixture
                + " · 방언=" + MSSQL_PRODUCT_NAME);
        actual.add("# 형식: 순번 | 종류 | SQL(이스케이프) 또는 @만든 줄 순번 | 파라미터(이름순) | => 반환");
        actual.add("# 다시 쓰기: MSSQLSQL_UPDATE=true ../gradlew :api:test --tests '*DataInitializerMssqlSqlCharacterizationTest'");
        actual.add("# 기록 호출 수: " + rec.lines.size());
        actual.addAll(rec.lines);

        Path golden = GOLDEN_DIR.resolve("data-initializer-mssql-sql." + label + ".golden.txt");
        boolean update = Boolean.getBoolean("mssqlsql.update")
                || "true".equalsIgnoreCase(System.getenv("MSSQLSQL_UPDATE"));
        if (update || !Files.exists(golden)) {
            Files.createDirectories(golden.getParent());
            Files.writeString(golden, String.join("\n", actual) + "\n", StandardCharsets.UTF_8);
            System.out.println("[mssql-sql] 골든을 새로 썼다: " + golden.toAbsolutePath() + " (호출 " + rec.lines.size() + "건)");
            return;
        }
        String goldenText = Files.readString(golden, StandardCharsets.UTF_8);
        String actualText = String.join("\n", actual) + "\n";
        if (goldenText.equals(actualText)) {
            System.out.println("[mssql-sql] " + label + " 골든 일치 (호출 " + rec.lines.size() + "건)");
            return;
        }
        fail(diffMessage(golden, List.of(goldenText.split("\n", -1)), List.of(actualText.split("\n", -1))));
    }

    /** 첫 차이 줄과 앞뒤 3줄을 골든·실제 양쪽으로 보여 준다. */
    private static String diffMessage(Path golden, List<String> exp, List<String> act) {
        int i = 0;
        while (i < exp.size() && i < act.size() && exp.get(i).equals(act.get(i))) i++;
        String line = i < act.size() ? act.get(i) : (i < exp.size() ? exp.get(i) : "");
        String seq = line.matches("^\\d{5} \\|.*") ? "기록 순번 " + line.substring(0, 5) + " · " : "";
        StringBuilder sb = new StringBuilder();
        sb.append("MSSQL 경로 SQL 이 골든(").append(golden).append(")과 다르다 — 첫 차이는 ").append(seq).append("파일 ")
                .append(i + 1).append("번째 줄(골든 ").append(exp.size()).append("줄 · 실제 ").append(act.size()).append("줄).\n")
                .append("의도한 변경이면 MSSQLSQL_UPDATE=true 로 다시 써서 골든 diff 를 함께 커밋한다.\n");
        appendWindow(sb, "골든", exp, i);
        appendWindow(sb, "실제", act, i);
        return sb.toString();
    }

    private static void appendWindow(StringBuilder sb, String title, List<String> lines, int at) {
        sb.append("── ").append(title).append(" ──\n");
        for (int k = Math.max(0, at - 3); k <= Math.min(lines.size() - 1, at + 3); k++) {
            sb.append(k == at ? ">> " : "   ").append(k + 1).append(": ").append(lines.get(k)).append('\n');
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 기록기 — EntityManager·Query·Session·Connection·DatabaseMetaData·RuleMasterRepository 가짜
    // ─────────────────────────────────────────────────────────────────────

    private static final class Recorder {
        final Fixture fixture;
        final List<String> lines = new ArrayList<>();

        Recorder(Fixture fixture) {
            this.fixture = fixture;
        }

        int record(String kind, String sqlCol, String paramsCol, String returnCol) {
            noteStack();
            int seq = lines.size() + 1;
            lines.add(String.format("%05d | %s | %s | %s | %s", seq, kind, sqlCol, paramsCol, returnCol).stripTrailing());
            return seq;
        }

        EntityManager entityManager() {
            return proxy(EntityManager.class, (p, m, a) -> {
                switch (m.getName()) {
                    case "createNativeQuery": {
                        String sql = (String) a[0];
                        String extra = a.length > 1 ? describe(a[1]) : "";
                        int seq = record("createNativeQuery", escape(sql), extra, "");
                        return query(seq, sql);
                    }
                    case "flush":
                        record("flush", "", "", "");
                        return null;
                    case "unwrap":
                        record("unwrap", "", ((Class<?>) a[0]).getName(), "");
                        if (a[0] == Session.class) return session();
                        throw new UnsupportedOperationException("가짜 EntityManager.unwrap 미지원: " + a[0]);
                    default:
                        throw new UnsupportedOperationException("가짜 EntityManager 가 모르는 호출: " + m);
                }
            });
        }

        private Query query(int createdSeq, String sql) {
            Map<String, String> params = new TreeMap<>();
            String ref = String.format("@%05d", createdSeq);
            return proxy(Query.class, (p, m, a) -> {
                switch (m.getName()) {
                    case "setParameter": {
                        params.put(paramName(a[0]), describe(a[1]));
                        return p;
                    }
                    case "executeUpdate": {
                        int r = fixture.executeUpdate(sql);
                        record("executeUpdate", ref, join(params), "=> " + r);
                        return r;
                    }
                    case "getSingleResult": {
                        Object r = fixture.singleResult(sql);
                        record("getSingleResult", ref, join(params), "=> " + describe(r));
                        return r;
                    }
                    case "getResultList": {
                        List<?> r = fixture.resultList(sql);
                        record("getResultList", ref, join(params), "=> " + describe(r));
                        return r;
                    }
                    default:
                        if (m.getReturnType() == Query.class) {      // setMaxResults·setHint 같은 체이닝 메서드
                            record(m.getName(), ref, describe(a == null ? List.of() : Arrays.asList(a)), "");
                            return p;
                        }
                        throw new UnsupportedOperationException("가짜 Query 가 모르는 호출: " + m);
                }
            });
        }

        private Session session() {
            return proxy(Session.class, (p, m, a) -> {
                switch (m.getName()) {
                    case "doReturningWork":
                        record("doReturningWork", "", "", "");
                        return ((ReturningWork<?>) a[0]).execute(connection());
                    case "doWork":
                        record("doWork", "", "", "");
                        ((Work) a[0]).execute(connection());
                        return null;
                    default:
                        throw new UnsupportedOperationException("가짜 Session 이 모르는 호출: " + m);
                }
            });
        }

        private Connection connection() {
            return proxy(Connection.class, (p, m, a) -> {
                if (m.getName().equals("getMetaData")) return metaData();
                throw new UnsupportedOperationException("가짜 Connection 이 모르는 호출: " + m);
            });
        }

        private DatabaseMetaData metaData() {
            return proxy(DatabaseMetaData.class, (p, m, a) -> {
                if (m.getName().equals("getDatabaseProductName")) {
                    record("getDatabaseProductName", "", "", "=> " + MSSQL_PRODUCT_NAME);
                    return MSSQL_PRODUCT_NAME;
                }
                throw new UnsupportedOperationException("가짜 DatabaseMetaData 가 모르는 호출: " + m);
            });
        }

        RuleMasterRepository ruleMasterRepository() {
            return proxy(RuleMasterRepository.class, (p, m, a) -> {
                switch (m.getName()) {
                    case "existsById": {
                        boolean r = fixture.ruleMasterExists(a[0]);
                        record("ruleMaster.existsById", "", describe(a[0]), "=> " + r);
                        return r;
                    }
                    case "saveAll": {
                        List<String> rows = new ArrayList<>();
                        for (Object e : (Iterable<?>) a[0]) rows.add(entity(e));
                        record("ruleMaster.saveAll", "", escape(String.join("\n", rows)), "");
                        return a[0] instanceof List<?> l ? l : List.copyOf((Collection<?>) a[0]);
                    }
                    default:
                        throw new UnsupportedOperationException("가짜 RuleMasterRepository 가 모르는 호출: " + m);
                }
            });
        }

        /** 기록 시점 호출 스택에서 init 패키지(분할 뒤 Seeder 포함) 메서드를 모은다 — 진단 전용, 골든에는 넣지 않는다. */
        private void noteStack() {
            StackWalker.getInstance(StackWalker.Option.RETAIN_CLASS_REFERENCE).forEach(f -> {
                Class<?> c = f.getDeclaringClass();
                if (c.getName().startsWith(INIT_PACKAGE) && !c.getName().contains("Test")) {
                    SEEN_CLASSES.add(c);
                    REACHED.add(c.getName() + "#" + f.getMethodName());
                }
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return (T) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[] {type}, (p, m, a) -> {
            if (m.getDeclaringClass() == Object.class) {
                return switch (m.getName()) {
                    case "equals" -> p == a[0];
                    case "hashCode" -> System.identityHashCode(p);
                    default -> "Fake" + type.getSimpleName();
                };
            }
            return handler.invoke(p, m, a);
        });
    }

    private static String paramName(Object key) {
        if (key instanceof String s) return s;
        if (key instanceof Integer i) return "?" + i;
        if (key instanceof Parameter<?> prm) return prm.getName() != null ? prm.getName() : "?" + prm.getPosition();
        return String.valueOf(key);
    }

    private static String join(Map<String, String> params) {
        return params.entrySet().stream().map(e -> e.getKey() + "=" + e.getValue()).collect(Collectors.joining(", "));
    }

    /** 값 표기 — null·문자열은 그대로, 그 밖에는 {@code (타입)값}. 줄바꿈은 이스케이프. */
    private static String describe(Object v) {
        if (v == null) return "null";
        if (v instanceof String s) return escape(s);
        if (v instanceof Class<?> c) return "(Class)" + c.getName();
        if (v instanceof BigDecimal b) return "(BigDecimal)" + b.toPlainString();
        if (v instanceof Collection<?> c) {
            return c.stream().map(DataInitializerMssqlSqlCharacterizationTest::describe)
                    .collect(Collectors.joining(", ", "[", "]"));
        }
        return "(" + v.getClass().getSimpleName() + ")" + escape(String.valueOf(v));
    }

    /** 엔티티 한 건 — 클래스 계층의 인스턴스 필드를 (상위 클래스부터, 이름순) {@code 필드=값} 으로 나열한다. */
    private static String entity(Object e) {
        List<Class<?>> chain = new ArrayList<>();
        for (Class<?> c = e.getClass(); c != null && c != Object.class; c = c.getSuperclass()) chain.add(0, c);
        List<String> parts = new ArrayList<>();
        for (Class<?> c : chain) {
            Field[] fields = c.getDeclaredFields();
            Arrays.sort(fields, Comparator.comparing(Field::getName));
            for (Field f : fields) {
                if (Modifier.isStatic(f.getModifiers()) || f.isSynthetic()) continue;
                f.setAccessible(true);
                try {
                    parts.add(f.getName() + "=" + describe(f.get(e)));
                } catch (IllegalAccessException ex) {
                    throw new IllegalStateException(ex);
                }
            }
        }
        return e.getClass().getSimpleName() + "{" + String.join(", ", parts) + "}";
    }

    private static String escape(String s) {
        return s.replace("\\", "\\\\").replace("\r", "\\r").replace("\n", "\\n").replace("\t", "\\t");
    }

    /** BCrypt 솔트 랜덤성을 없앤 고정 인코더. */
    private static final class FixedPasswordEncoder extends PasswordEncoder {
        @Override
        public String encode(String rawPassword) {
            return FIXED_ENC_PWD;
        }
    }
}
