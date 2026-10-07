package usecase.commitInProgress;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionManagerInfoHolder;
import com.dongkuk.oasis.utils.MapBuilder;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import utils.OracleTestDatabase;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;

/**
 * @author Jeongjin Kim
 * @since 2021-06-09
 */
@SuppressFBWarnings("URF_UNREAD_FIELD")
@Execution(ExecutionMode.SAME_THREAD)
public class TransactionScriptTaskTest {
    DataSource database;
    DataSource dataSource1;
    DataSource dataSource2;
    NamedParameterJdbcTemplate jdbcTemplate1;
    NamedParameterJdbcTemplate jdbcTemplate2;
    SpringTransactionHandler transactionHandler;
    DefaultApplicationContext applicationContext;

    @BeforeEach
    void setup() throws SQLException {
        applicationContext = new DefaultApplicationContext();
        database = database();
        // dataSource2
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        dataSource2 = new SingleConnectionDataSource(database.getConnection(), true);
        jdbcTemplate1 = new NamedParameterJdbcTemplate(dataSource1);
        jdbcTemplate2 = new NamedParameterJdbcTemplate(dataSource2);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, null),
                new TransactionManagerInfoHolder("tm2", dataSource2, null)
        );
    }

    private DataSource database() {
        return OracleTestDatabase.create("usecase/commitInProgress/initData.sql");
    }

    private SpringTransactionHandler transactionHandler(TransactionManagerInfoHolder... transactionManagerInfoHolders) {
        for (TransactionManagerInfoHolder transactionManagerInfoHolder : transactionManagerInfoHolders) {
            PlatformTransactionManager tm =
                    new DataSourceTransactionManager(transactionManagerInfoHolder.getDataSource());

            this.applicationContext.put(transactionManagerInfoHolder.getTransactionManagerName(), new TypedObject(tm));
        }

        return new SpringTransactionHandler(applicationContext, Arrays.stream(transactionManagerInfoHolders)
                .map(TransactionManagerInfoHolder::getTransactionManagerName).toArray(String[]::new));
    }

    @Test
    void customCommit() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/commitInProgress/commitAndRestart.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(jdbcTemplate1)));
        contextData.put("loggerRepository", new TypedObject(new UserSignInRepository(jdbcTemplate2)));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("id", new TypedObject("4"))
                .addEntity("firstName", new TypedObject("jeongjin"))
                .addEntity("lastName", new TypedObject("kim"))
                .addEntity("action", new TypedObject("commit"))
                .build());
        serviceStarter.start("commitAndRestart", serviceContext);

        List<Map<String, Object>> maps2 =
                jdbcTemplate1.queryForList("select id from users", new HashMap<>());
        Assertions.assertThat(maps2).hasSize(4);
    }

    @Test
    void throwExceptionAfterCommit() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/commitInProgress/commitAndRestart.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(jdbcTemplate1)));
        contextData.put("loggerRepository", new TypedObject(new UserSignInRepository(jdbcTemplate2)));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("id", new TypedObject("4"))
                .addEntity("firstName", new TypedObject("jeongjin"))
                .addEntity("lastName", new TypedObject("kim"))
                .addEntity("action", new TypedObject("commitAndException"))
                .build());
        try {
            serviceStarter.start("commitAndRestart", serviceContext);
        } catch (Exception e) {
            e.printStackTrace();
        }

        List<Map<String, Object>> maps2 =
                jdbcTemplate1.queryForList("select id from users", new HashMap<>());
        Assertions.assertThat(maps2).hasSize(4);
    }

    @Test
    void rollback() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/commitInProgress/commitAndRestart.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(jdbcTemplate1)));
        contextData.put("loggerRepository", new TypedObject(new UserSignInRepository(jdbcTemplate2)));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("id", new TypedObject("4"))
                .addEntity("firstName", new TypedObject("jeongjin"))
                .addEntity("lastName", new TypedObject("kim"))
                .addEntity("action", new TypedObject("rollback"))
                .build());
        try {
            serviceStarter.start("commitAndRestart", serviceContext);
        } catch (Exception e) {
            e.printStackTrace();
        }

        List<Map<String, Object>> maps2 =
                jdbcTemplate1.queryForList("select id from users", new HashMap<>());
        Assertions.assertThat(maps2).hasSize(4);
    }

    @SuppressWarnings("SqlResolve")
    @Test
    void firstDataSourceCommitButAfterInsertIntoSecondDataSourceAndThrowException() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/commitInProgress/commitAndRestart.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(jdbcTemplate1)));
        contextData.put("loggerRepository", new TypedObject(new LoggerRepository(jdbcTemplate2)));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("id", new TypedObject("4"))
                .addEntity("firstName", new TypedObject("jeongjin"))
                .addEntity("lastName", new TypedObject("kim"))
                .addEntity("action", new TypedObject("log"))
                .build());
        try {
            serviceStarter.start("commitAndRestart", serviceContext);
        } catch (Exception e) {
            e.printStackTrace();
        }

        List<Map<String, Object>> maps2 =
                jdbcTemplate1.queryForList("select id from users", new HashMap<>());
        Assertions.assertThat(maps2).hasSize(3);
        List<Map<String, Object>> maps3 =
                jdbcTemplate1.queryForList("select id from log", new HashMap<>());
        Assertions.assertThat(maps3).hasSize(1);
    }
}
