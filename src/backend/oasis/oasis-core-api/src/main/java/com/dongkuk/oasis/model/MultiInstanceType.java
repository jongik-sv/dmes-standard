package com.dongkuk.oasis.model;

/**
 * @author Jeongjin Kim
 * @since 2021-07-30
 */
public enum MultiInstanceType {
    /**
     * 반복실행.
     */
    LOOP,
    /**
     * 순환자를 순서대로 실행.
     */
    SEQUENTIAL_MULTI_INSTANCE,
    /**
     * 순환자를 병렬로 실행.
     */
    PARALLEL_MULTI_INSTANCE,
    /**
     * 없음.
     */
    NONE
}
