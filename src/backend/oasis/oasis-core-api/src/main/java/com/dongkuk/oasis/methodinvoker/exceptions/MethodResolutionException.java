package com.dongkuk.oasis.methodinvoker.exceptions;

/**
 * 메서드 바인딩/해석 단계에서 후보 결정에 실패했을 때 발생하는 예외.
 *
 * @author Jeongjin Kim
 * @since 2026-05-15
 */
public class MethodResolutionException extends MethodInvokeException {
    /**
     * @param msg 예외 메시지
     */
    public MethodResolutionException(String msg) {
        super(msg);
    }

    /**
     * @param msg 예외 메시지
     * @param cause 원인 예외
     */
    public MethodResolutionException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
