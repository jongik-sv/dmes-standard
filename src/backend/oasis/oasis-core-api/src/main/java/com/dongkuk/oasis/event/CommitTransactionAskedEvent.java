package com.dongkuk.oasis.event;

import java.util.Arrays;

/**
 * @author Jeongjin Kim
 * @since 2021-06-21
 */
public class CommitTransactionAskedEvent implements Event {
    private final String[] transactionManagerNames;

    /**
     * @param transactionManagerNames transactionManagerNames
     */
    public CommitTransactionAskedEvent(String[] transactionManagerNames) {
        this.transactionManagerNames = Arrays.copyOf(transactionManagerNames, transactionManagerNames.length);
    }

    /**
     * @return transactionManagerNames
     */
    public String[] getTransactionManagerNames() {
        return Arrays.copyOf(transactionManagerNames, transactionManagerNames.length);
    }
}
