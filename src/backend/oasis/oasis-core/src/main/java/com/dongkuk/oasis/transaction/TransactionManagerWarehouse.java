package com.dongkuk.oasis.transaction;

import java.util.List;

/**
 * Transaction manager 와 transactionStatus 세트를 보관하고 반환하는 역할을 한다.
 *
 * @param <T> Transaction Manager
 * @param <Q> Transaction Status
 */
interface TransactionManagerWarehouse<T, Q> extends Warehouse {
    /**
     * Transaction manager 와 transactionStatus 를 추가한다.
     *
     * @param transactionManagerAndStatus 트랜잭션 매니저와 상태
     */
    void putTransactionManagerAndStatus(TransactionManagerAndStatus<T, Q> transactionManagerAndStatus);

    /**
     * 트랜잭션 이름으로 트랜잭션 매니저를 반환한다.
     * <p>
     * 요청한 트랜잭션 매니저 이름이 존재하지 않으면 {@code null}을 반환한다.
     *
     * @param transactionManagerName 트랜잭션 매니저 이름
     * @return 트랜잭션 매니저와 상태
     */
    T transactionManager(String transactionManagerName);

    /**
     * 트랜잭션 이름으로 트랜잭션 상태를 반환한다.
     * <p>
     * 요청한 트랜잭션 매니저 이름이 존재하지 않으면 {@code null}을 반환한다.
     *
     * @param transactionManagerName 트랜잭션 매니저 이름
     * @return 트랜잭션 매니저와 상태
     */
    Q transactionStatus(String transactionManagerName);

    /**
     * 트랜잭션 매니저와 상태를 반환한다.
     * <p>
     * 추가된 순서대로 반환해야한다.
     *
     * @return 트랜잭션 매니저와 상태 리스트
     */
    List<TransactionManagerAndStatus<T, Q>> transactionManagerAndStatusList();

    /**
     * 트랜잭션 매니저를 삭제한다.
     *
     * @param transactionManagerName 트랜잭션 매니저 이름
     */
    void clearTransaction(String transactionManagerName);

    /**
     * 트랜잭션 매니저를 삭제한다.
     */
    void clearTransaction();
}