package com.dongkuk.oasis.methodinvoker;

/**
 * Exception raised when failed to pick priority.
 *
 * @author Jeongjin Kim
 * @since 2021-03-10
 */
final class PriorityPickingException extends RuntimeException {
    /**
     * Create a new PriorityPickingException with the specified message.
     *
     * @param msg the detail message
     */
    public PriorityPickingException(String msg) {
        super(msg);
    }

    /**
     * Create a new PriorityPickingException with the specified message
     * and root cause.
     *
     * @param msg   the detail message
     * @param cause the root cause
     */
    public PriorityPickingException(String msg, Throwable cause) {
        super(msg, cause);
    }
}
