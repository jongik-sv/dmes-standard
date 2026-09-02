package com.dongkuk.oasis.exceptions;

/**
 * JAVA 서비스 태스크에서 지정한 메소드를 찾을 수 없을 때 발생하는 예외.
 *
 * @author Jeongjin Kim
 * @since 2022-04-21
 */
public class MethodNotFoundException extends NoTraceException {
    private static final long serialVersionUID = -2238390327941893344L;

    /**
     * @param message 예외 메시지
     */
    public MethodNotFoundException(String message) {
        super(message);
    }

    /**
     * @param message 예외 메시지
     * @param cause 원인 예외
     */
    public MethodNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
