package com.dongkuk.oasis.model.error;

/**
 * 에러 정보를 대표하는 요소.
 *
 * @author Jeongjin Kim
 * @since 2021-07-21
 */
public interface Error {
    /**
     * @return 에러 식별자
     */
    String errorId();

    /**
     * @return 에러 이름
     */
    String errorName();

    /**
     * @return 에러 코드
     */
    String errorCode();

    /**
     * @return 에러 메시지
     */
    String errorMessage();
}
