package com.dongkuk.oasis.exceptions;

/**
 * 태스크를 실행중에 발생하는 예외.
 *
 * @author Jeongjin Kim
 * @since 2021-07-15
 */
public class TaskExecutionException extends RuntimeException {
    private static final long serialVersionUID = -2238390327941893344L;

    /**
     * @param message 예외 메시지
     */
    public TaskExecutionException(String message) {
        super(message);
    }

    /**
     * @param message 예외 메시지
     * @param e       예외
     */
    public TaskExecutionException(String message, Throwable e) {
        super(message, e);
    }

    /**
     * @param e 예외
     */
    public TaskExecutionException(Throwable e) {
        super(e);
    }
}
