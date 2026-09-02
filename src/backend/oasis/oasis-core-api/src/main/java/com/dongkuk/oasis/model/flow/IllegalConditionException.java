package com.dongkuk.oasis.model.flow;

/**
 * 조건이 부적합 함.
 *
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public class IllegalConditionException extends RuntimeException {
    private static final long serialVersionUID = 5265982935508348168L;

    /**
     * @param message 메시지
     */
    public IllegalConditionException(String message) {
        super(message);
    }
}
