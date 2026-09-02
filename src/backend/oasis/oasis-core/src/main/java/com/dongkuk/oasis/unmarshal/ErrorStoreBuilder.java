package com.dongkuk.oasis.unmarshal;

/**
 * 프로세스 레벨 요소로부터 {@link ErrorStore} 생성.
 *
 * @param <T> 요소 타입
 * @author Jeongjin Kim
 * @since 2021-07-21
 */
public interface ErrorStoreBuilder<T> {
    /**
     * {@link ErrorStore}를 반환.
     *
     * @param processElement 요소
     * @return {@link ErrorStore}
     */
    ErrorStore errors(T processElement);
}
