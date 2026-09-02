package usecase.multiDataSource;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionManagerInfoHolder;
import com.dongkuk.oasis.utils.MapBuilder;
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
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

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
 * @since 2021-06-09
 */
@SuppressFBWarnings("URF_UNREAD_FIELD")
@Execution(ExecutionMode.SAME_THREAD)
public class MultiDataSourceTest {
    private static final String MYBATIS_CONFIG = "usecase/multiSource/mybatis-config.xml";
    private static final String MYBATIS_MAPPER = "usecase/multiSource/mappers/**/*.xml";
    EmbeddedDatabase database;
    DataSource dataSource1;
    DataSource dataSource2;
    EntityManagerFactory entityManagerFactory2;
    JdbcTemplate jdbcTemplate2;
    SqlSession sqlSession2;
    SpringTransactionHandler transactionHandler;
    DefaultApplicationContext applicationContext;

    @BeforeEach
    void setup() throws SQLException, IOException {
        applicationContext = new DefaultApplicationContext();
        database = database();
        // dataSource2
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        dataSource2 = new SingleConnectionDataSource(database.getConnection(), true);
        jdbcTemplate2 = new JdbcTemplate(dataSource2);
        entityManagerFactory2 = entityManagerFactory(dataSource2);
        sqlSession2 = sqlSession(dataSource2);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource2, entityManagerFactory2)
        );
    }

    private EmbeddedDatabase database() {
        EmbeddedDatabase dataSource;
        dataSource = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .setScriptEncoding("UTF-8")
                .ignoreFailedDrops(true)
                .addScript("usecase/multiSource/initData.sql")
                .build();
        return dataSource;
    }

    public EntityManagerFactory entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean entityManagerFactoryBean = new LocalContainerEntityManagerFactoryBean();
        entityManagerFactoryBean.setDataSource(dataSource);
        entityManagerFactoryBean.setPersistenceUnitName("hello");
        entityManagerFactoryBean.setPersistenceXmlLocation("classpath:/usecase/multiSource/persistence.xml");
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

    public SqlSessionTemplate sqlSession(@Qualifier("dataSourceMysql") DataSource dataSource) throws IOException {
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
                getServiceStarter("/usecase/multiSource/multiSource.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(
                sqlSession2,
                entityManagerFactory2)));

        applicationContext.putAll(contextData);

        UserDto userDto = new UserDto(4L, "jeongjin", "kim");
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("userDto", new TypedObject(userDto))
                .addEntity("id", new TypedObject(4L))
                .build()
        );

        ServiceResult multiSource = serviceStarter.start("multiSource", serviceContext);
        Assertions.assertThat(multiSource.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        Assertions.assertThat(multiSource.result("cnt").getObject(List.class)).hasSize(4);
        Assertions.assertThat(multiSource.result("cnt2").getObject(List.class)).hasSize(3);
    }

    @Test
    void userException() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/multiSource/multiSource.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();
        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(
                sqlSession2,
                entityManagerFactory2)));

        applicationContext.putAll(contextData);

        UserDto userDto = new UserDto(0L, "jeongjin", "kim");
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("userDto", new TypedObject(userDto))
                .addEntity("id", new TypedObject(0L))
                .build());

        ServiceResult multiSource = serviceStarter.start("multiSource", serviceContext);
        Assertions.assertThat(multiSource.serviceResultCode()).isEqualTo(ServiceResultCode.USER_ERROR);
        List<Map<String, Object>> maps = new JdbcTemplate(dataSource2).queryForList("select id from users");
        Assertions.assertThat(maps).hasSize(3);
    }

    @Test
    void userExceptionAfterTransactionRollback() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/multiSource/multiSourceRollback.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();
        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(
                sqlSession2,
                entityManagerFactory2)));

        applicationContext.putAll(contextData);

        UserDto userDto = new UserDto(4L, "jeongjin", "kim");
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("userDto", new TypedObject(userDto))
                .addEntity("id", new TypedObject(4L))
                .build());

        ServiceResult multiSource = serviceStarter.start("multiSource", serviceContext);
        Assertions.assertThat(multiSource.serviceResultCode()).isEqualTo(ServiceResultCode.USER_ERROR);
        List<Map<String, Object>> maps = new JdbcTemplate(dataSource2).queryForList("select id from users");
        Assertions.assertThat(maps).hasSize(3);
    }

    @Test
    void successWithTransactionManagerName() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/multiSource/multiSourceWithTransactionManagerName.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(
                sqlSession2,
                entityManagerFactory2)));

        applicationContext.putAll(contextData);

        UserDto userDto = new UserDto(4L, "jeongjin", "kim");
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("userDto", new TypedObject(userDto))
                .addEntity("id", new TypedObject(4L))
                .build());

        ServiceResult multiSource = serviceStarter.start("multiSource", serviceContext);
        Assertions.assertThat(multiSource.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        Assertions.assertThat(multiSource.result("cnt").getObject(List.class)).hasSize(4);
        Assertions.assertThat(multiSource.result("cnt2").getObject(List.class)).hasSize(3);
    }

    @Test
    void successWithWrongTransactionManagerName() {
        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/multiSource/multiSourceWithWrongTransactionManagerName.bpmn", transactionHandler);
        Map<String, TypedObject> contextData = new HashMap<>();

        contextData.put("dataSource1", new TypedObject(dataSource1));
        contextData.put("dataSource2", new TypedObject(dataSource2));
        contextData.put("userSignInRepository", new TypedObject(new UserSignInRepository(
                sqlSession2,
                entityManagerFactory2)));

        applicationContext.putAll(contextData);

        UserDto userDto = new UserDto(4L, "jeongjin", "kim");
        ServiceContext serviceContext = new DefaultServiceContext(applicationContext
                , new MapBuilder<String, TypedObject>()
                .addEntity("userDto", new TypedObject(userDto))
                .addEntity("id", new TypedObject(4L))
                .build());
        ServiceResult multiSource = serviceStarter.start("multiSource", serviceContext);
        Assertions.assertThat(multiSource.exception()).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void startSpecificDatasourceFromMultiSource() {
        this.applicationContext.put("tm1", new TypedObject(new DataSourceTransactionManager(dataSource1)));
        this.applicationContext.put("tm2", new TypedObject(new DataSourceTransactionManager(dataSource2)));
        this.applicationContext.put("dataSource1", new TypedObject(dataSource1));
        this.applicationContext.put("dataSource2", new TypedObject(dataSource2));
        SpringTransactionHandler transactionHandler
                = new SpringTransactionHandler(applicationContext, new String[]{"tm1", "tm2"});

        ServiceStarter serviceStarter =
                getServiceStarter("/usecase/multiSource/startSpecificDatasourceFromMultiSource.bpmn",
                        transactionHandler);

        ServiceResult multiSource =
                serviceStarter.start("multiSource", new DefaultServiceContext(applicationContext));
        TypedObject users = multiSource.result("users");
        List<Map<String, Object>> object = users.getObject(new TypeReference<List<Map<String, Object>>>() {
        });
        Assertions.assertThat(object).hasSize(3);
    }
}
