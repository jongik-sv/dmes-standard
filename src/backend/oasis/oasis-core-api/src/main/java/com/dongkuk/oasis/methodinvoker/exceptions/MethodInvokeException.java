package com.dongkuk.oasis.methodinvoker.exceptions;

/**
 * The exception is raised when failed to invoke method.
 *
 * @author Jeongjin Kim
 * @since 2021-03-10
 */
public class MethodInvokeException extends RuntimeException {
    /**
     * Create a new MethodInvokeException with the specified message.
     *
     * @param msg the detail message
     */
    public MethodInvokeException(String msg) {
        super(msg);
    }

    /**
     * Create a new MethodInvokeException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public MethodInvokeException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
