package com.dongkuk.dmes.mcm.init;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.common.audit.SecurityIdentityHolder;
import com.dongkuk.dmes.mcm.repository.RuleMasterRepository;
import com.dongkuk.dmes.mcm.repository.SecMenuNativeRepository;
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
import java.util.Properties;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.support.JpaRepositoryFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.SharedEntityManagerCreator;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * DataInitializer 시드 결과 지문(fingerprint) 특성 테스트 — 클래스 분할 전후로 시드 결과가 한 글자도 바뀌지 않았는지 고정한다.
 *
 * <p><b>구성</b> — 빈 SQLite 임시 파일 DB 에 local 프로필로 {@link DataInitializer#run} 을 실제 트랜잭션 경계(TransactionTemplate)
 * 안에서 한 번 돌린다. EMF 스캔 범위·하이버네이트 속성은 {@code JpaConfig} 의 SQLite 분기와 같다(hbm2ddl update, SQLiteDialect,
 * metadata individually, {@link McmAuditStatementInspector}, SqliteTemporalConverterContributor).
 * <ul>
 *   <li>PasswordEncoder — BCrypt 는 솔트가 랜덤이라 고정값을 돌려주는 스텁. USER_ENC_PWD 는 그래서 해시에 포함한다.</li>
 *   <li>RuleMasterRepository — {@link JpaRepositoryFactory} 로 같은 공유 EntityManager 위에 실제 저장소를 만든다(규칙 샘플 6행 포함).</li>
 *   <li>caravan 저장소 2개(AppHost·CaravanHubConfig) — secondary EMF 라 null(skip). 지문 범위 밖이다.</li>
 *   <li>initEnabled — 필드 기본값이 false 라 true 로 넣는다(@Value 기본 true 와 같게).</li>
 * </ul>
 *
 * <p><b>지문</b> — sqlite_master 의 테이블을 이름순으로 나열하고 테이블마다 {@code 테이블=행수:SHA-256} 한 줄을 만든다.
 * 행은 PRAGMA table_info 순서의 {@code 컬럼명=quote(값)} 직렬화(NULL 은 quote 의 맨 글자 NULL — 문자열 'NULL' 과 구별)를
 * 정렬해 해시한다. rowid 는 쓰지 않는다. 실행 시각이 들어가는 {@link #TIME_COLUMNS} 는 직렬화 전에 뺀다(정렬이 시각에 끌려가지
 * 않게). VER 은 남긴다 — UPDATE 실행 횟수, 곧 시드 순서 회귀를 잡는다. 테이블·뷰·인덱스 정의(sqlite_master.sql)는
 * {@code __SCHEMA__} 줄 하나로 따로 해시한다.
 *
 * <p><b>골든 갱신</b> — 골든 파일이 없거나 {@code -Dfingerprint.update=true} 또는 환경 변수 {@code FINGERPRINT_UPDATE=true} 면
 * 비교하지 않고 골든을 새로 쓴다. mcm 의 build.gradle 은 시스템 속성을 테스트 JVM 으로 넘기지 않으므로 gradle 실행에서는
 * 환경 변수를 쓴다: {@code FINGERPRINT_UPDATE=true ../gradlew :api:test --tests '*DataInitializerSeedFingerprintTest'}.
 * 골든은 classpath 사본이 아니라 소스 경로(작업 디렉터리 mcm/api 기준)를 읽고 쓴다.
 */
class DataInitializerSeedFingerprintTest {

    private static final Path GOLDEN = Path.of("src/test/resources/init/data-initializer-fingerprint.golden.txt");

    /** 실행 시각이 들어가는 컬럼 — 해시에서 뺀다(SYSDATETIME()→CURRENT_TIMESTAMP, McmAuditListener Instant.now()). */
    static final Set<String> TIME_COLUMNS = Set.of("C_AT", "U_AT", "START_ACTIVE_DATE", "LAST_PWD_CHNG_DATE");

    private static final String SCHEMA_KEY = "__SCHEMA__";
    private static final String FIXED_ENC_PWD = "{fingerprint-stub}fixed-encoded-password";

    private static Path dbFile;
    private static HikariDataSource dataSource;
    private static LocalContainerEntityManagerFactoryBean emfBean;
    private static boolean prevInspectorSqlite;
    private static SecurityIdentity prevIdentity;
    private static SecurityContext prevSecurityContext;
    private static long seedStartMillis;
    private static long seedEndMillis;

    @BeforeAll
    static void seedEmptySqlite() throws Exception {
        prevInspectorSqlite = McmAuditStatementInspector.isSqlite();
        prevIdentity = SecurityIdentityHolder.get();
        prevSecurityContext = SecurityContextHolder.getContext();
        // 인증 없는 부팅과 같게 — inspector·listener 의 사용자 ID 가 결정적 폴백("system"·null)을 쓰도록 비운다.
        // inspector 는 SecurityIdentityHolder → SecurityContextHolder(스레드 로컬) 순으로 보므로 둘 다 비운다
        // (모듈 전체 시험에서 앞선 시험이 같은 스레드에 인증을 남겨 U_USR_ID·C_USR_ID 가 흔들리는 일을 막는다).
        SecurityIdentityHolder.set(null);
        SecurityContextHolder.clearContext();

        dbFile = Files.createTempFile("mcm-seed-fingerprint", ".db");
        Files.delete(dbFile);
        dataSource = new HikariDataSource();
        dataSource.setJdbcUrl("jdbc:sqlite:" + dbFile);

        // JpaConfig#entityManagerFactory 의 SQLite 분기와 같은 구성(ddl-auto 는 application-local.yml 의 update).
        Properties props = new Properties();
        props.put("hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect");
        props.put("hibernate.hbm2ddl.auto", "update");
        props.put("hibernate.show_sql", "false");
        props.put("hibernate.format_sql", "true");
        props.put("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually");
        props.put("hibernate.session_factory.statement_inspector",
                "com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector");
        McmAuditStatementInspector.setSqlite(true);
        props.put("hibernate.metadata_builder_contributor",
                "com.dongkuk.dmes.mcm.common.persistence.SqliteTemporalConverterContributor");

        emfBean = new LocalContainerEntityManagerFactoryBean();
        emfBean.setDataSource(dataSource);
        emfBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        emfBean.setJpaProperties(props);
        emfBean.setPersistenceUnitName("default");
        emfBean.setPackagesToScan(
                "com.dongkuk.dmes.cactus.security.auth",
                "com.dongkuk.dmes.cactus.mastercode",
                "com.dongkuk.dmes.mcm");
        emfBean.setPersistenceProviderClass(HibernatePersistenceProvider.class);
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
        // appHostJpaRepository · consoleCaravanHubConfigJpaRepository 는 null 그대로(secondary EMF — skip).

        seedStartMillis = System.currentTimeMillis();
        new TransactionTemplate(new JpaTransactionManager(emf)).executeWithoutResult(s -> initializer.run(null));
        seedEndMillis = System.currentTimeMillis();
    }

    @AfterAll
    static void tearDown() throws Exception {
        McmAuditStatementInspector.setSqlite(prevInspectorSqlite);
        SecurityIdentityHolder.set(prevIdentity);
        SecurityContextHolder.setContext(prevSecurityContext);
        if (emfBean != null) emfBean.destroy();
        if (dataSource != null) dataSource.close();
        if (dbFile != null) Files.deleteIfExists(dbFile);
    }

    @Test
    @DisplayName("빈 SQLite 에 local 시드를 돌린 결과(테이블별 행 수·정규화 해시·스키마 정의)가 골든과 같다")
    void seedFingerprintMatchesGolden() throws Exception {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Map<String, String> actual = fingerprint(jdbc);

        boolean update = Boolean.getBoolean("fingerprint.update")
                || "true".equalsIgnoreCase(System.getenv("FINGERPRINT_UPDATE"));
        if (update || !Files.exists(GOLDEN)) {
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
            String select = cols.stream().map(c -> "quote(" + ident(c) + ")").collect(Collectors.joining(", "));
            jdbc.query("SELECT " + select + " FROM " + ident(table), rs -> {
                for (int i = 0; i < cols.size(); i++) {
                    String v = rs.getString(i + 1);
                    if (v == null) continue;
                    boolean hit = dates.stream().anyMatch(v::contains);
                    String bare = v.startsWith("'") ? v.substring(1, v.length() - 1) : v;
                    if (!hit && bare.matches("\\d{10,13}(\\.\\d+)?")) {
                        long n = (long) Double.parseDouble(bare);
                        long ms = bare.length() >= 13 ? n : n * 1000L;
                        hit = ms >= lo && ms <= hi;
                    }
                    if (hit) hits.add(table + "." + cols.get(i) + "=" + v);
                }
            });
        }
        assertThat(hits).as("시각 값이 지문 해시에 섞였다 — TIME_COLUMNS 에 추가 필요").isEmpty();
    }

    // ─────────────────────────────────────────────────────────────────────

    /** 테이블 이름순 {@code 테이블 → 행수:해시} + {@code __SCHEMA__ → 정의수:해시}. */
    static Map<String, String> fingerprint(JdbcTemplate jdbc) throws Exception {
        Map<String, String> out = new TreeMap<>();
        for (String table : tables(jdbc)) {
            List<String> cols = hashedColumns(jdbc, table);
            List<String> rows = new ArrayList<>();
            if (cols.isEmpty()) {
                Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM " + ident(table), Integer.class);
                for (int i = 0; i < (n == null ? 0 : n); i++) rows.add("");
            } else {
                String select = cols.stream().map(c -> "quote(" + ident(c) + ")").collect(Collectors.joining(", "));
                jdbc.query("SELECT " + select + " FROM " + ident(table), rs -> {
                    StringBuilder sb = new StringBuilder();
                    for (int i = 0; i < cols.size(); i++) {
                        if (i > 0) sb.append('\u001F');
                        sb.append(cols.get(i)).append('=').append(rs.getString(i + 1));
                    }
                    rows.add(sb.toString());
                });
            }
            rows.sort(null);
            String header = "cols=" + String.join(",", cols);
            out.put(table, rows.size() + ":" + sha256(header + "\n" + String.join("\n", rows)));
        }
        List<String> defs = jdbc.query(
                "SELECT type || '|' || name || '|' || tbl_name || '|' || sql FROM sqlite_master WHERE sql IS NOT NULL",
                (rs, i) -> rs.getString(1));
        defs.sort(null);
        out.put(SCHEMA_KEY, defs.size() + ":" + sha256(String.join("\n", defs)));
        return out;
    }

    private static List<String> tables(JdbcTemplate jdbc) {
        return jdbc.queryForList(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
                String.class);
    }

    /** PRAGMA table_info(cid 순) 컬럼 중 시각 컬럼을 뺀 목록. */
    private static List<String> hashedColumns(JdbcTemplate jdbc, String table) {
        return jdbc.query("PRAGMA table_info(" + ident(table) + ")", (rs, i) -> rs.getString("name")).stream()
                .filter(c -> !TIME_COLUMNS.contains(c.toUpperCase()))
                .toList();
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
        lines.add("# 형식: 테이블=행수:SHA-256(정렬한 행, 시각 컬럼 제외). " + SCHEMA_KEY + " = sqlite_master.sql 정의 수:해시.");
        lines.add("# 해시에서 뺀 컬럼: " + new TreeSet<>(TIME_COLUMNS));
        lines.add("# 다시 쓰기: FINGERPRINT_UPDATE=true ../gradlew :api:test --tests '*DataInitializerSeedFingerprintTest'");
        fp.forEach((k, v) -> lines.add(k + "=" + v));
        Files.createDirectories(GOLDEN.getParent());
        Files.write(GOLDEN, lines, StandardCharsets.UTF_8);
    }

    private static Map<String, String> readGolden() throws Exception {
        Map<String, String> out = new LinkedHashMap<>();
        for (String line : Files.readAllLines(GOLDEN, StandardCharsets.UTF_8)) {
            String t = line.strip();
            if (t.isEmpty() || t.startsWith("#")) continue;
            int eq = t.lastIndexOf('=');
            out.put(t.substring(0, eq), t.substring(eq + 1));
        }
        return out;
    }

    /** BCrypt 솔트 랜덤성을 없앤 고정 인코더 — USER_ENC_PWD 를 결정적으로 만든다. */
    private static final class FixedPasswordEncoder extends PasswordEncoder {
        @Override
        public String encode(String rawPassword) {
            return FIXED_ENC_PWD;
        }
    }
}
