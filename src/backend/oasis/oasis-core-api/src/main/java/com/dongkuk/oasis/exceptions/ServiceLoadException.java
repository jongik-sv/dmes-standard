package com.dongkuk.oasis.exceptions;

/**
 * 태스크를 실행중에 발생하는 예외.
 *
 * @author Jeongjin Kim
 * @since 2021-07-15
 */
public class ServiceLoadException extends RuntimeException {
    private static final long serialVersionUID = -3619528851029815881L;

    /**
     * @param message 예외 메시지
     */
    public ServiceLoadException(String message) {
        super(message);
    }

    /**
     * @param message 예외 메시지
     * @param e       예외
     */
    public ServiceLoadException(String message, Throwable e) {
        super(message, e);
    }

    /**
     * @param e 예외
     */
    public ServiceLoadException(Throwable e) {
        super(e);
    }
}
