package com.dongkuk.oasis.transaction;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import utils.OracleTestDatabase;
import org.springframework.orm.jpa.EntityManagerFactoryUtils;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;
import javax.sql.DataSource;
import java.sql.SQLException;

/**
 * @author Jeongjin Kim
 * @since 2021-05-27
 */
@Execution(ExecutionMode.SAME_THREAD)
public class SpringEntityManagerTransactionTest {
    DataSource dataSource1;
    DataSource database;
    EntityManagerFactory entityManagerFactory1;

    @BeforeEach
    void init() throws SQLException {
        database = database();
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
        entityManagerFactory1 = entityManagerFactory(dataSource1);
    }

    @Test
    void basic() {
        EntityManager entityManager = entityManagerFactory1.createEntityManager();
        EntityTransaction transaction = entityManager.getTransaction();
        transaction.begin();

        entityManager.persist(new Employee(0, "hi", "roo"));

        transaction.commit();
        entityManager.close();
    }

    @Test
    void withSpringTransaction() {
        PlatformTransactionManager tm =
                new JpaTransactionManager(entityManagerFactory1);
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
// explicitly setting the transaction name is something that can be done only programmatically
        def.setName("SomeTxName");
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);

        TransactionStatus status = tm.getTransaction(def);
        try {
            EntityManager entityManager = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory1);
            entityManager.persist(new Employee(0, "hi", "roo"));
        } catch (Exception ex) {
            tm.rollback(status);
            throw ex;
        }
        tm.commit(status);
    }

    @AfterEach
    void close() {
        entityManagerFactory1.close();
    }

    private DataSource database() {
        return OracleTestDatabase.create("transaction/SpringTransactionHandlerTest/schema.sql");
    }

    public EntityManagerFactory entityManagerFactory(DataSource dataSource) {
        LocalContainerEntityManagerFactoryBean entityManagerFactoryBean = new LocalContainerEntityManagerFactoryBean();
        entityManagerFactoryBean.setDataSource(dataSource);
        entityManagerFactoryBean.setPersistenceUnitName("hello");
        entityManagerFactoryBean.setPersistenceXmlLocation("classpath:/META-INF/persistence.xml");
        entityManagerFactoryBean.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        entityManagerFactoryBean.setPackagesToScan("com.dongkuk.oasis.transaction");
        entityManagerFactoryBean.afterPropertiesSet();
        EntityManagerFactory hello = entityManagerFactoryBean.getObject();
        return hello;
    }
}
