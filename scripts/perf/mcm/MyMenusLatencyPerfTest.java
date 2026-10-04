package com.dongkuk.dmes.mcm.perf;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.withSettings;

import com.dongkuk.dmes.cactus.security.auth.PasswordEncoder;
import com.dongkuk.dmes.mcm.audit.AuditLogger;
import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import com.dongkuk.dmes.mcm.common.audit.SecurityIdentityHolder;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.init.DataInitializer;
import com.dongkuk.dmes.mcm.security.PasswordHasher;
import com.dongkuk.dmes.mcm.security.UserAccountRepository;
import com.dongkuk.dmes.mcm.security.dto.MyMenusRequest;
import com.dongkuk.dmes.mcm.security.password.PasswordPolicyEvaluator;
import com.dongkuk.dmes.mcm.security.service.SecUserService;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import javax.sql.DataSource;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * P3 보조 지표 — {@code SecUserService.getMyMenus} 응답 시간 측정 하네스(측정 전용 파일 — 저장소 시험 소스에 두지 않고 스크립트가 실행 때만 복사했다 지운다).
 *
 * <p>scripts/perf/mcm/perf-mcm-p3.sh 가 기준(refactor-2026-10-base)·변경 워크트리의 mcm/api src/test 에 복사해
 * {@code :api:test --tests ... --rerun} 으로 돌리고, 끝나면 지운다. 생성자 시그니처(기준 13인자·변경 12인자)에 기대지 않도록
 * 스프링 컨텍스트에 필요한 빈만 스캔해 {@link SecUserService} 를 타입으로 꺼낸다. 메뉴 카탈로그({@code mcm.menu.MenuCatalog})는
 * 기준에 없으므로 이름으로 찾고, 있으면 캐시 적중(hit)·매 호출 전 무효화(miss) 두 조건을, 없으면 nocache 한 조건을 잰다.
 *
 * <p>데이터: 빈 SQLite 임시 파일에 local 프로필 DataInitializer 시드(실제 트랜잭션 프록시로 run). 사용자 admin(SYSADMIN 매핑).
 * 호출마다 TransactionTemplate 하나로 감싼다(운영의 OASIS 프로세스 단위 트랜잭션과 같게).
 *
 * <p>입력: 작업 디렉터리(mcm/api) 기준 {@code build/perf-mcm-p3/config.properties}(warmup·iters, 없으면 기본값).
 * 출력: {@code build/perf-mcm-p3/result.tsv} — 조건마다 한 줄.
 */
class MyMenusLatencyPerfTest {

    static {
        // Boot 로깅이 없으면 logback 기본 설정이 DEBUG 라 Hibernate·Spring 로그가 시간을 먹는다 — 양쪽 똑같이 WARN.
        ch.qos.logback.classic.Logger root =
                (ch.qos.logback.classic.Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
        root.setLevel(ch.qos.logback.classic.Level.WARN);
    }

    private static final Path OUT_DIR = Path.of("build/perf-mcm-p3");
    private static final String USER_ID = "admin";
    private static final String CATALOG_CLASS = "com.dongkuk.dmes.mcm.menu.MenuCatalog";

    private static Path dbFile;
    private static AnnotationConfigApplicationContext ctx;
    private static boolean prevInspectorSqlite;

    @BeforeAll
    static void start() throws Exception {
        prevInspectorSqlite = McmAuditStatementInspector.isSqlite();
        SecurityIdentityHolder.set(null);
        SecurityContextHolder.clearContext();
        dbFile = Files.createTempFile("mcm-perf-p3", ".db");
        Files.delete(dbFile);

        ctx = new AnnotationConfigApplicationContext();
        ctx.getEnvironment().setActiveProfiles("local");
        ctx.register(Config.class);
        ctx.refresh();
    }

    @AfterAll
    static void stop() throws Exception {
        McmAuditStatementInspector.setSqlite(prevInspectorSqlite);
        if (ctx != null) ctx.close();
        if (dbFile != null) Files.deleteIfExists(dbFile);
    }

    @Test
    void measureGetMyMenus() throws Exception {
        Properties cfg = new Properties();
        Path cfgFile = OUT_DIR.resolve("config.properties");
        if (Files.exists(cfgFile)) {
            try (InputStream in = Files.newInputStream(cfgFile)) {
                cfg.load(in);
            }
        }
        int warmup = Integer.parseInt(cfg.getProperty("warmup", "300"));
        int iters = Integer.parseInt(cfg.getProperty("iters", "500"));

        // 1) 시드 — 트랜잭션 프록시를 거쳐 run(@Transactional). 변경 쪽은 끝에 MenuChangedEvent(SEED) 로 카탈로그를 비운다.
        long seedStart = System.nanoTime();
        ctx.getBean(DataInitializer.class).run(null);
        double seedMs = (System.nanoTime() - seedStart) / 1e6;

        JdbcTemplate jdbc = new JdbcTemplate(ctx.getBean(DataSource.class));
        long menuCnt = count(jdbc, "SELECT COUNT(*) FROM TB_MCM_SEC_MENU");
        long objCnt = count(jdbc, "SELECT COUNT(*) FROM TB_MCM_SEC_OBJ");
        long fldCnt = count(jdbc, "SELECT COUNT(*) FROM TB_MCM_SEC_MENU_FLD");
        long roleMapCnt = count(jdbc,
                "SELECT COUNT(*) FROM TB_MCM_SEC_ROLE_MAPPING WHERE ROLE_ID IN ("
                        + "SELECT gm.ROLE_ID FROM TB_MCM_SEC_ROLEGROUP_MAPPING gm JOIN TB_MCM_SEC_USER_MAPPING um"
                        + " ON um.ROLE_GROUP_ID = gm.ROLE_GROUP_ID WHERE um.USER_ID = '" + USER_ID + "')");

        SecUserService svc = ctx.getBean(SecUserService.class);
        TransactionTemplate tx = new TransactionTemplate(ctx.getBean(PlatformTransactionManager.class));
        MyMenusRequest req = new MyMenusRequest();

        Object catalog = null;
        Method invalidate = null;
        try {
            Class<?> catalogType = Class.forName(CATALOG_CLASS);
            catalog = ctx.getBean(catalogType);
            invalidate = catalogType.getMethod("invalidate");
        } catch (ClassNotFoundException e) {
            // 기준 — 카탈로그 없음(호출마다 전수 SELECT).
        }

        int rows = call(tx, svc, req).size();

        List<String> conditions = catalog == null ? List.of("nocache") : List.of("hit", "miss");
        // 워밍업 — 모든 조건을 먼저 데운 뒤 잰다.
        for (String c : conditions) {
            for (int i = 0; i < warmup; i++) {
                if ("miss".equals(c)) invalidate.invoke(catalog);
                call(tx, svc, req);
            }
        }

        List<String> lines = new ArrayList<>();
        for (String c : conditions) {
            if ("hit".equals(c)) call(tx, svc, req); // 적재해 두고 시작
            long[] ns = new long[iters];
            for (int i = 0; i < iters; i++) {
                if ("miss".equals(c)) invalidate.invoke(catalog);
                long t0 = System.nanoTime();
                List<Map<String, Object>> r = call(tx, svc, req);
                ns[i] = System.nanoTime() - t0;
                if (r.size() != rows) throw new IllegalStateException("결과 행 수가 바뀜: " + r.size() + " != " + rows);
            }
            Arrays.sort(ns);
            double sum = 0;
            for (long v : ns) sum += v;
            lines.add(String.join("\t",
                    c,
                    String.valueOf(warmup),
                    String.valueOf(iters),
                    ms(pct(ns, 50)),
                    ms(pct(ns, 90)),
                    ms(sum / iters),
                    ms(ns[0]),
                    ms(ns[ns.length - 1]),
                    String.valueOf(rows),
                    String.valueOf(menuCnt),
                    String.valueOf(objCnt),
                    String.valueOf(fldCnt),
                    String.valueOf(roleMapCnt),
                    String.format(Locale.ROOT, "%.0f", seedMs)));
        }
        Files.createDirectories(OUT_DIR);
        Files.writeString(OUT_DIR.resolve("result.tsv"), String.join("\n", lines) + "\n", StandardCharsets.UTF_8);
    }

    private static List<Map<String, Object>> call(TransactionTemplate tx, SecUserService svc, MyMenusRequest req) {
        return tx.execute(s -> svc.getMyMenus(req));
    }

    private static long count(JdbcTemplate jdbc, String sql) {
        try {
            Long v = jdbc.queryForObject(sql, Long.class);
            return v == null ? -1 : v;
        } catch (RuntimeException e) {
            return -1; // 표·컬럼 이름이 다르면 -1(측정 자체는 계속)
        }
    }

    /** 최근접 순위(nearest-rank) 백분위. */
    private static double pct(long[] sorted, int p) {
        int rank = (int) Math.ceil(p / 100.0 * sorted.length);
        return sorted[Math.max(0, Math.min(sorted.length - 1, rank - 1))];
    }

    private static String ms(double nanos) {
        return String.format(Locale.ROOT, "%.3f", nanos / 1e6);
    }

    @Configuration
    @EnableTransactionManagement(proxyTargetClass = true)
    @EnableJpaRepositories(
            basePackages = "com.dongkuk.dmes.mcm.repository",
            includeFilters = @ComponentScan.Filter(type = FilterType.REGEX,
                    pattern = "com\\.dongkuk\\.dmes\\.mcm\\.repository\\."
                            + "(SecMenu|SecObj|SecPerm|SecRoleMapping|SecRoleGroupMapping|SecUserMapping|RuleMaster)Repository"))
    @ComponentScan(
            basePackages = {"com.dongkuk.dmes.mcm.security.service", "com.dongkuk.dmes.mcm.menu",
                    "com.dongkuk.dmes.mcm.repository", "com.dongkuk.dmes.mcm.init"},
            useDefaultFilters = false,
            includeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = {
                    "com\\.dongkuk\\.dmes\\.mcm\\.security\\.service\\.SecUserService",
                    "com\\.dongkuk\\.dmes\\.mcm\\.menu\\.MenuCatalog",
                    "com\\.dongkuk\\.dmes\\.mcm\\.repository\\.SecMenuFldLovRepository",
                    "com\\.dongkuk\\.dmes\\.mcm\\.repository\\.SecMenuNativeRepository",
                    "com\\.dongkuk\\.dmes\\.mcm\\.init\\.DataInitializer"}))
    static class Config {

        @Bean
        DataSource dataSource() {
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl("jdbc:sqlite:" + dbFile);
            ds.setPoolName("mcm-perf-p3");
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            // JpaConfig 의 SQLite 분기(application-local ddl-auto update)와 같은 구성 — DataInitializerSeedFingerprintTest 와 같다.
            Properties props = new Properties();
            props.put("hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect");
            props.put("hibernate.hbm2ddl.auto", "update");
            props.put("hibernate.show_sql", "false");
            props.put("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually");
            props.put("hibernate.session_factory.statement_inspector",
                    "com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector");
            McmAuditStatementInspector.setSqlite(true);
            props.put("hibernate.metadata_builder_contributor",
                    "com.dongkuk.dmes.mcm.common.persistence.SqliteTemporalConverterContributor");

            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(dataSource);
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            em.setJpaProperties(props);
            em.setPersistenceUnitName("default");
            em.setPackagesToScan(
                    "com.dongkuk.dmes.cactus.security.auth",
                    "com.dongkuk.dmes.cactus.mastercode",
                    "com.dongkuk.dmes.mcm");
            em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
            return em;
        }

        @Bean
        PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        @Bean
        PasswordEncoder passwordEncoder() {
            return new PasswordEncoder();
        }

        @Bean
        SecurityIdentity securityIdentity() {
            SecurityIdentity id = mock(SecurityIdentity.class, withSettings().stubOnly());
            when(id.currentUserId()).thenReturn(USER_ID);
            when(id.requireUserId()).thenReturn(USER_ID);
            return id;
        }

        @Bean
        UserAccountRepository userAccountRepository() {
            return mock(UserAccountRepository.class, withSettings().stubOnly());
        }

        @Bean
        PasswordHasher passwordHasher() {
            return mock(PasswordHasher.class, withSettings().stubOnly());
        }

        @Bean
        AuditLogger auditLogger() {
            return mock(AuditLogger.class, withSettings().stubOnly());
        }

        @Bean
        PasswordPolicyEvaluator passwordPolicyEvaluator() {
            return mock(PasswordPolicyEvaluator.class, withSettings().stubOnly());
        }
    }
}
