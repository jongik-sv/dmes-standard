package com.dongkuk.oasis.methodinvoker;

/**
 * The exception is raised when object initialization fails.
 *
 * @author Jeongjin Kim
 * @since 2021-02-22
 */
final class ObjectInitializationException extends RuntimeException {
    /**
     * Create a new ObjectInitializationException with the specified message.
     *
     * @param msg the detail message
     */
    public ObjectInitializationException(String msg) {
        super(msg);
    }

    /**
     * Create a new ObjectInitializationException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public ObjectInitializationException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
