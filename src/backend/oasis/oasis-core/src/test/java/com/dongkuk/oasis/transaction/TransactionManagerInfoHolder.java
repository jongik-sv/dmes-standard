package com.dongkuk.oasis.transaction;

import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;

/**
 * @author Jeongjin Kim
 * @since 2021-05-31
 */

public class TransactionManagerInfoHolder {
    private final String transactionManagerName;
    private final DataSource dataSource;
    private final EntityManagerFactory entityManagerFactory;

    public TransactionManagerInfoHolder(String transactionManagerName, DataSource dataSource, EntityManagerFactory entityManagerFactory) {
        this.transactionManagerName = transactionManagerName;
        this.dataSource = dataSource;
        this.entityManagerFactory = entityManagerFactory;
    }

    public String getTransactionManagerName() {
        return transactionManagerName;
    }

    public EntityManagerFactory getEntityManagerFactory() {
        return entityManagerFactory;
    }

    public DataSource getDataSource() {
        return dataSource;
    }
}