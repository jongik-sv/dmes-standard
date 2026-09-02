package com.dongkuk.oasis.transaction;

import org.springframework.orm.jpa.EntityManagerFactoryUtils;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;

/**
 * @author Jeongjin Kim
 * @since 2021-06-14
 */
public class JpaExecutionTemplate {
    private final EntityManagerFactory entityManagerFactory;

    /**
     * @param entityManagerFactory entityManagerFactory
     */
    public JpaExecutionTemplate(EntityManagerFactory entityManagerFactory) {
        this.entityManagerFactory = entityManagerFactory;
    }

    /**
     * @param process 처리기
     */
    public void execute(Process process) {
        EntityManager entityManager = null;
        try {
            entityManager = EntityManagerFactoryUtils.getTransactionalEntityManager(entityManagerFactory);
            if(entityManager == null)
                throw new RuntimeException("Cannot retrieve TransactionManager.");

            process.process(entityManager);
            entityManager.flush();
        } finally {
            if (entityManager != null)
                entityManager.close();
        }
    }

    public interface Process {
        /**
         * @param entityManager entityManager
         */
        void process(EntityManager entityManager);
    }
}