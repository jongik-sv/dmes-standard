package com.dongkuk.oasis.transaction;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 트랜젝션 매니저와 상태를 저장.
 *
 * @param <T> Transaction Manager
 * @param <Q> Transaction Status
 * @author Jeongjin Kim
 */
final class DefaultTransactionManagerWarehouse<T, Q> implements TransactionManagerWarehouse<T, Q> {
    private final Map<String, TransactionManagerAndStatus<T, Q>> transactionManagerAndStatusMap
            = new LinkedHashMap<>();

    @Override
    public void putTransactionManagerAndStatus(TransactionManagerAndStatus<T, Q> transactionManagerAndStatus) {
        transactionManagerAndStatusMap.put(transactionManagerAndStatus.getTransactionManagerName()
                , transactionManagerAndStatus);
    }

    @Override
    public T transactionManager(String transactionManagerName) {
        TransactionManagerAndStatus<T, Q> tx = transactionManagerAndStatus(transactionManagerName);
        return tx == null ? null : tx.getTransactionManager();
    }

    @Override
    public Q transactionStatus(String transactionManagerName) {
        TransactionManagerAndStatus<T, Q> tx = transactionManagerAndStatus(transactionManagerName);
        return tx == null ? null : tx.getTransactionStatus();
    }

    @Override
    public List<TransactionManagerAndStatus<T, Q>> transactionManagerAndStatusList() {
        return new ArrayList<>(transactionManagerAndStatusMap.values());
    }

    @Override
    public void clearTransaction(String transactionManagerName) {
        transactionManagerAndStatusMap.remove(transactionManagerName);
    }

    @Override
    public void clearTransaction() {
        transactionManagerAndStatusMap.clear();
    }

    private TransactionManagerAndStatus<T, Q> transactionManagerAndStatus(String transactionManagerName) {
        return transactionManagerAndStatusMap.get(transactionManagerName);
    }
}
