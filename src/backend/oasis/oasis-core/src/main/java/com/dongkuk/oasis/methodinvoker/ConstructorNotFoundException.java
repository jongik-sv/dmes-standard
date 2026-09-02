package com.dongkuk.oasis.methodinvoker;

/**
 * The exception is raised when failed to find constructor.
 *
 * @author Jeongjin Kim
 * @since 2021-03-16
 */
final class ConstructorNotFoundException extends RuntimeException {
    /**
     * Create a new ConstructorNotFoundException with the specified message.
     *
     * @param msg the detail message
     */
    public ConstructorNotFoundException(String msg) {
        super(msg);
    }

    /**
     * Create a new ConstructorNotFoundException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public ConstructorNotFoundException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
