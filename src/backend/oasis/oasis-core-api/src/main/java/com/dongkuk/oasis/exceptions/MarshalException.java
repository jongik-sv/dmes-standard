package com.dongkuk.oasis.exceptions;

/**
 * @author Jeongjin Kim
 * @since 2021-07-15
 */
public class MarshalException extends RuntimeException {
    private static final long serialVersionUID = -1451094570800515289L;

    /**
     * @param message 예외 메시지
     */
    public MarshalException(String message) {
        super(message);
    }

    /**
     * @param message 예외 메시지
     * @param e       예외
     */
    public MarshalException(String message, Throwable e) {
        super(message, e);
    }

    /**
     * @param e 예외
     */
    public MarshalException(Throwable e) {
        super(e);
    }
}
