package com.dongkuk.oasis.transaction;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import utils.OracleTestDatabase;
import org.springframework.orm.jpa.EntityManagerFactoryUtils;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;

import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;

/**
 * @author Jeongjin Kim
 * @since 2021-05-25
 */
@SuppressWarnings("SqlResolve")
@Execution(ExecutionMode.SAME_THREAD)
@SuppressFBWarnings("URF_UNREAD_FIELD")
class SpringTransactionHandlerTest {
    DataSource database;
    DataSource dataSource1;
    DataSource dataSource2;
    DataSource dataSource3;
    SpringTransactionHandler transactionHandler;
    JdbcTemplate jdbcTemplate1;
    JdbcTemplate jdbcTemplate2;
    JdbcTemplate jdbcTemplate3;
    EntityManagerFactory entityManagerFactory1;
    EntityManagerFactory entityManagerFactory2;
    EntityManagerFactory entityManagerFactory3;

    @BeforeEach
    void setup() throws SQLException {
        database = database();
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        dataSource2 = new SingleConnectionDataSource(database.getConnection(), true);
        dataSource3 = new SingleConnectionDataSource(database.getConnection(), true);

        entityManagerFactory1 = entityManagerFactory(dataSource1);
        entityManagerFactory2 = entityManagerFactory(dataSource2);
        entityManagerFactory3 = entityManagerFactory(dataSource3);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, entityManagerFactory1)
                , new TransactionManagerInfoHolder("tm2", dataSource2, entityManagerFactory2)
                , new TransactionManagerInfoHolder("tm3", dataSource3, entityManagerFactory3)
        );

        jdbcTemplate1 = new JdbcTemplate(dataSource1);
        jdbcTemplate2 = new JdbcTemplate(dataSource2);
        jdbcTemplate3 = new JdbcTemplate(dataSource3);
    }

    private DataSource database() {
        return OracleTestDatabase.create("transaction/SpringTransactionHandlerTest/schema.sql");
    }

    public EntityManagerFactory entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean entityManagerFactoryBean = new LocalContainerEntityManagerFactoryBean();
        entityManagerFactoryBean.setDataSource(dataSource);
        entityManagerFactoryBean.setPersistenceUnitName("hello");
        entityManagerFactoryBean
                .setPersistenceXmlLocation("classpath:/transaction/MultipleDataAccessTechSupportTest/persistence.xml");
        entityManagerFactoryBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        entityManagerFactoryBean.afterPropertiesSet();
        return entityManagerFactoryBean.getObject();
    }

    private SpringTransactionHandler transactionHandler(TransactionManagerInfoHolder... transactionManagerInfoHolders) {
        Map<String, TypedObject> map = new HashMap<>();
        for (TransactionManagerInfoHolder transactionManagerInfoHolder : transactionManagerInfoHolders) {
            PlatformTransactionManager tm =
                    new JpaTransactionManager(transactionManagerInfoHolder.getEntityManagerFactory());
            map.put(transactionManagerInfoHolder.getTransactionManagerName(), new TypedObject(tm));
        }

        ApplicationContext applicationContext = new DefaultApplicationContext(map);
        return new SpringTransactionHandler(applicationContext);
    }

    private SpringTransactionHandler transactionHandlerWithTransactionManagerNames
            (String[] transactionManagerNames, TransactionManagerInfoHolder... transactionManagerInfoHolders) {
        Map<String, TypedObject> map = new HashMap<>();
        for (TransactionManagerInfoHolder transactionManagerInfoHolder : transactionManagerInfoHolders) {
            PlatformTransactionManager tm = new JpaTransactionManager(transactionManagerInfoHolder.getEntityManagerFactory());
            map.put(transactionManagerInfoHolder.getTransactionManagerName(), new TypedObject(tm));
        }

        ApplicationContext applicationContext = new DefaultApplicationContext(map);
        return new SpringTransactionHandler(applicationContext, transactionManagerNames);
    }

    @Test
    void basicTransactionExecution() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            Integer integer2 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
            transactionHandler.commitAndRestartTransaction("tm1");
            assertThat(integer2).isEqualTo(2);

        }, null, null);
    }

    @Test
    void afterRollbackNoRowSelected() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            transactionHandler.rollbackAndRestartTransaction("tm1");
            Integer integer2 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer2).isEqualTo(0);
        }, null, null);
    }

    @Test
    @Disabled("rollback 또는 commit 할 때 항상 트랜잭션을 다시 시작하도록 변경하여 예외가 발생하지 않음")
    void afterRollbackStayNotInTransaction() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            transactionHandler.rollbackAndRestartTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (2, 'hi', 'roo')");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (3, 'hi', 'roo')");
            Integer integer2 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer2).isEqualTo(2);
            assertThatExceptionOfType(TransactionException.class).isThrownBy(
                    () -> transactionHandler.rollbackAndRestartTransaction("tm1")
            );
        }, null, null);
    }

    @Test
    void multipleTransaction() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            transactionHandler.startTransaction("tm2");

            Integer integer3 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer3).isEqualTo(0);
            jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            Integer integer4 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer4).isEqualTo(1);
            transactionHandler.commitAndRestartTransaction("tm2");
            transactionHandler.commitAndRestartTransaction("tm1");
            transactionHandler.startTransaction("tm2");
            Integer integer5 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer5).isEqualTo(2);
        }, null, null);
    }

    @Test
    void linearTransactions() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            transactionHandler.commitAndRestartTransaction("tm1");

            transactionHandler.startTransaction("tm2");
            jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            Integer integer3 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            transactionHandler.commitAndRestartTransaction("tm2");
            assertThat(integer3).isEqualTo(2);
        }, null, null);
    }

    @Test
    void commitAll() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            transactionHandler.startTransaction("tm2");
            jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            Integer integer3 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            transactionHandler.commitAll();
            assertThat(integer3).isEqualTo(1);
            Integer integer4 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer4).isEqualTo(2);
        }, null, null);
    }

    @Test
    void rollbackAll() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            transactionHandler.startTransaction("tm2");
            jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            Integer integer3 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            transactionHandler.rollbackAll(null);
            assertThat(integer3).isEqualTo(1);
            Integer integer4 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer4).isEqualTo(0);
        }, null, null);
    }

    @Test
    void rollbackAllWithoutAlwaysCommit() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            transactionHandler.startTransaction("tm2");
            jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            Integer integer3 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            transactionHandler.rollbackAll(new String[]{"tm2"});
            assertThat(integer3).isEqualTo(1);
            Integer integer4 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer4).isEqualTo(1);
            Integer integer5 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer5).isEqualTo(1);
        }, null, null);
    }

    @Test
    void rollbackCommitMix() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            jdbcTemplate1.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
            transactionHandler.startTransaction("tm2");
            jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
            Integer integer3 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer3).isEqualTo(1);
//        transactionHandler.rollback("tm2");
            transactionHandler.rollbackAndRestartTransaction("tm1");
            transactionHandler.startTransaction("tm1");
//        transactionHandler.commit("tm1");
//        transactionHandler.commit("tm2");
            //TransactionSynchronizationManager
            transactionHandler.commitAll();
        }, null, null);

    }

    @Test
    void givenTransactionNamesStartAllTransactionsAtStart() {
        SpringTransactionHandler transactionHandler = transactionHandlerWithTransactionManagerNames(
                new String[]{"tm1", "tm2", "tm3"}
                , new TransactionManagerInfoHolder("tm1", dataSource1, entityManagerFactory1)
                , new TransactionManagerInfoHolder("tm2", dataSource2, entityManagerFactory2)
                , new TransactionManagerInfoHolder("tm3", dataSource3, entityManagerFactory3)
        );

        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouseBefore
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        assertThat(txWarehouseBefore).isNull();

        transactionHandler.execute(() -> {
            TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouseIn
                    = ThreadLocalTransactionWarehouseHolder.getWarehouse();

            TransactionStatus statusInTm1 = txWarehouseIn.transactionStatus("tm1");
            TransactionStatus statusInTm2 = txWarehouseIn.transactionStatus("tm2");
            TransactionStatus statusInTm3 = txWarehouseIn.transactionStatus("tm3");

            assertThat(statusInTm1.isCompleted()).isFalse();
            assertThat(statusInTm2.isCompleted()).isFalse();
            assertThat(statusInTm3.isCompleted()).isFalse();

            EntityManagerFactoryUtils
                    .getTransactionalEntityManager(entityManagerFactory2);
        }, null, null);

        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouseAfter
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        assertThat(txWarehouseAfter).isNull();
    }

    @Test
    void givenTransactionNamesStartSpecificTransactionsAtStart() {
        SpringTransactionHandler transactionHandler = transactionHandlerWithTransactionManagerNames(
                new String[]{"tm1", "tm2", "tm3"}
                , new TransactionManagerInfoHolder("tm1", dataSource1, entityManagerFactory1)
                , new TransactionManagerInfoHolder("tm2", dataSource2, entityManagerFactory2)
                , new TransactionManagerInfoHolder("tm3", dataSource3, entityManagerFactory3)
        );

        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouseBefore
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        assertThat(txWarehouseBefore).isNull();

        transactionHandler.execute(() -> {
            TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouseIn
                    = ThreadLocalTransactionWarehouseHolder.getWarehouse();

            TransactionStatus statusInTm1 = txWarehouseIn.transactionStatus("tm1");
            TransactionStatus statusInTm2 = txWarehouseIn.transactionStatus("tm2");
            TransactionStatus statusInTm3 = txWarehouseIn.transactionStatus("tm3");
            assertThat(statusInTm3).isNull();

            assertThat(statusInTm1.isCompleted()).isFalse();
            assertThat(statusInTm2.isCompleted()).isFalse();
        }, new String[]{"tm1", "tm2"}, null);

        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouseAfter
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        assertThat(txWarehouseAfter).isNull();
    }

    @Test
    void whenTransactionStartRequestIsMadeThatIsNotInTheApplicationTransactionThenExceptionIsRaised() {
        SpringTransactionHandler transactionHandler = transactionHandlerWithTransactionManagerNames(
                new String[]{"tm1", "tm2", "tm3"}
                , new TransactionManagerInfoHolder("tm1", dataSource1, entityManagerFactory1)
                , new TransactionManagerInfoHolder("tm2", dataSource2, entityManagerFactory2)
                , new TransactionManagerInfoHolder("tm3", dataSource3, entityManagerFactory3)
        );

        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouseBefore
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        assertThat(txWarehouseBefore).isNull();

        assertThatExceptionOfType(IllegalArgumentException.class)
                .isThrownBy(() -> transactionHandler.execute(() -> {
                }, new String[]{"tm5", "tm2"}, null));
    }

    @AfterEach
    void cleanup() {
        OracleTestDatabase.dropTables(database, "Employee");
    }
}