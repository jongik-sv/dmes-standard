package com.dongkuk.oasis.event;

import java.util.Arrays;

/**
 * @author Jeongjin Kim
 * @since 2021-06-21
 */
public class RollbackTransactionAskedEvent implements Event {
    private final String[] transactionManagerNames;

    /**
     * @param transactionManagerNames transactionManagerNames
     */
    public RollbackTransactionAskedEvent(String[] transactionManagerNames) {
        this.transactionManagerNames = Arrays.copyOf(transactionManagerNames, transactionManagerNames.length);
    }

    /**
     * @return transactionManagerNames
     */
    public String[] getTransactionManagerNames() {
        return Arrays.copyOf(transactionManagerNames, transactionManagerNames.length);
    }
}
