package com.dongkuk.oasis.model;

/**
 * 에러 이벤트를 대표하는 인터페이스.
 */
public interface ErrorEvent extends Event {
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
