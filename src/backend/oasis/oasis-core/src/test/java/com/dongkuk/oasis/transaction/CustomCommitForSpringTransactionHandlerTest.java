package com.dongkuk.oasis.transaction;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import utils.OracleTestDatabase;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-25
 */
@SuppressWarnings("SqlResolve")
@Execution(ExecutionMode.SAME_THREAD)
@SuppressFBWarnings("URF_UNREAD_FIELD")
class CustomCommitForSpringTransactionHandlerTest {
    DataSource database;
    DataSource dataSource1;
    DataSource dataSource2;
    DataSource dataSource3;
    SpringTransactionHandler transactionHandler;
    JdbcTemplate jdbcTemplate1;
    JdbcTemplate jdbcTemplate2;
    JdbcTemplate jdbcTemplate3;

    @BeforeEach
    void setup() throws SQLException {
        database = database();
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        dataSource2 = new SingleConnectionDataSource(database.getConnection(), true);
        dataSource3 = new SingleConnectionDataSource(database.getConnection(), true);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, null)
                , new TransactionManagerInfoHolder("tm2", dataSource2, null)
                , new TransactionManagerInfoHolder("tm3", dataSource3, null)
        );

        jdbcTemplate1 = new JdbcTemplate(dataSource1);
        jdbcTemplate2 = new JdbcTemplate(dataSource2);
        jdbcTemplate3 = new JdbcTemplate(dataSource3);
    }

    private DataSource database() {
        return OracleTestDatabase.create("transaction/CustomCommitForSpringTransactionHandlerTest/schema.sql");
    }

    private SpringTransactionHandler transactionHandler(TransactionManagerInfoHolder... transactionManagerInfoHolders) {
        Map<String, TypedObject> map = new HashMap<>();
        for (TransactionManagerInfoHolder transactionManagerInfoHolder : transactionManagerInfoHolders) {
            PlatformTransactionManager tm =
                    new DataSourceTransactionManager(transactionManagerInfoHolder.getDataSource());
            map.put(transactionManagerInfoHolder.getTransactionManagerName(), new TypedObject(tm));
        }

        ApplicationContext applicationContext = new DefaultApplicationContext(map);
        return new SpringTransactionHandler(applicationContext);
    }

    @Test
    void commitAndRestart() {
        try {
            transactionHandler.execute(() -> {
                transactionHandler.startTransaction("tm1");
                transactionHandler.startTransaction("tm2");
                transactionHandler.startTransaction("tm3");
                jdbcTemplate1.update("insert into AccessLog(id) values (0)");
                transactionHandler.commitAndRestartTransaction("tm1");
                jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
                throw new RuntimeException("hell");
            }, null, null);
        } catch (Exception e) {
            e.printStackTrace();
        }
        Integer integer4 = jdbcTemplate2.queryForObject("select count(id) from Employee", Integer.class);
        Assertions.assertThat(integer4).isEqualTo(0);
        Integer integer = jdbcTemplate2.queryForObject("select count(id) from AccessLog", Integer.class);
        Assertions.assertThat(integer).isEqualTo(1);
    }

    @Test
    void commitAndRestart2() {
        try {
            transactionHandler.execute(() -> {
                transactionHandler.startTransaction("tm1");
                transactionHandler.startTransaction("tm2");
                transactionHandler.startTransaction("tm3");
                jdbcTemplate3.update("insert into AccessLog(id) values (0)");
                transactionHandler.commitAndRestartTransaction("tm3");
                jdbcTemplate2.update("insert into Employee(id, firstName, lastName ) values (1, 'hi', 'roo')");
                throw new RuntimeException("hell");
            }, null, null);
        } catch (Exception e) {
            e.printStackTrace();
        }
        Integer integer4 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
        Assertions.assertThat(integer4).isEqualTo(0);
        Integer integer = jdbcTemplate1.queryForObject("select count(id) from AccessLog", Integer.class);
        Assertions.assertThat(integer).isEqualTo(1);
    }

    @AfterEach
    void cleanup() {
        OracleTestDatabase.dropTables(database, "Employee", "AccessLog", "Message");
    }
}