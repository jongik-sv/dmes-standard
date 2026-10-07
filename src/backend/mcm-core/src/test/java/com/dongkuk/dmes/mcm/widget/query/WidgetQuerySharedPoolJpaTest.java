package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManagerFactory;
import java.time.Clock;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.persistenceunit.PersistenceManagedTypes;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 쿼리 위젯 실행기와 앱 기본 풀(oracle-1007 ③c) — OASIS 는 서비스 호출 전체를 txBiz(REQUIRED·READ_COMMITTED)로 감싸고, 그 트랜잭션은
 * 시작할 때 앱 기본 풀의 연결 하나를 쥔다. 실행기({@link WidgetReadOnlyJdbc})는 실행마다 자기 DataSource 에서 연결을 따로 빌리므로,
 * 전용 DataSource 가 없으면(공유 모드) 바깥 연결을 쥔 채 같은 풀에서 하나를 더 받는다. 동시 실행이 풀 크기에 닿으면 바깥 연결을 모두
 * 쥔 요청들이 서로의 연결을 기다려 connectionTimeout 까지 멈춘다. 그래서 로컬도 전용 풀({@code dmes.widget.query.datasource.*},
 * application-local.yml)을 둔다 — 이 시험은 앱 로컬과 같은 기본 풀(최대 3·유휴 0)과 전용 풀(최대 2·유휴 0) 구성을 확인한다.
 */
class WidgetQuerySharedPoolJpaTest {

    private static final int APP_POOL_SIZE = 3;
    private static final long CONNECTION_TIMEOUT_MS = 4000;
    private static final int CONCURRENT = APP_POOL_SIZE + 1;
    private static final String SQL = "SELECT 1 AS N FROM DUAL";

    private HikariDataSource appPool;
    private LocalContainerEntityManagerFactoryBean emfBean;
    private JpaTransactionManager txManager;
    private WidgetQueryDataSource queryDataSource;

    @BeforeEach
    void setUp() {
        appPool = McmCoreOraTestDb.appDataSource("widget-query-shared-app");
        appPool.setMaximumPoolSize(APP_POOL_SIZE);
        appPool.setMinimumIdle(0);
        appPool.setConnectionTimeout(CONNECTION_TIMEOUT_MS);
        appPool.setIdleTimeout(10_000);
        emfBean = McmCoreOraTestDb.entityManagerFactory(appPool);
        emfBean.setManagedTypes(PersistenceManagedTypes.of(List.of(WidgetDef.class.getName()), List.of()));
        emfBean.afterPropertiesSet();
        EntityManagerFactory emf = emfBean.getObject();
        txManager = new JpaTransactionManager(emf);
    }

    @AfterEach
    void tearDown() throws Exception {
        try {
            if (queryDataSource != null) queryDataSource.destroy(); // 전용 직결 풀이면 닫는다(공유면 아무것도 하지 않는다)
        } finally {
            try {
                emfBean.destroy();
            } finally {
                appPool.close();
            }
        }
    }

    @Test
    @DisplayName("전용 풀(최대 2·유휴 0) — 바깥 트랜잭션을 쥔 동시 실행이 앱 풀 크기보다 많아도 모두 connectionTimeout 전에 끝난다")
    void dedicatedPoolDoesNotExhaustAppPool() throws Exception {
        WidgetQueryProperties properties = new WidgetQueryProperties();
        WidgetQueryProperties.Datasource d = properties.getDatasource();
        d.setUrl(McmCoreOraTestDb.url());
        d.setUsername(McmCoreOraTestDb.APP_USER);
        d.setPassword(McmCoreOraTestDb.password());
        d.setDriverClassName("oracle.jdbc.OracleDriver");
        d.setMaximumPoolSize(2);
        d.setIdleTimeout(10_000);
        queryDataSource = WidgetQueryConfig.create(properties, () -> appPool);
        assertThat(queryDataSource.dedicated()).isTrue();
        HikariDataSource dedicatedPool = (HikariDataSource) queryDataSource.dataSource();
        assertThat(dedicatedPool.getMinimumIdle()).isZero();
        assertThat(dedicatedPool.getIdleTimeout()).isEqualTo(10_000);
        dedicatedPool.setConnectionTimeout(CONNECTION_TIMEOUT_MS);

        Run run = runConcurrently(executor(queryDataSource));

        assertNoTimeout(run);
    }

    @Test
    @Disabled("수정 전 근거(oracle-1007 ③c) — 공유 모드는 바깥 연결 + 실행 연결을 같은 풀에서 받아, 동시 실행이 풀 크기에 닿으면"
            + " connectionTimeout 까지 멈춘다. 로컬은 전용 풀을 두는 것으로 정했다(application-local.yml). 2026-10-07 한 번 켜서 실패 확인")
    @DisplayName("공유 모드 — 바깥 트랜잭션을 쥔 동시 실행이 앱 풀 크기에 닿으면 같은 풀의 실행 연결을 서로 기다린다")
    void sharedModeExhaustsAppPool() throws Exception {
        queryDataSource = WidgetQueryDataSource.shared(appPool);

        Run run = runConcurrently(executor(queryDataSource));

        assertNoTimeout(run);
    }

    // ── 동시 실행 ─────────────────────────────────────────────────

    /** 요청별 실패와 실행 소요 시간(ms). */
    private record Run(List<String> failures, Map<Integer, Long> executeMs) {}

    private static void assertNoTimeout(Run run) {
        assertThat(run.failures).as("요청별 실패").isEmpty();
        assertThat(run.executeMs).as("실행을 마친 요청").hasSize(CONCURRENT);
        run.executeMs.forEach((i, ms) -> assertThat(ms).as("요청 " + i + " 실행 소요(ms)").isLessThan(CONNECTION_TIMEOUT_MS));
    }

    private static WidgetQueryExecutor executor(WidgetQueryDataSource queryDataSource) {
        return new WidgetQueryExecutor(mock(WidgetDefRepository.class), mock(WidgetUserContextResolver.class), queryDataSource,
                Clock.systemUTC());
    }

    /**
     * {@value #CONCURRENT} 개 스레드가 OASIS 처럼 바깥 트랜잭션(REQUIRED·READ_COMMITTED — 시작할 때 앱 풀 연결을 쥔다)을 열고 위젯 SQL 을
     * 실행한다. 바깥 안에 앱 풀 크기만큼 모인 뒤 함께 실행한다(나머지는 바깥 연결을 얻는 대로 들어와 바로 지나간다).
     */
    private Run runConcurrently(WidgetQueryExecutor executor) throws Exception {
        CyclicBarrier start = new CyclicBarrier(CONCURRENT);
        CountDownLatch together = new CountDownLatch(APP_POOL_SIZE);
        Map<Integer, Long> executeMs = new ConcurrentHashMap<>();
        TransactionTemplate outer = new TransactionTemplate(txManager);
        outer.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        outer.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        ExecutorService pool = Executors.newFixedThreadPool(CONCURRENT);
        try {
            Map<Integer, Future<WidgetQueryResult>> futures = new LinkedHashMap<>();
            for (int i = 1; i <= CONCURRENT; i++) {
                int no = i;
                futures.put(no, pool.submit(() -> {
                    start.await(10, TimeUnit.SECONDS);
                    return outer.execute(status -> {
                        together.countDown();
                        try {
                            if (!together.await(10, TimeUnit.SECONDS)) {
                                throw new IllegalStateException("바깥 트랜잭션 안에 " + APP_POOL_SIZE + "개가 모이지 않았다");
                            }
                        } catch (InterruptedException e) {
                            Thread.currentThread().interrupt();
                            throw new IllegalStateException(e);
                        }
                        long t0 = System.nanoTime();
                        WidgetQueryResult r = executor.execute(SQL, Map.of(), 10);
                        executeMs.put(no, TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - t0));
                        return r;
                    });
                }));
            }
            List<String> failures = new ArrayList<>();
            for (Map.Entry<Integer, Future<WidgetQueryResult>> f : futures.entrySet()) {
                try {
                    f.getValue().get(60, TimeUnit.SECONDS);
                } catch (Exception e) {
                    Throwable root = e;
                    while (root.getCause() != null) root = root.getCause();
                    failures.add("요청 " + f.getKey() + ": " + e + " ← " + root);
                }
            }
            return new Run(failures, executeMs);
        } finally {
            pool.shutdownNow();
        }
    }
}
