package com.dongkuk.oasis.exceptions;

/**
 * 트래이스 정보를 생성하지 않는 예외이다.
 *
 * @author Jeongjin Kim
 * @since 2022-10-12
 */
public class NoTraceException extends RuntimeException {
    /**
     * @param message 예외 메시지
     */
    public NoTraceException(String message) {
        super(message);
    }

    /**
     * @param message 예외 메시지
     * @param cause 원인 예외
     */
    public NoTraceException(String message, Throwable cause) {
        super(message, cause);
    }
}
