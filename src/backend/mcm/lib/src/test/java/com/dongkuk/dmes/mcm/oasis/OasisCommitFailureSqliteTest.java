package com.dongkuk.dmes.mcm.oasis;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.CactusServiceStarterFactory;
import com.dongkuk.dmes.cactus.oasis.CactusSpringTransactionHandler;
import com.dongkuk.dmes.cactus.oasis.CactusUnwrappingApplicationContext;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.oasis.provider.CactusCachingServiceProvider;
import com.dongkuk.dmes.cactus.oasis.provider.DefaultTxInjectingServiceProvider;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.SpringApplicationContext;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Properties;
import javax.sql.DataSource;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.dao.DataAccessException;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.jdbc.datasource.ConnectionHolder;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.orm.jpa.EntityManagerHolder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * OASIS 트랜잭션 커밋 실패가 응답·스레드 상태에 어떻게 드러나는지 — 실제 SQLite 파일 + Hibernate + JpaTransactionManager
 * + Spring Data 리포지토리 프록시로 {@link OasisServiceExecutor} 부터 {@link CactusResponse} 까지 끝에서 끝으로 본다
 * (refactor/framework-tx 3b, 2026-10-04).
 *
 * <p>두 가지 결함을 다룬다.
 * <ol>
 *   <li><b>커밋 실패 삼킴</b> — 작업이 리포지토리 안에서 난 예외를 잡고 계속하면 리포지토리 프록시가 이미 트랜잭션을
 *       rollback-only 로 표시해, 바깥 커밋이 {@link UnexpectedRollbackException} 으로 롤백된다. oasis
 *       {@code SpringTransactionHandler.commitAll()} 은 이 예외를 로그만 남기고 삼키므로 응답이 SUCCESS 인데 행은 없다.</li>
 *   <li><b>ThreadLocal 누수</b> — 커밋 시점 flush 에서 난 {@code DataAccessException} 은 Spring
 *       {@code TransactionException} 이 아니라서 commitAll 밖으로 새고, oasis {@code execute()} finally 의
 *       {@code ThreadLocalTransactionWarehouseHolder.end()} 를 건너뛴다. 두 트랜잭션이면 남은 트랜잭션이 커밋도 롤백도
 *       안 된 채 스레드에 묶인다.</li>
 *   <li><b>시작 실패 누수</b> — 두 번째 트랜잭션 매니저({@code txBroken}, 연결을 줄 수 없음) 시작이 실패하면 oasis
 *       {@code execute()} 의 {@code try} 밖이라 먼저 시작된 {@code txAux} 가 스레드에 묶인 채 {@code end()} 가 돌지 않는다
 *       (refactor/framework-txfix, 2026-10-04).</li>
 * </ol>
 * cactus 조립의 커밋 정책(framework-txfix 결정 2·3) — 역순 첫 커밋 실패 뒤 아직 커밋하지 않은 트랜잭션은 롤백하고,
 * 응답 {@code meta.message} 는 S001 일반 문구만 싣는다(별칭·SQL 은 ERROR 로그에만).
 * 각 결함마다 oasis 핸들러를 그대로 쓴 조립(현재 동작 고정 — oasis 소스는 고치지 않으므로 계속 통과)과
 * cactus 자동 설정 조립(올바른 기대)을 나란히 둔다.
 *
 * <p>cactus-core 시험 경로에는 JDBC 드라이버가 하나도 없어(h2 는 oasis-core 의 testImplementation, sqlite-jdbc 는
 * mcm/lib 의 api 에만 있다 — 빌드 파일 수정 금지) 드라이버·JPA 가 있는 mcm/lib 에 둔다. 핸들러 자체의 DB 없는 단위 시험은
 * cactus-core {@code CactusSpringTransactionHandlerTest} 다.
 * BPMN 은 {@code oasis-commit-failure/} 아래 5개 — 다른 서비스와 섞이지 않게 별도 경로를 쓴다.
 *
 * <p>SQLite 방언은 유일 제약 위반을 {@code DataIntegrityViolationException} 이 아니라 {@code JpaSystemException}
 * 으로 바꾼다 — 그래서 리포지토리 안 예외는 상위형 {@link DataAccessException} 으로만 단언한다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class OasisCommitFailureSqliteTest {

    private static final String SERVICE_PATH = "/oasis-commit-failure";
    private static final String HOLDER = "com.dongkuk.oasis.transaction.ThreadLocalTransactionWarehouseHolder";

    private static Path probeDb;
    private static Path auxDb;
    private static AnnotationConfigApplicationContext ctx;
    private static TxProbeTask task;

    @BeforeAll
    static void startContext() throws Exception {
        probeDb = Files.createTempFile("oasis-commit-probe", ".db");
        auxDb = Files.createTempFile("oasis-commit-aux", ".db");
        Files.delete(probeDb);
        Files.delete(auxDb);
        ctx = new AnnotationConfigApplicationContext(Config.class);
        task = ctx.getBean(TxProbeTask.class);
        execute(auxDb, "CREATE TABLE TB_TEST_TX_AUX (ID VARCHAR(20) PRIMARY KEY)");
    }

    @AfterAll
    static void stopContext() throws Exception {
        if (ctx != null) ctx.close();
        Files.deleteIfExists(probeDb);
        Files.deleteIfExists(auxDb);
    }

    @BeforeEach
    void clearRows() throws Exception {
        execute(probeDb, "DELETE FROM TB_TEST_TX_PROBE");
        execute(auxDb, "DELETE FROM TB_TEST_TX_AUX");
        task.reset();
    }

    /** 누수를 고정하는 시험이 남긴 스레드 상태가 다음 시험을 오염시키지 않게 치운다. */
    @AfterEach
    void releaseLeakedThreadState() throws Exception {
        for (Object key : new ArrayList<>(TransactionSynchronizationManager.getResourceMap().keySet())) {
            Object value = TransactionSynchronizationManager.unbindResource(key);
            try {
                if (value instanceof EntityManagerHolder emh) {
                    EntityManager em = emh.getEntityManager();
                    if (em.getTransaction().isActive()) em.getTransaction().rollback();
                    em.close();
                } else if (value instanceof ConnectionHolder ch) {
                    Connection c = ch.getConnection();
                    if (!c.isClosed()) {
                        c.rollback();
                        c.setAutoCommit(true);
                        c.close();
                    }
                }
            } catch (Exception ignored) {
                // 정리는 최선만 다한다.
            }
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
        holder("end");
    }

    // ── 1. 리포지토리 안 예외를 잡고 계속 → 바깥 커밋 UnexpectedRollbackException ─────────────

    @Test
    @DisplayName("[현재 동작 고정] oasis 핸들러 그대로면 커밋이 롤백돼도 응답은 SUCCESS 이고 행은 없다")
    void oasisHandler_swallowsUnexpectedRollback() throws Exception {
        CactusResponse res = executor(oasisHandlerStarter()).execute("txProbeSwallow", "save", request());

        assertThat(task.swallowed()).as("리포지토리 안에서 예외가 났다").isInstanceOf(DataAccessException.class);
        assertThat(res.getMeta().success()).isTrue();
        assertThat(count(probeDb, "TB_TEST_TX_PROBE")).isZero();
    }

    @Test
    @DisplayName("cactus 조립은 롤백된 커밋을 S001 실패 응답으로 돌려준다")
    void cactusStarter_reportsUnexpectedRollback() throws Exception {
        CactusResponse res = executor(cactusStarter()).execute("txProbeSwallow", "save", request());

        assertThat(task.swallowed()).isInstanceOf(DataAccessException.class);
        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo("S001");
        // 결정 3: 화면으로 나가는 문구는 일반 문구뿐 — 트랜잭션 별칭·원인 메시지는 ERROR 로그에만 남긴다.
        assertThat(res.getMeta().message()).isEqualTo(CactusSpringTransactionHandler.CLIENT_MESSAGE)
                .doesNotContain("txProbe");
        assertThat(res.getErrors()).isNull();
        assertThat(count(probeDb, "TB_TEST_TX_PROBE")).isZero();
    }

    @Test
    @DisplayName("cactus 조립의 SYSTEM_ERROR 원인 사슬에 UnexpectedRollbackException 이 있다")
    void cactusStarter_resultCarriesUnexpectedRollbackCause() {
        ServiceResult result = cactusStarter().start("txProbeSwallow", serviceContext());

        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
        assertThat(result.exception()).hasRootCauseInstanceOf(UnexpectedRollbackException.class);
    }

    // ── 2. 커밋 시점 flush 의 DataAccessException → end() 건너뜀(두 트랜잭션) ─────────────────

    @Test
    @DisplayName("[현재 동작 고정] oasis 핸들러 그대로면 flush 실패가 end() 를 건너뛰고 남은 트랜잭션이 스레드에 묶인다")
    void oasisHandler_leaksThreadStateOnCommitFlushFailure() throws Exception {
        CactusResponse res = executor(oasisHandlerStarter()).execute("txProbeCommitFlush", "save", request());

        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo("S001");
        // end() 가 불리지 않아 oasis 스레드 상태가 남는다.
        assertThat(holder("getWarehouse")).isNotNull();
        assertThat(holder("canStart")).isEqualTo(true);
        // 먼저 커밋한 txProbe 가 실패하자 루프가 끊겨 txAux 는 커밋도 롤백도 안 된 채 연결이 스레드에 묶여 있다.
        assertThat(TransactionSynchronizationManager.getResourceMap()).isNotEmpty();
        assertThat(count(auxDb, "TB_TEST_TX_AUX")).isZero();
        assertThat(count(probeDb, "TB_TEST_TX_PROBE")).isZero();
    }

    @Test
    @DisplayName("cactus 조립은 역순 첫 커밋(txProbe)이 실패하면 나머지(txAux)를 롤백해 행이 0건이고 스레드 상태를 정리한다")
    void cactusStarter_rollsBackRemainingAfterFirstCommitFailure() throws Exception {
        CactusResponse res = executor(cactusStarter()).execute("txProbeCommitFlush", "save", request());

        // 결정 2: 역순 첫 커밋(txProbe) 실패 뒤 아직 커밋하지 않은 txAux 는 롤백 — 두 DB 모두 0건.
        assertThat(count(auxDb, "TB_TEST_TX_AUX")).isZero();
        assertThat(count(probeDb, "TB_TEST_TX_PROBE")).isZero();
        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo("S001");
        // 결정 3: 별칭·SQL·제약 이름은 응답에 나가지 않는다. errors[] 도 없다(원인 사슬의 DataAccessException 은 싣지 않는다).
        assertThat(res.getMeta().message()).isEqualTo(CactusSpringTransactionHandler.CLIENT_MESSAGE)
                .doesNotContain("txProbe").doesNotContain("txAux")
                .doesNotContain("UNIQUE").doesNotContain("TB_TEST_TX_PROBE");
        assertThat(res.getErrors()).isNull();
        assertThat(holder("getWarehouse")).isNull();
        assertThat(holder("canStart")).isEqualTo(false);
        assertThat(TransactionSynchronizationManager.getResourceMap()).isEmpty();
        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
    }

    // ── 2-1. 두 번째 트랜잭션 매니저 시작 실패 → 먼저 시작된 트랜잭션 누수 ─────────────────────

    @Test
    @DisplayName("[현재 동작 고정] oasis 핸들러 그대로면 두 번째 시작 실패 뒤 첫 트랜잭션(txAux) 연결이 스레드에 묶인다")
    void oasisHandler_leaksFirstTransactionOnStartFailure() throws Exception {
        CactusResponse res = executor(oasisHandlerStarter()).execute("txProbeStartFailure", "save", request());

        assertThat(res.getMeta().success()).isFalse();
        assertThat(holder("getWarehouse")).isNotNull();
        assertThat(holder("canStart")).isEqualTo(true);
        assertThat(TransactionSynchronizationManager.getResourceMap()).isNotEmpty();
        assertThat(activeConnections("auxDataSource")).isEqualTo(1);
    }

    @Test
    @DisplayName("cactus 조립은 두 번째 시작 실패 때 첫 트랜잭션을 롤백·정리하고, 같은 스레드의 다음 요청은 새 트랜잭션으로 저장한다")
    void cactusStarter_rollsBackStartedTransactionOnStartFailure() throws Exception {
        CactusResponse res = executor(cactusStarter()).execute("txProbeStartFailure", "save", request());

        assertThat(res.getMeta().success()).isFalse();
        assertThat(res.getMeta().code()).isEqualTo("S001");
        // (1) 첫 트랜잭션 롤백·정리 — 연결 반납, 동기화 해제, 보관소 비움.
        assertThat(activeConnections("auxDataSource")).isZero();
        assertThat(TransactionSynchronizationManager.getResourceMap()).isEmpty();
        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
        assertThat(holder("getWarehouse")).isNull();
        assertThat(holder("canStart")).isEqualTo(false);
        assertThat(count(auxDb, "TB_TEST_TX_AUX")).isZero();

        // (2) 같은 스레드의 다음 요청은 묵은 트랜잭션에 합류하지 않고 새로 시작해 커밋한다.
        CactusResponse next = executor(cactusStarter()).execute("txAuxOk", "save", request());
        assertThat(next.getMeta().success()).isTrue();
        assertThat(count(auxDb, "TB_TEST_TX_AUX")).isEqualTo(1);
        assertThat(activeConnections("auxDataSource")).isZero();
        assertThat(holder("getWarehouse")).isNull();
        assertThat(TransactionSynchronizationManager.getResourceMap()).isEmpty();
    }

    // ── 3. 대조군 ──────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("정상 저장은 두 조립 모두 SUCCESS 이고 커밋된다")
    void ok_commitsWithBothStarters() throws Exception {
        assertThat(executor(cactusStarter()).execute("txProbeOk", "save", request()).getMeta().success()).isTrue();
        assertThat(count(probeDb, "TB_TEST_TX_PROBE")).isEqualTo(1);
        assertThat(holder("getWarehouse")).isNull();

        execute(probeDb, "DELETE FROM TB_TEST_TX_PROBE");
        assertThat(executor(oasisHandlerStarter()).execute("txProbeOk", "save", request()).getMeta().success()).isTrue();
        assertThat(count(probeDb, "TB_TEST_TX_PROBE")).isEqualTo(1);
        assertThat(TransactionSynchronizationManager.getResourceMap()).isEmpty();
    }

    // ── 도우미 ──────────────────────────────────────────────────────────────────

    /** 운영과 같은 조립 — {@link OasisAutoConfiguration#serviceStarter} 의 multi-tx 분기. */
    private static ServiceStarter cactusStarter() {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath(SERVICE_PATH);
        return new OasisAutoConfiguration().serviceStarter(props, txProps(), ctx);
    }

    /** 같은 그래프에 oasis {@link SpringTransactionHandler} 를 그대로 끼운 조립 — 3b 이전 운영 동작. */
    private static ServiceStarter oasisHandlerStarter() {
        CactusTxProperties tx = txProps();
        return new CactusServiceStarterFactory(
                ctx,
                new CactusCachingServiceProvider(
                        new DefaultTxInjectingServiceProvider(
                                new SimpleServiceProvider(SERVICE_PATH, "bpmn", "^^"), tx.getDefaultManager()),
                        100),
                new SpringTransactionHandler(new SpringApplicationContext(ctx),
                        tx.getManagers().keySet().toArray(new String[0])))
                .generateServiceStarter();
    }

    private static CactusTxProperties txProps() {
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txProbe", new CactusTxProperties.TxMgrConfig());
        tx.getManagers().put("txAux", new CactusTxProperties.TxMgrConfig());
        tx.getManagers().put("txBroken", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txProbe");
        return tx;
    }

    private static OasisServiceExecutor executor(ServiceStarter starter) {
        return new OasisServiceExecutor(starter, ctx, new CactusRequestConverter(), new CactusResponseConverter());
    }

    private static CactusRequest request() {
        return new CactusRequest(new RequestMeta("u1", "M1"), new HashMap<>(), null);
    }

    private static DefaultServiceContext serviceContext() {
        return new DefaultServiceContext(new CactusUnwrappingApplicationContext(ctx), new HashMap<>());
    }

    /** oasis 의 package-private 스레드 상태 보관소를 리플렉션으로 본다. */
    private static Object holder(String method) throws Exception {
        Method m = Class.forName(HOLDER).getDeclaredMethod(method);
        m.setAccessible(true);
        return m.invoke(null);
    }

    /** 커넥션 풀에서 빌려 가 아직 돌려주지 않은 연결 수. */
    private static int activeConnections(String dataSourceBean) {
        return ctx.getBean(dataSourceBean, HikariDataSource.class).getHikariPoolMXBean().getActiveConnections();
    }

    /** 스레드에 묶인 연결을 피하려고 DataSource 를 거치지 않고 파일에 직접 붙어 센다. */
    private static int count(Path db, String table) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + db);
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM " + table)) {
            rs.next();
            return rs.getInt(1);
        }
    }

    private static void execute(Path db, String sql) throws Exception {
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + db);
             Statement s = c.createStatement()) {
            s.execute(sql);
        }
    }

    @Configuration
    @EnableJpaRepositories(
            basePackageClasses = TxProbeRowRepository.class,
            includeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = TxProbeRowRepository.class),
            transactionManagerRef = "txProbe")
    static class Config {

        @Bean
        DataSource probeDataSource() {
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl("jdbc:sqlite:" + probeDb);
            ds.setPoolName("oasis-commit-probe");
            return ds;
        }

        @Bean
        DataSource auxDataSource() {
            HikariDataSource ds = new HikariDataSource();
            ds.setJdbcUrl("jdbc:sqlite:" + auxDb);
            ds.setPoolName("oasis-commit-aux");
            return ds;
        }

        @Bean
        LocalContainerEntityManagerFactoryBean entityManagerFactory() {
            Properties props = new Properties();
            props.put("hibernate.dialect", "org.hibernate.community.dialect.SQLiteDialect");
            props.put("hibernate.hbm2ddl.auto", "create");

            LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
            em.setDataSource(probeDataSource());
            em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            em.setJpaProperties(props);
            em.setPersistenceUnitName("oasis-commit-probe");
            em.setManagedTypes(PersistenceManagedTypes.of(TxProbeRow.class.getName()));
            em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
            return em;
        }

        /** OASIS 기본 트랜잭션 매니저 — JPA. */
        @Bean
        PlatformTransactionManager txProbe(EntityManagerFactory emf) {
            return new JpaTransactionManager(emf);
        }

        /** 두 번째 트랜잭션 매니저 — 보조 SQLite 파일의 JDBC. */
        @Bean
        PlatformTransactionManager txAux() {
            return new DataSourceTransactionManager(auxDataSource());
        }

        /** 세 번째 트랜잭션 매니저 — 연결을 줄 수 없어 시작이 늘 실패한다(두 번째 시작 실패 재현용). */
        @Bean
        PlatformTransactionManager txBroken() {
            return new DataSourceTransactionManager(new AbstractDataSource() {
                @Override
                public Connection getConnection() throws SQLException {
                    throw new SQLException("연결 실패(시험)");
                }

                @Override
                public Connection getConnection(String username, String password) throws SQLException {
                    throw new SQLException("연결 실패(시험)");
                }
            });
        }

        @Bean
        TxProbeTask txProbeTask(TxProbeRowRepository repository) {
            return new TxProbeTask(repository, new JdbcTemplate(auxDataSource()));
        }
    }
}
