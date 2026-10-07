package com.dongkuk.oasis.transaction;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.context.DefaultApplicationContext;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.SqlSessionTemplate;
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

@Execution(ExecutionMode.SAME_THREAD)
public class MixDataAccessTechTest {
    private final static String MYBATIS_CONFIG = "transaction/MixDataAccessTechTest/mybatis-config.xml";
    private final static String MYBATIS_MAPPER = "transaction/MixDataAccessTechTest/mappers/**/*.xml";
    DataSource database;
    DataSource dataSource1;
    EntityManagerFactory entityManagerFactory1;
    JdbcTemplate jdbcTemplate1;
    SqlSession sqlSession1;
    SpringTransactionHandler transactionHandler;

    @BeforeEach
    void setup() throws SQLException, IOException {
        database = database();

        // dataSource1
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        jdbcTemplate1 = new JdbcTemplate(dataSource1);
        entityManagerFactory1 = entityManagerFactory(dataSource1);
        sqlSession1 = sqlSession(dataSource1);

        transactionHandler = transactionHandler(
                new TransactionManagerInfoHolder("tm1", dataSource1, entityManagerFactory1)
        );
    }

    @AfterEach
    void close() {
        entityManagerFactory1.close();
    }

    public EntityManagerFactory entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean entityManagerFactoryBean = new LocalContainerEntityManagerFactoryBean();
        entityManagerFactoryBean.setDataSource(dataSource);
        entityManagerFactoryBean.setPersistenceUnitName("hello");
        entityManagerFactoryBean.setPersistenceXmlLocation(
                "classpath:/transaction/MixDataAccessTechTest/persistence.xml");
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
        // 표는 hibernate.hbm2ddl.auto=create 가 만든다(스크립트 없음)
        return OracleTestDatabase.create();
    }

    public SqlSessionTemplate sqlSession(DataSource dataSource) throws IOException {
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
    void jpaAndMyBatis() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            EntityManager entityManager = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory1);
            entityManager.persist(new EmployeeWithAge(1, 10));
            entityManager.flush();

            List<Integer> objects = sqlSession1.selectList("mixDataAccessTechTest.max");
            Integer integer = objects.get(0);
            assertThat(integer).isEqualTo(10);

            EmployeeWithAge employee_with_age = entityManager.find(EmployeeWithAge.class, 1);
            employee_with_age.setAge(integer + 1);
            entityManager.persist(employee_with_age);
            entityManager.flush();

            List<Integer> objects2 = sqlSession1.selectList("mixDataAccessTechTest.max");
            Integer integer2 = objects2.get(0);
            assertThat(integer2).isEqualTo(11);

            transactionHandler.commitAll();
        }, null, null);
    }

    @Test
    void jpaAndJdbc() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            EntityManager entityManager = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory1);
            entityManager.persist(new EmployeeWithAge(1, 10));
            entityManager.flush();

            List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select max(age) as age from employeeWithAge");
            Integer integer = ((Number) maps.get(0).get("AGE")).intValue();
            assertThat(integer).isEqualTo(10);

            EmployeeWithAge employee_with_age = entityManager.find(EmployeeWithAge.class, 1);
            employee_with_age.setAge(integer + 1);
            entityManager.persist(employee_with_age);
            entityManager.flush();

            List<Map<String, Object>> maps2 = jdbcTemplate1.queryForList("select max(age) as age from employeeWithAge");
            Integer integer2 = ((Number) maps2.get(0).get("AGE")).intValue();
            assertThat(integer2).isEqualTo(11);

            transactionHandler.commitAll();
        }, null, null);
    }

    @Test
    void mybatisAndJdbc() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");
            Map<String, Integer> param = new HashMap<>();
            param.put("id", 1);
            param.put("age", 10);
            int insert = sqlSession1.insert("mixDataAccessTechTest.new", param);
            assertThat(insert).isEqualTo(1);

            List<Map<String, Object>> maps = jdbcTemplate1.queryForList("select max(age) as age from employeeWithAge");
            Integer integer = ((Number) maps.get(0).get("AGE")).intValue();
            assertThat(integer).isEqualTo(10);

            Map<String, Integer> param2 = new HashMap<>();
            param2.put("id", 1);
            param2.put("age", integer + 1);
            int insert1 = sqlSession1.insert("mixDataAccessTechTest.update", param2);
            assertThat(insert1).isEqualTo(1);

            List<Map<String, Object>> maps2 = jdbcTemplate1.queryForList("select max(age) as age from employeeWithAge");
            Integer integer2 = ((Number) maps2.get(0).get("AGE")).intValue();
            assertThat(integer2).isEqualTo(11);

            transactionHandler.commitAll();
        }, null, null);
    }

    @Test
    void jdbcAndMyBatis() {
        transactionHandler.execute(() -> {
            transactionHandler.startTransaction("tm1");

            jdbcTemplate1.update("insert into employeeWithAge(id, age) values(1, 10)");

            List<Integer> objects = sqlSession1.selectList("mixDataAccessTechTest.max");
            Integer integer = objects.get(0);
            assertThat(integer).isEqualTo(10);

            jdbcTemplate1.update("update employeeWithAge set age = ? where id = ?", integer + 1, 1);

            List<Integer> objects2 = sqlSession1.selectList("mixDataAccessTechTest.max");
            Integer integer2 = objects2.get(0);
            assertThat(integer2).isEqualTo(11);

            transactionHandler.commitAll();
        }, null, null);
    }
}
