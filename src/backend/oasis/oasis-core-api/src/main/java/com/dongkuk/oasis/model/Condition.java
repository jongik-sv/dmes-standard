package com.dongkuk.oasis.model;

/**
 * @param <T> 조건문 타입
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface Condition<T> {
    /**
     * @return 조건 표현식
     */
    T conditionExpression();
}
