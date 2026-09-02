package com.dongkuk.oasis.exceptions;

/**
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public class IllegalTaskException extends RuntimeException {
    private static final long serialVersionUID = -5376542425882690943L;

    /**
     * @param message 메시지
     * @param cause   원인
     */
    public IllegalTaskException(String message, Throwable cause) {
        super(message, cause);
    }
}
