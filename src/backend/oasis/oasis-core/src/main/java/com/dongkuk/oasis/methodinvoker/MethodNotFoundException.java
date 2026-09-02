package com.dongkuk.oasis.methodinvoker;

/**
 * The exception is raised when failed to find method.
 *
 * @author Jeongjin Kim
 * @since 2021-03-10
 */
class MethodNotFoundException extends RuntimeException {
    /**
     * Create a new MethodNotFoundException with the specified message.
     *
     * @param msg the detail message
     */
    public MethodNotFoundException(String msg) {
        super(msg);
    }

    /**
     * Create a new MethodNotFoundException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public MethodNotFoundException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
