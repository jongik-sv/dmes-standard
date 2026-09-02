package com.dongkuk.oasis.exceptions;

/**
 * 속성을 잘 못 사용했거나, 속성을 처리하다가 오류가 발생했을 때.
 *
 * @author Jeongjin Kim
 * @since 2021-07-02
 */
public class PropertyException extends RuntimeException {
    private static final long serialVersionUID = -8937593291828765004L;

    /**
     * @param message 예외 메시지
     */
    public PropertyException(String message) {
        super(message);
    }

    /**
     * @param message 예외 메시지
     * @param e       예외
     */
    public PropertyException(String message, Throwable e) {
        super(message, e);
    }
}
