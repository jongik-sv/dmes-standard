package com.dongkuk.oasis.transaction;

import org.junit.jupiter.api.Test;
import utils.OracleTestDatabase;

import javax.sql.DataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import jakarta.persistence.EntityTransaction;
import jakarta.persistence.Persistence;
import java.util.HashMap;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-05-27
 */
public class PureJpaTest {
    private DataSource database() {
        // 표는 hibernate.hbm2ddl.auto=create 가 만든다(스크립트 없음)
        return OracleTestDatabase.create();
    }

    @Test
    void jap() {
        Map<String, Object> prop = new HashMap<>();
        prop.put("jakarta.persistence.nonJtaDataSource", database());
        EntityManagerFactory hello = Persistence.createEntityManagerFactory("hello", prop);
        EntityManager entityManager = hello.createEntityManager();
        EntityTransaction transaction = entityManager.getTransaction();
        transaction.begin();
        entityManager.persist(new Employee(2, "hi", "roo"));
        transaction.commit();
        entityManager.close();
        hello.close();
    }
}
