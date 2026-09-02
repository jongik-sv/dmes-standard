package com.dongkuk.oasis.methodinvoker;

/**
 * The exception is raised when failed to bind method and arguments.
 *
 * @author Jeongjin Kim
 * @since 2021-03-10
 */
class MethodBindingException extends RuntimeException {
    /**
     * Create a new MethodBindingException with the specified message.
     *
     * @param msg the detail message
     */
    public MethodBindingException(String msg) {
        super(msg);
    }

    /**
     * Create a new MethodBindingException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public MethodBindingException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
