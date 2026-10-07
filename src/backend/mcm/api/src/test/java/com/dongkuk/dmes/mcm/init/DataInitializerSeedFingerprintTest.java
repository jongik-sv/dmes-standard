package com.dongkuk.dmes.mcm.init;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.common.event.MenuChangedEvent;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.common.audit.SecurityIdentityHolder;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
import com.dongkuk.dmes.mcm.db.McmSchemaMigrator;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * DataInitializer 시드 결과 지문(fingerprint) 특성 테스트 — 클래스 분할 전후로 시드 결과가 한 글자도 바뀌지 않았는지 고정한다.
 *
 * <p><b>구성</b> — Oracle 시험 PDB 의 네 스키마를 비우고 Flyway 기준선으로 다시 만든 뒤({@link McmOraTestDb#resetSchemas()}),
 * local 프로필로 {@link DataInitializer#run} 을 실제 트랜잭션 경계(TransactionTemplate) 안에서 한 번 돌린다. EMF 스캔 범위·하이버네이트
 * 속성은 {@code JpaConfig} 와 같다(OracleDialect, hbm2ddl none, Instant=TIMESTAMP·boolean=TINYINT).
 * 2026-10-07 oracle-1007 — SQLite(ddl-auto update) 에서 Oracle 로 옮기며 골든을 다시 만들었다. 옛 SQLite 골든과는 표별 행 수가 같다
 * (스키마 접두가 생긴 키·Oracle 에만 있는 표 제외 — docs/oracle-1007/memo-ora-mcm-app.md).
 * <ul>
 *   <li>PasswordEncoder — BCrypt 는 솔트가 랜덤이라 고정값을 돌려주는 스텁. USER_ENC_PWD 는 그래서 해시에 포함한다.</li>
 *   <li>RuleMasterRepository — {@link JpaRepositoryFactory} 로 같은 공유 EntityManager 위에 실제 저장소를 만든다(규칙 샘플 6행 포함).</li>
 *   <li>caravan 저장소 2개(AppHost·CaravanHubConfig) — secondary EMF 라 null(skip). 지문 범위 밖이다.</li>
 *   <li>initEnabled — 필드 기본값이 false 라 true 로 넣는다(@Value 기본 true 와 같게).</li>
 * </ul>
 *
 * <p><b>지문</b> — mcm 스키마 4개(ALL_TABLES, Flyway 이력 표 제외)의 표를 {@code 스키마.표} 이름순으로 나열하고 표마다
 * {@code 스키마.표=행수:SHA-256} 한 줄을 만든다. 행은 ALL_TAB_COLUMNS(COLUMN_ID 순) 의 {@code 컬럼명=값} 직렬화(NULL 은 맨 글자
 * NULL, 값은 작은따옴표로 감싼다 — 문자열 'NULL' 과 구별)를 정렬해 해시한다. 실행 시각이 들어가는 {@link #TIME_COLUMNS} 는 직렬화
 * 전에 뺀다(정렬이 시각에 끌려가지 않게). VER 은 남긴다 — UPDATE 실행 횟수, 곧 시드 순서 회귀를 잡는다. 객체·칸 정의
 * (ALL_OBJECTS·ALL_TAB_COLUMNS)는 {@code __SCHEMA__} 줄 하나로 따로 해시한다.
 *
 * <p><b>골든 갱신</b> — {@code -Dfingerprint.update=true} 또는 환경 변수 {@code FINGERPRINT_UPDATE=true} 면
 * 비교하지 않고 골든을 새로 쓴다. 갱신을 요청하지 않았는데 골든 파일이 없으면 실패한다(다른 작업 디렉터리에서 돌려 골든을 못 찾고
 * 새로 쓴 뒤 회귀를 놓친 채 통과하는 일을 막는다). mcm 의 build.gradle 은 시스템 속성을 테스트 JVM 으로 넘기지 않으므로 gradle 실행에서는
 * 환경 변수를 쓴다: {@code FINGERPRINT_UPDATE=true ../gradlew :api:test --tests '*DataInitializerSeedFingerprintTest'}.
 * 골든은 classpath 사본이 아니라 소스 경로(작업 디렉터리 mcm/api 기준)를 읽고 쓴다. 비교 전에 읽은 골든과 실제 값의 줄바꿈을
 * {@code \n} 으로 맞춘다(Windows 체크아웃의 CRLF 대비).
 */
class DataInitializerSeedFingerprintTest {

    private static final Path GOLDEN = Path.of("src/test/resources/init/data-initializer-fingerprint.golden.txt");

    /** 실행 시각이 들어가는 컬럼 — 해시에서 뺀다(시드의 SYSTIMESTAMP, McmAuditListener Instant.now()). */
    static final Set<String> TIME_COLUMNS = Set.of("C_AT", "U_AT", "START_ACTIVE_DATE", "LAST_PWD_CHNG_DATE");

    private static final String SCHEMA_KEY = "__SCHEMA__";
    private static final String FIXED_ENC_PWD = "{fingerprint-stub}fixed-encoded-password";

    /** 지문에서 뺄 표 — 스키마마다 있는 Flyway 이력(적용 시각·실행 시간이 들어간다). */
    private static final String FLYWAY_HISTORY = "flyway_schema_history";

    private static HikariDataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean emfBean;
    private static SecurityIdentity prevIdentity;
    private static SecurityContext prevSecurityContext;
    private static long seedStartMillis;
    private static long seedEndMillis;
    /** 시드가 낸 이벤트와 그때 트랜잭션이 열려 있었는지 — 메뉴 카탈로그 무효화(MenuChangedEvent SEED) 확인용. */
    private static final List<Object> publishedEvents = new ArrayList<>();
    private static final List<Boolean> publishedInTx = new ArrayList<>();

    @BeforeAll
    static void seedEmptySchemas() throws Exception {
        prevIdentity = SecurityIdentityHolder.get();
        prevSecurityContext = SecurityContextHolder.getContext();
        // 인증 없는 부팅과 같게 — inspector·listener 의 사용자 ID 가 결정적 폴백("system"·null)을 쓰도록 비운다.
        // inspector 는 SecurityIdentityHolder → SecurityContextHolder(스레드 로컬) 순으로 보므로 둘 다 비운다
        // (모듈 전체 시험에서 앞선 시험이 같은 스레드에 인증을 남겨 U_USR_ID·C_USR_ID 가 흔들리는 일을 막는다).
        SecurityIdentityHolder.set(null);
        SecurityContextHolder.clearContext();

        McmOraTestDb.resetSchemas();
        dataSource = McmOraTestDb.appDataSource("mcm-seed-fingerprint");

        // JpaConfig#entityManagerFactory 와 같은 구성(OracleDialect·ddl none·Instant/boolean 공통 설정).
        emfBean = new LocalContainerEntityManagerFactoryBean();
        emfBean.setDataSource(dataSource);
        emfBean.setJpaVendorAdapter(new org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter());
        emfBean.setJpaProperties(McmOraTestDb.jpaProperties(Map.of("hibernate.show_sql", "false")));
        emfBean.setPersistenceUnitName("default");
        emfBean.setPackagesToScan(
                "com.dongkuk.dmes.cactus.security.auth",
                "com.dongkuk.dmes.cactus.mastercode",
                "com.dongkuk.dmes.mcm");
        emfBean.setPersistenceProviderClass(org.hibernate.jpa.HibernatePersistenceProvider.class);
        emfBean.afterPropertiesSet();
        EntityManagerFactory emf = emfBean.getObject();
        EntityManager sharedEm = SharedEntityManagerCreator.createSharedEntityManager(emf);

        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("local");
        DataInitializer initializer = new DataInitializer(new FixedPasswordEncoder(), env);

        SecMenuNativeRepository secMenuNativeRepository = new SecMenuNativeRepository();
        ReflectionTestUtils.setField(secMenuNativeRepository, "entityManager", sharedEm);
        RuleMasterRepository ruleMasterRepository =
                new JpaRepositoryFactory(sharedEm).getRepository(RuleMasterRepository.class);

        ReflectionTestUtils.setField(initializer, "entityManager", sharedEm);
        ReflectionTestUtils.setField(initializer, "secMenuNativeRepository", secMenuNativeRepository);
        ReflectionTestUtils.setField(initializer, "ruleMasterRepository", ruleMasterRepository);
        ReflectionTestUtils.setField(initializer, "initEnabled", true);
        ReflectionTestUtils.setField(initializer, "eventPublisher", (ApplicationEventPublisher) event -> {
            publishedEvents.add(event);
            publishedInTx.add(TransactionSynchronizationManager.isActualTransactionActive());
        });
        // appHostJpaRepository · consoleCaravanHubConfigJpaRepository 는 null 그대로(secondary EMF — skip).

        seedStartMillis = System.currentTimeMillis();
        new TransactionTemplate(new JpaTransactionManager(emf)).executeWithoutResult(s -> initializer.run(null));
        seedEndMillis = System.currentTimeMillis();
    }

    @AfterAll
    static void tearDown() throws Exception {
        SecurityIdentityHolder.set(prevIdentity);
        SecurityContextHolder.setContext(prevSecurityContext);
        if (emfBean != null) emfBean.destroy();
        if (dataSource != null) dataSource.close();
    }

    @Test
    @DisplayName("빈 Oracle 스키마(Flyway 기준선)에 local 시드를 돌린 결과(표별 행 수·정규화 해시·스키마 정의)가 골든과 같다")
    void seedFingerprintMatchesGolden() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Map<String, String> actual = new TreeMap<>();
        fingerprint(jdbc).forEach((k, v) -> actual.put(normalizeNewlines(k), normalizeNewlines(v)));

        boolean update = Boolean.getBoolean("fingerprint.update")
                || "true".equalsIgnoreCase(System.getenv("FINGERPRINT_UPDATE"));
        if (!update) {
            assertThat(Files.exists(GOLDEN))
                    .as("골든 파일이 없다(%s) — 작업 디렉터리가 mcm/api 인지 확인하고, 처음 만드는 것이면 FINGERPRINT_UPDATE=true 로 돌린다",
                            GOLDEN.toAbsolutePath())
                    .isTrue();
        }
        if (update) {
            writeGolden(actual);
            System.out.println("[fingerprint] 골든을 새로 썼다: " + GOLDEN.toAbsolutePath() + " (" + actual.size() + " 줄)");
            return;
        }

        Map<String, String> golden = readGolden();
        List<String> diffs = new ArrayList<>();
        for (Map.Entry<String, String> e : golden.entrySet()) {
            String now = actual.get(e.getKey());
            if (now == null) {
                diffs.add("- 사라짐   " + e.getKey() + "=" + e.getValue());
            } else if (!now.equals(e.getValue())) {
                diffs.add("~ 달라짐   " + e.getKey() + " 골든=" + e.getValue() + " 실제=" + now);
            }
        }
        for (Map.Entry<String, String> e : actual.entrySet()) {
            if (!golden.containsKey(e.getKey())) {
                diffs.add("+ 새로 생김 " + e.getKey() + "=" + e.getValue());
            }
        }
        assertThat(diffs)
                .as("시드 지문이 골든(%s)과 다르다 — 의도한 변경이면 FINGERPRINT_UPDATE=true 로 다시 써서 골든 diff 를 함께 커밋한다:%n%s",
                        GOLDEN, String.join(System.lineSeparator(), diffs))
                .isEmpty();
    }

    @Test
    @DisplayName("시드 끝에 트랜잭션 안에서 MenuChangedEvent(SEED) 를 한 번 낸다 — 메뉴 카탈로그가 즉시·트랜잭션이 끝난 뒤(커밋·롤백) 비워진다")
    void seedPublishesMenuChangedEventInsideTransaction() {
        assertThat(publishedEvents).containsExactly(new MenuChangedEvent(MenuChangedEvent.SEED));
        assertThat(publishedInTx).containsExactly(true);
    }

    /**
     * 지문에 실행 시각이 섞이지 않았는지 지킨다 — 해시에 들어가는 값에 오늘 날짜(UTC·로컬)나 시드 시각 근처의 epoch 수가 있으면
     * 새 시각 컬럼이 생긴 것이니 {@link #TIME_COLUMNS} 에 넣어야 한다(그대로 두면 지문이 날마다·초마다 흔들린다).
     */
    @Test
    @DisplayName("해시에 들어가는 값에 실행 시각(오늘 날짜·현재 epoch)이 섞이지 않는다")
    void hashedValuesHaveNoRuntimeTimestamp() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Set<String> dates = new LinkedHashSet<>();
        for (long t : new long[] {seedStartMillis, seedEndMillis}) {
            dates.add(LocalDate.ofInstant(java.time.Instant.ofEpochMilli(t), ZoneOffset.UTC).toString());
            dates.add(LocalDate.ofInstant(java.time.Instant.ofEpochMilli(t), ZoneId.systemDefault()).toString());
        }
        long lo = seedStartMillis - 3_600_000L;
        long hi = seedEndMillis + 3_600_000L;

        List<String> hits = new ArrayList<>();
        for (String table : tables(jdbc)) {
            List<String> cols = hashedColumns(jdbc, table);
            if (cols.isEmpty()) continue;
            jdbc.query(selectValues(table, cols), rs -> {
                for (int i = 0; i < cols.size(); i++) {
                    String v = rs.getString(i + 1);
                    if (v == null) continue;
                    boolean hit = dates.stream().anyMatch(v::contains);
                    if (!hit && v.matches("\\d{10,13}(\\.\\d+)?")) {
                        long n = (long) Double.parseDouble(v);
                        long ms = v.length() >= 13 ? n : n * 1000L;
                        hit = ms >= lo && ms <= hi;
                    }
                    if (hit) hits.add(table + "." + cols.get(i) + "=" + v);
                }
            });
        }
        assertThat(hits).as("시각 값이 지문 해시에 섞였다 — TIME_COLUMNS 에 추가 필요").isEmpty();
    }

    // ─────────────────────────────────────────────────────────────────────

    /** 표 이름순 {@code 스키마.표 → 행수:해시} + {@code __SCHEMA__ → 정의수:해시}. */
    static Map<String, String> fingerprint(JdbcTemplate jdbc) throws Exception {
        Map<String, String> out = new TreeMap<>();
        for (String table : tables(jdbc)) {
            List<String> cols = hashedColumns(jdbc, table);
            List<String> rows = new ArrayList<>();
            if (cols.isEmpty()) {
                Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
                for (int i = 0; i < (n == null ? 0 : n); i++) rows.add("");
            } else {
                jdbc.query(selectValues(table, cols), rs -> {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < cols.size(); i++) {
                        if (i > 0) sb.append('\u001F');
                        String v = rs.getString(i + 1);
                        sb.append(cols.get(i)).append('=').append(v == null ? "NULL" : "'" + v.replace("'", "''") + "'");
                    }
                    rows.add(sb.toString());
                });
            }
            rows.sort(null);
            String header = "cols=" + String.join(",", cols);
            out.put(table, rows.size() + ":" + sha256(header + "\n" + String.join("\n", rows)));
        }
        List<String> defs = new ArrayList<>(jdbc.query(
                "SELECT OWNER || '|' || OBJECT_TYPE || '|' || OBJECT_NAME FROM ALL_OBJECTS"
                        + " WHERE OWNER IN (" + ownerList() + ") AND OBJECT_NAME NOT LIKE 'SYS\\_%' ESCAPE '\\'"
                        + " AND OBJECT_NAME NOT LIKE 'ISEQ$$%' AND OBJECT_NAME NOT LIKE 'BIN$%'"
                        + " AND OBJECT_NAME NOT LIKE '" + FLYWAY_HISTORY + "%'",
                (rs, i) -> rs.getString(1)));
        defs.addAll(jdbc.query(
                "SELECT OWNER || '|' || TABLE_NAME || '|' || COLUMN_NAME || '|' || DATA_TYPE || '|' || DATA_LENGTH || '|'"
                        + " || DATA_PRECISION || '|' || DATA_SCALE || '|' || NULLABLE FROM ALL_TAB_COLUMNS"
                        + " WHERE OWNER IN (" + ownerList() + ") AND TABLE_NAME NOT LIKE '" + FLYWAY_HISTORY + "%'",
                (rs, i) -> rs.getString(1)));
        defs.sort(null);
        out.put(SCHEMA_KEY, defs.size() + ":" + sha256(String.join("\n", defs)));
        return out;
    }

    /** mcm 스키마 4개의 표({@code 스키마."표"}) — Flyway 이력 표 제외. 앱 사용자는 다른 스키마 표를 GRANT 로 본다. */
    private static List<String> tables(JdbcTemplate jdbc) {
        return jdbc.query(
                "SELECT OWNER, TABLE_NAME FROM ALL_TABLES WHERE OWNER IN (" + ownerList() + ")"
                        + " AND TABLE_NAME <> '" + FLYWAY_HISTORY + "' ORDER BY OWNER, TABLE_NAME",
                (rs, i) -> rs.getString(1) + "." + ident(rs.getString(2)));
    }

    /** ALL_TAB_COLUMNS(COLUMN_ID 순) 컬럼 중 시각 컬럼을 뺀 목록. {@code table} 은 {@link #tables} 의 {@code 스키마."표"}. */
    private static List<String> hashedColumns(JdbcTemplate jdbc, String table) {
        int dot = table.indexOf('.');
        String owner = table.substring(0, dot);
        String name = table.substring(dot + 2, table.length() - 1).replace("\"\"", "\"");
        return jdbc.queryForList(
                        "SELECT COLUMN_NAME FROM ALL_TAB_COLUMNS WHERE OWNER = ? AND TABLE_NAME = ? ORDER BY COLUMN_ID",
                        String.class, owner, name).stream()
                .filter(c -> !TIME_COLUMNS.contains(c.toUpperCase()))
                .toList();
    }

    /** 값 SELECT — 값은 호출자가 getString 으로 읽는다(일시는 ojdbc 가 NLS 와 무관한 고정 형식으로 낸다). */
    private static String selectValues(String table, List<String> cols) {
        return "SELECT " + cols.stream().map(DataInitializerSeedFingerprintTest::ident).collect(Collectors.joining(", "))
                + " FROM " + table;
    }

    private static String ownerList() {
        return McmSchemaMigrator.SCHEMAS.stream().map(o -> "'" + o + "'").collect(Collectors.joining(", "));
    }

    private static String ident(String name) {
        return '"' + name.replace("\"", "\"\"") + '"';
    }

    private static String sha256(String s) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
    }

    private static void writeGolden(Map<String, String> fp) throws Exception {
        List<String> lines = new ArrayList<>();
        lines.add("# DataInitializer 시드 지문 — DataInitializerSeedFingerprintTest 가 비교한다. 손으로 고치지 않는다.");
        lines.add("# 형식: 스키마.\"표\"=행수:SHA-256(정렬한 행, 시각 컬럼 제외). " + SCHEMA_KEY + " = ALL_OBJECTS·ALL_TAB_COLUMNS 정의 수:해시.");
        lines.add("# 해시에서 뺀 컬럼: " + new TreeSet<>(TIME_COLUMNS));
        lines.add("# 다시 쓰기: FINGERPRINT_UPDATE=true ../gradlew :api:test --tests '*DataInitializerSeedFingerprintTest'");
        fp.forEach((k, v) -> lines.add(k + "=" + v));
        Files.createDirectories(GOLDEN.getParent());
        Files.write(GOLDEN, lines, StandardCharsets.UTF_8);
    }

    private static Map<String, String> readGolden() throws Exception {
        Map<String, String> out = new LinkedHashMap<>();
        for (String line : normalizeNewlines(Files.readString(GOLDEN, StandardCharsets.UTF_8)).split("\n")) {
            String t = line.strip();
            if (t.isEmpty() || t.startsWith("#")) continue;
            int eq = t.lastIndexOf('=');
            out.put(t.substring(0, eq), t.substring(eq + 1));
        }
        return out;
    }

    /** 줄바꿈을 {@code \n} 으로 맞춘다 — Windows 체크아웃(autocrlf)에서 골든이 CRLF 로 바뀌어도 같은 내용이면 같게 본다. */
    private static String normalizeNewlines(String s) {
        return s.replace("\r\n", "\n").replace('\r', '\n');
    }

    /** BCrypt 솔트 랜덤성을 없앤 고정 인코더 — USER_ENC_PWD 를 결정적으로 만든다. */
    private static final class FixedPasswordEncoder extends PasswordEncoder {
        @Override
        public String encode(String rawPassword) {
            return FIXED_ENC_PWD;
        }
    }
}
