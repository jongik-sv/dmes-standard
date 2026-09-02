package com.dongkuk.oasis.transaction;

/**
 * Transaction manager 와 transactionStatus 를 대표하는 클래스이다.
 *
 * @param <T> Transaction Manager
 * @param <Q> Transaction Status
 * @author Jeongjin Kim
 * @since 2021-05-24
 */
final class TransactionManagerAndStatus<T, Q> {
    private final String transactionManagerName;
    private final T transactionManager;
    private final Q transactionStatus;

    /**
     * @param transactionManagerName transactionManagerName
     * @param transactionManager     transactionManager
     * @param transactionStatus      transactionStatus
     */
    public TransactionManagerAndStatus(String transactionManagerName, T transactionManager, Q transactionStatus) {
        this.transactionManagerName = transactionManagerName;
        this.transactionManager = transactionManager;
        this.transactionStatus = transactionStatus;
    }

    /**
     * @return TransactionManagerName
     */
    public String getTransactionManagerName() {
        return transactionManagerName;
    }

    /**
     * @return Transaction Manager
     */
    public T getTransactionManager() {
        return transactionManager;
    }

    /**
     * @return transactionStatus
     */
    public Q getTransactionStatus() {
        return transactionStatus;
    }
}
