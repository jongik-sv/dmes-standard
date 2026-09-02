package com.dongkuk.oasis.methodinvoker;

/**
 * The exception is raised when more than one default value exists.
 *
 * @author Jeongjin Kim
 * @since 2021-03-10
 */
class TooManyDefaultException extends RuntimeException {
    /**
     * Create a new TooManyDefaultException with the specified message.
     *
     * @param msg the detail message
     */
    public TooManyDefaultException(String msg) {
        super(msg);
    }

    /**
     * Create a new TooManyDefaultException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public TooManyDefaultException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
