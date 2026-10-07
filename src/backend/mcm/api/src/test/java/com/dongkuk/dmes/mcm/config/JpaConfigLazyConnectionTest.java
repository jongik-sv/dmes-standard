package com.dongkuk.dmes.mcm.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.ConnectionProxy;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.jpa.EntityManagerFactoryUtils;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link JpaConfig#dataSource} 의 연결 지연 획득({@code dmes.datasource.lazy-connection=true}, {@link LazyPrimaryDataSource}) —
 * 실제 Oracle 시험 PDB 에서 OASIS txBiz 와 같은 트랜잭션(JpaTransactionManager·REQUIRED·READ_COMMITTED)을 열어 본다
 * (docs/oracle-1007/design-mcm-lazy-ds.md).
 * <ul>
 *   <li>트랜잭션이 시작돼도 풀에서 연결을 받지 않고, 첫 SQL 때 받는다. 끝나면 돌려준다.</li>
 *   <li>받은 물리 연결에 트랜잭션 설정(autoCommit 끔·READ_COMMITTED)이 적용돼 롤백·커밋이 그대로 동작한다. 기본과 다른 격리
 *       수준(SERIALIZABLE)도 실제 연결에 들어가 동작하고, 끝나면 되돌아간다.</li>
 *   <li>MyBatis·JdbcTemplate 처럼 {@link DataSourceUtils} 로 연결을 얻는 쪽도 같은 트랜잭션 연결을 쓴다.</li>
 * </ul>
 */
class JpaConfigLazyConnectionTest {

    private static final String TBL = "T_LZ_DS_CHECK";

    private DataSource dataSource;
    private HikariDataSource hikari;
    private LocalContainerEntityManagerFactoryBean emfBean;
    private JpaTransactionManager txManager;
    private HikariDataSource adminPool;
    private JdbcTemplate admin;

    @BeforeEach
    void setUp() throws Exception {
        adminPool = McmOraTestDb.appDataSource("lazy-ds-admin");
        admin = new JdbcTemplate(adminPool);
        dropTable();
        // 세그먼트를 바로 만든다 — 지연 생성이면 SERIALIZABLE 트랜잭션 도중 다른 연결의 첫 INSERT 가 세그먼트를 만들어 ORA-08176 이 난다.
        admin.execute("CREATE TABLE " + TBL + " (ID NUMBER(10) PRIMARY KEY) SEGMENT CREATION IMMEDIATE");

        MockEnvironment env = new MockEnvironment()
                .withProperty("spring.datasource.url", McmOraTestDb.url())
                .withProperty("spring.datasource.username", McmOraTestDb.APP_USER)
                .withProperty("spring.datasource.password", McmOraTestDb.password())
                .withProperty("spring.datasource.driver-class-name", "oracle.jdbc.OracleDriver")
                .withProperty("spring.datasource.hikari.maximum-pool-size", "3")
                .withProperty("spring.datasource.hikari.minimum-idle", "0")
                .withProperty("spring.datasource.hikari.idle-timeout", "10000")
                .withProperty(JpaConfig.LAZY_CONNECTION_KEY, "true");
        dataSource = new JpaConfig().dataSource(env);
        assertThat(dataSource).isInstanceOf(LazyPrimaryDataSource.class);
        hikari = dataSource.unwrap(HikariDataSource.class);
        emfBean = McmOraTestDb.entityManagerFactory(dataSource, "default", SecUser.class.getName());
        emfBean.afterPropertiesSet();
        EntityManagerFactory emf = emfBean.getObject();
        txManager = new JpaTransactionManager(emf);
    }

    @AfterEach
    void tearDown() throws Exception {
        try {
            emfBean.destroy();
            ((AutoCloseable) dataSource).close();
            assertThat(hikari.isClosed()).as("감싸개를 닫으면 직접 만든 풀도 닫힌다").isTrue();
        } finally {
            try {
                dropTable();
            } finally {
                adminPool.close();
            }
        }
    }

    private void dropTable() {
        admin.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + TBL + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }

    /** oasis SpringTransactionHandler.startTransaction 과 같은 정의. */
    private TransactionTemplate oasis() {
        TransactionTemplate t = new TransactionTemplate(txManager);
        t.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        t.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        return t;
    }

    private int active() {
        return hikari.getHikariPoolMXBean().getActiveConnections();
    }

    @Test
    void 트랜잭션은_첫_SQL_때_연결을_받고_설정을_적용해_롤백한다() {
        List<Object> seen = new ArrayList<>();
        oasis().executeWithoutResult(status -> {
            seen.add(active()); // 시작 직후
            EntityManager em = EntityManagerFactoryUtils.getTransactionalEntityManager(emfBean.getObject());
            em.createNativeQuery("INSERT INTO " + TBL + " (ID) VALUES (1)").executeUpdate();
            seen.add(active()); // 첫 SQL 뒤
            Connection con = DataSourceUtils.getConnection(dataSource); // MyBatis·JdbcTemplate 이 얻는 연결
            try {
                Connection target = ((ConnectionProxy) con).getTargetConnection();
                seen.add(target.getAutoCommit());
                seen.add(target.getTransactionIsolation());
                seen.add(new JdbcTemplate(dataSource).queryForObject("SELECT COUNT(*) FROM " + TBL, Integer.class)); // 같은 트랜잭션에서 보인다
            } catch (java.sql.SQLException e) {
                throw new IllegalStateException(e);
            } finally {
                DataSourceUtils.releaseConnection(con, dataSource);
            }
            seen.add(active());
            status.setRollbackOnly();
        });

        assertThat(seen).containsExactly(0, 1, false, Connection.TRANSACTION_READ_COMMITTED, 1, 1);
        assertThat(active()).as("끝나면 돌려준다").isZero();
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL, Integer.class)).as("롤백됐다").isZero();
    }

    /**
     * Oracle 기본 격리가 READ_COMMITTED 라 위 시험의 격리 단언은 기록값이 적용되지 않아도 통과한다. 그래서 기본과 다른 SERIALIZABLE 로
     * 프록시에 기록한 격리 수준이 첫 SQL 때 실제 연결에 들어가는지(값과 동작 — 트랜잭션 시작 뒤 다른 연결이 커밋한 행이 보이지 않는다),
     * 끝난 뒤 풀의 연결이 READ_COMMITTED 로 되돌아가는지 본다.
     */
    @Test
    void 기본과_다른_격리_수준도_첫_SQL_때_실제_연결에_적용되고_끝나면_되돌아간다() throws Exception {
        TransactionTemplate serializable = new TransactionTemplate(txManager);
        serializable.setIsolationLevel(TransactionDefinition.ISOLATION_SERIALIZABLE);
        List<Object> seen = new ArrayList<>();
        serializable.executeWithoutResult(status -> {
            seen.add(active()); // 시작 직후 — 아직 연결을 받지 않는다
            EntityManager em = EntityManagerFactoryUtils.getTransactionalEntityManager(emfBean.getObject());
            seen.add(((Number) em.createNativeQuery("SELECT COUNT(*) FROM " + TBL).getSingleResult()).intValue());
            Connection con = DataSourceUtils.getConnection(dataSource);
            try {
                seen.add(((ConnectionProxy) con).getTargetConnection().getTransactionIsolation());
            } catch (java.sql.SQLException e) {
                throw new IllegalStateException(e);
            } finally {
                DataSourceUtils.releaseConnection(con, dataSource);
            }
            admin.update("INSERT INTO " + TBL + " (ID) VALUES (3)"); // 다른 연결에서 커밋
            seen.add(((Number) em.createNativeQuery("SELECT COUNT(*) FROM " + TBL).getSingleResult()).intValue());
        });

        assertThat(seen).as("시작 직후 연결 수, 첫 조회, 실제 연결 격리 수준, 다른 연결 커밋 뒤 조회")
                .containsExactly(0, 0, Connection.TRANSACTION_SERIALIZABLE, 0);
        assertThat(active()).isZero();
        try (Connection c = hikari.getConnection()) {
            assertThat(c.getTransactionIsolation()).as("풀로 돌아간 연결은 READ_COMMITTED").isEqualTo(Connection.TRANSACTION_READ_COMMITTED);
        }
        Integer afterwards = oasis().execute(status -> ((Number) EntityManagerFactoryUtils.getTransactionalEntityManager(emfBean.getObject())
                .createNativeQuery("SELECT COUNT(*) FROM " + TBL).getSingleResult()).intValue());
        assertThat(afterwards).as("READ_COMMITTED 트랜잭션에서는 커밋된 행이 보인다").isEqualTo(1);
    }

    @Test
    void SQL_없이_끝난_트랜잭션은_연결을_받지_않고_커밋은_실제_연결에_적용된다() {
        oasis().executeWithoutResult(status -> assertThat(active()).isZero());
        assertThat(active()).isZero();

        oasis().executeWithoutResult(status -> EntityManagerFactoryUtils.getTransactionalEntityManager(emfBean.getObject())
                .createNativeQuery("INSERT INTO " + TBL + " (ID) VALUES (2)").executeUpdate());

        assertThat(active()).isZero();
        assertThat(admin.queryForObject("SELECT COUNT(*) FROM " + TBL, Integer.class)).as("커밋됐다").isEqualTo(1);
    }
}
