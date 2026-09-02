package com.dongkuk.oasis.exceptions;

/**
 * @author Jeongjin Kim
 * @since 2021-07-15
 */
public class UnmarshalException extends RuntimeException {
    private static final long serialVersionUID = -2007387750916405884L;

    /**
     * @param message 예외 메시지
     */
    public UnmarshalException(String message) {
        super(message);
    }

    /**
     * @param message 예외 메시지
     * @param e       예외
     */
    public UnmarshalException(String message, Throwable e) {
        super(message, e);
    }

    /**
     * @param e 예외
     */
    public UnmarshalException(Throwable e) {
        super(e);
    }
}
