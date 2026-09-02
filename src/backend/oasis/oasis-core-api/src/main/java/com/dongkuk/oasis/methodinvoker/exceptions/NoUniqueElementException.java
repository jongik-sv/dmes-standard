package com.dongkuk.oasis.methodinvoker.exceptions;

/**
 * The exception is raised when one of the elements of the specified type cannot be selected.
 *
 * @author Jeongjin Kim
 * @since 2021-02-22
 */
public class NoUniqueElementException extends RuntimeException {
    /**
     * Create a new {@link NoUniqueElementException} with the specified message.
     *
     * @param msg the detail message
     */
    public NoUniqueElementException(String msg) {
        super(msg);
    }

    /**
     * Create a new {@link NoUniqueElementException} with the specified message and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public NoUniqueElementException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
