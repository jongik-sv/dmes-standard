package com.dongkuk.oasis.unmarshal;

/**
 * 프로세스 레벨 요소로부터 {@link FlowStore} 생성.
 *
 * @param <T> 요소 타입
 * @author Jeongjin Kim
 * @since 2021-02-03
 */
public interface FlowsStoreBuilder<T> {
    /**
     * {@link FlowStore}를 반환.
     *
     * @param processElement 요소
     * @return {@link FlowStore}
     */
    FlowStore flows(T processElement);
}
