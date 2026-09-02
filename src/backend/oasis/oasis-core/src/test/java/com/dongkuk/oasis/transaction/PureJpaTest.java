package com.dongkuk.oasis.transaction;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

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
    private EmbeddedDatabase database() {
        EmbeddedDatabase dataSource;
        dataSource = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .setScriptEncoding("UTF-8")
                .ignoreFailedDrops(true)
//                .addScript("transaction/SpringTransactionHandlerTest/schema.sql")
                .build();
        return dataSource;
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
