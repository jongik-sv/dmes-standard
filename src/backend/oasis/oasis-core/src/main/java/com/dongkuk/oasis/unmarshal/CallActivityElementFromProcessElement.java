package com.dongkuk.oasis.unmarshal;

import java.util.Set;

/**
 * 프로세스 요소 읽어 Call Activity 레벨 {@link T} 개체로 반환하는 인터페이스.
 *
 * @param <P> 프로세스 개체 타입
 * @param <T> CallActivity 개체 타입
 * @author Jeongjin Kim
 * @since 2021-06-29
 */
public interface CallActivityElementFromProcessElement<P, T> {
    /**
     * 프로세스 요소 읽어 CallActivity 레벨 {@link T} 개체로 반환.
     *
     * @param processElement 프로세스 요소 개체
     * @return CallActivity 레벨 {@link T} 개체 집합
     */
    Set<T> callActivityElement(P processElement);
}
