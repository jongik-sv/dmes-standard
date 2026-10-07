package com.dongkuk.oasis.transaction;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import com.dongkuk.oasis.utils.StringObjectMapBuilder;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import utils.OracleTestDatabase;
import org.springframework.orm.jpa.EntityManagerFactoryUtils;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import java.io.IOException;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-05-31
 */
@SuppressFBWarnings({"URF_UNREAD_FIELD", "URF_UNREAD_FIELD", "SS_SHOULD_BE_STATIC"})
@SuppressWarnings("SqlResolve")
@Execution(ExecutionMode.SAME_THREAD)
public class MultipleDataAccessTechSupportTest {
    private final String MYBATIS_CONFIG = "transaction/MultipleDataAccessTechSupportTest/mybatis-config.xml";
    private final String MYBATIS_MAPPER = "transaction/MultipleDataAccessTechSupportTest/mappers/**/*.xml";

    DataSource database;

    DataSource dataSource1;
    EntityManagerFactory entityManagerFactory1;
    JdbcTemplate jdbcTemplate1;
    SqlSession sqlSession1;

    DataSource dataSource2;
    EntityManagerFactory entityManagerFactory2;
    JdbcTemplate jdbcTemplate2;
    SqlSession sqlSession2;

    SpringTransactionHandler transactionHandler;

    @BeforeEach
    void setup() throws SQLException, IOException {
        database = database();

        // dataSource1
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        jdbcTemplate1 = new JdbcTemplate(dataSource1);
        entityManagerFactory1 = entityManagerFactory(dataSource1);
        sqlSession1 = sqlSession(dataSource1);

        // dataSource2
        dataSource2 = new SingleConnectionDataSource(database.getConnection(), true);
        jdbcTemplate2 = new JdbcTemplate(dataSource2);
        entityManagerFactory2 = entityManagerFactory(dataSource2);
        sqlSession2 = sqlSession(dataSource2);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, entityManagerFactory1),
                new TransactionManagerInfoHolder("tm2", dataSource2, entityManagerFactory2)
        );
    }

    public EntityManagerFactory entityManagerFactory(DataSource dataSource) {
//        Map<String, Object> prop = new HashMap<>();
//        prop.put("jakarta.persistence.nonJtaDataSource", dataSource);
//        EntityManagerFactory hello = Persistence.createEntityManagerFactory("hello", prop);

        LocalContainerEntityManagerFactoryBean entityManagerFactoryBean = new LocalContainerEntityManagerFactoryBean();
        entityManagerFactoryBean.setDataSource(dataSource);
        entityManagerFactoryBean.setPersistenceUnitName("hello");
        entityManagerFactoryBean.setPersistenceXmlLocation("classpath:/transaction/MultipleDataAccessTechSupportTest/persistence.xml");
        entityManagerFactoryBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
//        entityManagerFactoryBean.setPackagesToScan("com.dongkuk.oasis.transaction");
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

    private DataSource database() {
        return OracleTestDatabase.create("transaction/MultipleDataAccessTechSupportTest/schema.sql");
    }

    @Test
    void mixedDataSourceAndDataAccessTech() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            transactionHandler.startTransaction("tm2");
            int insert = sqlSession1.insert("com.dongkuk.oasis.transaction.insertEmployEntity",
                    new StringObjectMapBuilder()
                            .addEntity("id", 0)
                            .addEntity("firstName", "kim")
                            .addEntity("lastName", "jeongjin")
                            .build());

            assertThat(insert).isEqualTo(1);

            List<Employee> objects = sqlSession1.selectList("com.dongkuk.oasis.transaction.selectEmployeeEntity");
            assertThat(objects).hasSize(1);

            int update = sqlSession1.update("com.dongkuk.oasis.transaction.updateEmployeeEntity",
                    new StringObjectMapBuilder()
                            .addEntity("firstName", "hoy")
                            .addEntity("id", 0)
                            .build());
            assertThat(update).isEqualTo(1);

            EntityManager entityManager = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory1);
            entityManager.persist(new Employee(1, "hi", "roo"));
            entityManager.flush();

            Integer integer2 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer2).isEqualTo(2);

            Employee employee = entityManager.find(Employee.class, 0);
            assertThat(employee.getFirstName()).isEqualTo("hoy");

            EntityManager entityManager2 = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory2);
            Employee employee2 = entityManager2.find(Employee.class, 0);
            assertThat(employee2).isNull();

            transactionHandler.commitAndRestartTransaction("tm1");
            transactionHandler.startTransaction("tm1");
            employee2 = entityManager2.find(Employee.class, 0);
            assertThat(employee2).isNotNull();

            transactionHandler.commitAll();

        }, null, null);
    }

    @Test
    void mybatisAndJpa() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            int insert = sqlSession1.insert("com.dongkuk.oasis.transaction.insertEmployEntity",
                    new StringObjectMapBuilder()
                            .addEntity("id", 0)
                            .addEntity("firstName", "kim")
                            .addEntity("lastName", "jeongjin")
                            .build());

            assertThat(insert).isEqualTo(1);

            List<Employee> objects = sqlSession1.selectList("com.dongkuk.oasis.transaction.selectEmployeeEntity");
            assertThat(objects).hasSize(1);
            int update = sqlSession1.update("com.dongkuk.oasis.transaction.updateEmployeeEntity",
                    new StringObjectMapBuilder()
                            .addEntity("firstName", "hoy")
                            .addEntity("id", 0)
                            .build());
            assertThat(update).isEqualTo(1);
            EntityManager entityManager = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory1);
            entityManager.persist(new Employee(1, "hi", "roo"));
            entityManager.flush();

            Integer integer2 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer2).isEqualTo(2);

            Employee employee = entityManager.find(Employee.class, 0);
            assertThat(employee.getFirstName()).isEqualTo("hoy");

            transactionHandler.commitAll();

        }, null, null);
    }

    @Test
    void jpaEntityManager() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            EntityManager entityManager = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory1);
            entityManager.persist(new Employee(0, "hi", "roo"));

            entityManager.flush();
            Integer integer2 = jdbcTemplate1.queryForObject("select count(id) from Employee", Integer.class);
            assertThat(integer2).isEqualTo(1);
            transactionHandler.commitAll();
        }, null, null);
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
}
