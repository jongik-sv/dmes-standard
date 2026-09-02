package usecase.parallel;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionManagerInfoHolder;
import com.dongkuk.oasis.utils.MapBuilder;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;

/**
 * 서비스를 수행한 뒤 결과를 처리하는 샘플.
 *
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
@SuppressWarnings("SqlResolve")
public class ParallelTransactionTest {
    EmbeddedDatabase database;
    DataSource dataSource1;
    SpringTransactionHandler transactionHandler;
    DefaultApplicationContext applicationContext;
    NamedParameterJdbcTemplate jdbcTemplate1;

    @BeforeEach
    void setup() {
        applicationContext = new DefaultApplicationContext();
        database = database();

        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setDataSource(database);
        dataSource1 = new HikariDataSource(hikariConfig);
//        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        jdbcTemplate1 = new NamedParameterJdbcTemplate(dataSource1);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, null)
        );
        applicationContext.put("memberRepository", new TypedObject(new MemberRepository(jdbcTemplate1)));
        applicationContext.put("ds1", new TypedObject(dataSource1));
        applicationContext.put("txm", new TypedObject(transactionHandler));
    }

    private EmbeddedDatabase database() {
        EmbeddedDatabase dataSource;
        dataSource = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .setScriptEncoding("UTF-8")
                .ignoreFailedDrops(true)
                .addScript("usecase/parallel/initData.sql")
                .build();
        return dataSource;
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
    void single() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>().addEntity("action", new TypedObject("single")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(4);
    }

    @Test
    void loop() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>().addEntity("action", new TypedObject("loop")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(8);
    }

    @Test
    void sequentialMultiInstance() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>().addEntity("action", new TypedObject("sequential")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(8);
    }

    @Test
    void sequentialRollbackMultiInstance() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>().addEntity("action", new TypedObject("sequential_rollback")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(3);
    }

    @Test
    void parallelMultiInstance() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>().addEntity("action", new TypedObject("parallel")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(8);
    }

    @Test
    void parallelRollbackMultiInstance() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>().addEntity("action", new TypedObject("parallel_rollback")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(8);
    }

    @Test
    void parallelGateway() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>().addEntity("action", new TypedObject("parallel_gateway")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(5);
    }

    @Test
    void parallelGatewaySingleTask() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/parallel/multiTransaction.bpmn", transactionHandler);

        ServiceContext serviceContext = new DefaultServiceContext(
                applicationContext,
                new MapBuilder<String, TypedObject>()
                        .addEntity("action", new TypedObject("parallel_gateway_single_task")).build());

        serviceStarter.start("parallel", serviceContext);

        List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select * from members", new HashMap<>());
        Assertions.assertThat(maps).hasSize(5);
    }
}
