package com.dongkuk.oasis.unmarshal;

/**
 * @author Jeongjin Kim
 * @since 2021-02-02
 */
public class MarshallerException extends RuntimeException {
    private static final long serialVersionUID = 3425694473172869883L;

    /**
     * @param message 메시지
     * @param e       예외
     */
    public MarshallerException(String message, Throwable e) {
        super(message, e);
    }

    /**
     * @param message 메시지
     */
    public MarshallerException(String message) {
        super(message);
    }
}
