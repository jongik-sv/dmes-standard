package com.dongkuk.oasis.exceptions;

/**
 * 사용자가 임의로 발생시킨 예외이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public class UserException extends RuntimeException {
    private static final long serialVersionUID = -8977984063430692244L;

    /**
     * 사용자 임의 예외 생성.
     *
     * @param message 메시지
     */
    public UserException(String message) {
        super(message);
    }
}
