package usecase.transactionalSubService;

import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.jdbc.DefaultDataSourceResolver;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.dongkuk.oasis.message.PreStructuredMessage;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionManagerInfoHolder;
import com.dongkuk.oasis.utils.MapBuilder;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.slf4j.MDC;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import utils.OracleTestDatabase;

import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import java.io.IOException;
import java.sql.SQLException;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.BpmnServiceLoaderForTest.getServiceStarter;

/**
 * @author Jeongjin Kim
 * @since 2023-01-10
 */
@SuppressFBWarnings("URF_UNREAD_FIELD")
@Execution(ExecutionMode.SAME_THREAD)
public class TransactionalSubServiceTest {
    private static final String MYBATIS_CONFIG = "usecase/transactionalSubService/mybatis-config.xml";
    private static final String MYBATIS_MAPPER = "usecase/transactionalSubService/mappers/**/*.xml";
    DataSource database;
    DataSource dataSource1;
    DataSource dataSource2;
    EntityManagerFactory entityManagerFactory1;
    JdbcTemplate jdbcTemplate1;
    SqlSession sqlSession1;
    SpringTransactionHandler transactionHandler;
    DefaultApplicationContext applicationContext;

    JdbcTemplate jdbcTemplateForCheck;

    @BeforeEach
    void setup() throws SQLException, IOException {
        applicationContext = new DefaultApplicationContext();
        database = database();
        // dataSource2
        HikariConfig hikariConfig = new HikariConfig();
        hikariConfig.setDataSource(database);
        dataSource1 = new HikariDataSource(hikariConfig);
//        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);

//        dataSource2 = new SingleConnectionDataSource(database.getConnection(), true);
        dataSource2 = new HikariDataSource(hikariConfig);

        jdbcTemplate1 = new JdbcTemplate(dataSource1);
        jdbcTemplateForCheck = new JdbcTemplate(dataSource2);
        entityManagerFactory1 = entityManagerFactory(dataSource1);
        sqlSession1 = sqlSession(dataSource1);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, entityManagerFactory1)
        );
    }

    private DataSource database() {
        return OracleTestDatabase.create("usecase/transactionalSubService/initData.sql");
    }

    private EntityManagerFactory entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean entityManagerFactoryBean = new LocalContainerEntityManagerFactoryBean();
        entityManagerFactoryBean.setDataSource(dataSource);
        entityManagerFactoryBean.setPersistenceUnitName("hello");
        entityManagerFactoryBean.setPersistenceXmlLocation(
                "classpath:/usecase/transactionalSubService/persistence.xml");
        entityManagerFactoryBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        entityManagerFactoryBean.afterPropertiesSet();
        return entityManagerFactoryBean.getObject();
    }

    private SpringTransactionHandler transactionHandler(TransactionManagerInfoHolder... transactionManagerInfoHolders) {
        for (TransactionManagerInfoHolder transactionManagerInfoHolder : transactionManagerInfoHolders) {
            PlatformTransactionManager tm =
                    new JpaTransactionManager(transactionManagerInfoHolder.getEntityManagerFactory());

            this.applicationContext.put(transactionManagerInfoHolder.getTransactionManagerName(), new TypedObject(tm));
        }

        return new SpringTransactionHandler(applicationContext, Arrays.stream(transactionManagerInfoHolders)
                .map(TransactionManagerInfoHolder::getTransactionManagerName).toArray(String[]::new));
    }

    private SqlSessionTemplate sqlSession(DataSource dataSource) throws IOException {
        SqlSessionFactoryBean sqlSessionFactoryBean = new SqlSessionFactoryBean();
        sqlSessionFactoryBean.setDataSource(dataSource);
        sqlSessionFactoryBean.setMapperLocations(new PathMatchingResourcePatternResolver().getResources(MYBATIS_MAPPER));
        sqlSessionFactoryBean.setConfigLocation(new PathMatchingResourcePatternResolver().getResource(MYBATIS_CONFIG));
        SqlSessionFactory object;
        try {
            object = sqlSessionFactoryBean.getObject();
        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        return new SqlSessionTemplate(object);
    }

    @Test
    void success() {
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("noerror"))
                .build()
        );

        serviceStarter.start("mainService", serviceContext);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("Jeongjin");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("full");
    }

    @Test
    void subServiceError() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("subservice_error"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
            }
        }.mdc(serviceTag);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("jj");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("full");
    }

    @Test
    void subServiceErrorResultBranching() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("error_result_branch"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_1sgnqlc");
            }
        }.mdc(serviceTag);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("jj");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("full");
    }

    @Test
    void subServiceMultiInstance() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));
        contextData.put("defaultDataSourceResolver",
                new TypedObject((DefaultDataSourceResolver) () -> dataSource1));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("multi_subservice"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_190e37y");
            }
        }.mdc(serviceTag);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);
        UserDto user2 = getUserDto(2L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("000");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("111");
        Assertions.assertThat(user2.getFirstName()).isEqualTo("2222");
    }

    @Test
    void subServiceMultiInstanceWithException() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));
        contextData.put("defaultDataSourceResolver",
                new TypedObject((DefaultDataSourceResolver) () -> dataSource1));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("multi_subservice_exception"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_1m97zl9");
            }
        }.mdc(serviceTag);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);
        UserDto user2 = getUserDto(2L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("000");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("111");
        Assertions.assertThat(user2.getFirstName()).isEqualTo("aa");
    }

    @Test
    void subServiceMultiInstanceParallel() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));
        contextData.put("defaultDataSourceResolver",
                new TypedObject((DefaultDataSourceResolver) () -> dataSource1));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("multi_subservice_parallel"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_1jkbvwu");
            }
        }.mdc(serviceTag);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);
        UserDto user2 = getUserDto(2L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("000");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("111");
        Assertions.assertThat(user2.getFirstName()).isEqualTo("2222");
    }

    @Test
    void subServiceMultiInstanceParallelWithException() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));
        contextData.put("defaultDataSourceResolver",
                new TypedObject((DefaultDataSourceResolver) () -> dataSource1));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("multi_subservice_parallel_exception"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_0r1t7zn");
            }
        }.mdc(serviceTag);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);
        UserDto user2 = getUserDto(2L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("000");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("111");
        Assertions.assertThat(user2.getFirstName()).isEqualTo("aa");
    }

    @Test
    void subServiceMessage() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));
        contextData.put("defaultDataSourceResolver",
                new TypedObject((DefaultDataSourceResolver) () -> dataSource1));
        contextData.put("topicLoader",
                new TypedObject(new TestTopicLoader()));
        contextData.put("topicStructureLoader",
                new TypedObject(new TestTopicStructureLoader()));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("message"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_1ldtgxx");
                Assertions.assertThat(multiSource.messages()).hasSize(2);
                Assertions.assertThat(multiSource.path()).hasSize(6);
                Assertions.assertThat(((PreStructuredMessage) multiSource.messages().get(0))
                                .preStructuredMessageElements().get(0).getValue())
                        .isEqualTo("name1");
                Assertions.assertThat(((PreStructuredMessage) multiSource.messages().get(1))
                                .preStructuredMessageElements().get(0).getValue())
                        .isEqualTo("name2");

                ServiceResult subServiceResult1 = ((TypedObject) multiSource.result("sub").getObject(List.class).get(0))
                        .getObject(ServiceResult.class);
                Assertions.assertThat(subServiceResult1.path()).hasSize(3);
                Assertions.assertThat(subServiceResult1.messages()).hasSize(1);
                Assertions.assertThat(((PreStructuredMessage) subServiceResult1.messages().get(0))
                                .preStructuredMessageElements().get(0).getValue())
                        .isEqualTo("name1");

                ServiceResult subServiceResult2 = ((TypedObject) multiSource.result("sub").getObject(List.class).get(1))
                        .getObject(ServiceResult.class);
                Assertions.assertThat(subServiceResult2.path()).hasSize(3);
                Assertions.assertThat(subServiceResult2.messages()).hasSize(1);
                Assertions.assertThat(((PreStructuredMessage) subServiceResult2.messages().get(0))
                                .preStructuredMessageElements().get(0).getValue())
                        .isEqualTo("name2");
            }
        }.mdc(serviceTag);
    }

    @Test
    void subServiceMessageParallel() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));
        contextData.put("defaultDataSourceResolver",
                new TypedObject((DefaultDataSourceResolver) () -> dataSource1));
        contextData.put("topicLoader",
                new TypedObject(new TestTopicLoader()));
        contextData.put("topicStructureLoader",
                new TypedObject(new TestTopicStructureLoader()));

        applicationContext.putAll(contextData);

        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("parallel_message"))
                .build()
        );
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.serviceResultMessage()).isNull();
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_1xqfvx8");
                Assertions.assertThat(multiSource.messages()).hasSize(100);
                Assertions.assertThat(multiSource.path()).hasSize(6);

                ServiceResult subServiceResult1 = ((TypedObject) multiSource.result("sub").getObject(List.class).get(0))
                        .getObject(ServiceResult.class);
                Assertions.assertThat(subServiceResult1.path()).hasSize(3);
                Assertions.assertThat(subServiceResult1.messages()).hasSize(1);

                ServiceResult subServiceResult2 = ((TypedObject) multiSource.result("sub").getObject(List.class).get(1))
                        .getObject(ServiceResult.class);
                Assertions.assertThat(subServiceResult2.path()).hasSize(3);
                Assertions.assertThat(subServiceResult2.messages()).hasSize(1);
            }
        }.mdc(serviceTag);
    }

    @Test
    void subServiceAudit() {
        String serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        ServiceStarter serviceStarter =
                getServiceStarter(new TestServiceProvider(), transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("basicRepository", new TypedObject(new BasicRepository(
                sqlSession1,
                entityManagerFactory1)));
        contextData.put("serviceStarter", new TypedObject(serviceStarter));

        applicationContext.putAll(contextData);

        DefaultServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("action", new TypedObject("audit"))
                .build()
        );

        serviceContext.setAudit(new TestAudit("TT"));
        new MDCTemplate() {
            @Override
            public void process() {
                ServiceResult multiSource = serviceStarter.start("mainService", serviceContext);
                Assertions.assertThat(multiSource.path().get(multiSource.path().size() - 1).getId())
                        .isEqualTo("Event_01rvr7m");
            }
        }.mdc(serviceTag);

        UserDto user0 = getUserDto(0L);
        UserDto user1 = getUserDto(1L);
        UserDto user2 = getUserDto(2L);

        Assertions.assertThat(user0.getFirstName()).isEqualTo("Jeongjin");
        Assertions.assertThat(user1.getFirstName()).isEqualTo("yy");
        Assertions.assertThat(user2.getFirstName()).isEqualTo("2222");
        Assertions.assertThat(user0.getCreatedBy()).isEqualTo("TT");
        Assertions.assertThat(user1.getCreatedBy()).isNull();
        Assertions.assertThat(user2.getCreatedBy()).isEqualTo("TT");
    }

    private UserDto getUserDto(Long id) {
        UserDto query = jdbcTemplateForCheck.queryForObject("select  * from users where id = ?",
                new Object[]{id},
                (rs, rowNum) -> new UserDto(
                        rs.getLong("id"),
                        rs.getString("firstName"),
                        rs.getString("lastName"),
                        rs.getString("createdBy")
                ));
        return query;
    }
}
