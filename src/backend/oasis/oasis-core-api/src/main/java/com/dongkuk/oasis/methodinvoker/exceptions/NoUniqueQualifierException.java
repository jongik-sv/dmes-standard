package com.dongkuk.oasis.methodinvoker.exceptions;

/**
 * The exception is raised when more than one qualifier value exists.
 *
 * @author Jeongjin Kim
 * @since 2021-03-10
 */
public class NoUniqueQualifierException extends RuntimeException {
    /**
     * Create a new NoUniqueQualifierException with the specified message.
     *
     * @param msg the detail message
     */
    public NoUniqueQualifierException(String msg) {
        super(msg);
    }

    /**
     * Create a new NoUniqueQualifierException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public NoUniqueQualifierException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
