package com.dongkuk.oasis.message;

/**
 * 메시지 요소 타입.
 */
public enum TopicStructureElementType {
    /**
     * 문자열.
     */
    STRING,
    /**
     * 숫자.
     */
    NUMBER,
    /**
     * 날짜.
     */
    DATE,
    /**
     * 시간.
     */
    TIME,
    /**
     * 타임스탬프.
     */
    TIMESTAMP,
    /**
     * 불리언.
     */
    BOOLEAN,
    /**
     * 알 수 없음.
     */
    UNKNOWN,
    /**
     * 알 수 없음.
     */
    NOT_BOUND
}
