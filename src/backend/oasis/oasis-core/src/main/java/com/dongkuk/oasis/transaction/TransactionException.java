package com.dongkuk.oasis.transaction;

/**
 * @author Jeongjin Kim
 * @since 2021-05-21
 */
public class TransactionException extends RuntimeException {
    private static final long serialVersionUID = -5302566693232440058L;

    /**
     * @param message 메시지
     * @param e       예외
     */
    public TransactionException(String message, Throwable e) {
        super(message, e);
    }

    /**
     * @param message 메시지
     */
    public TransactionException(String message) {
        super(message);
    }
}
