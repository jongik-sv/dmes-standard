package com.dongkuk.oasis.unmarshal;

import java.util.Set;

/**
 * 프로세스 요소 읽어 이벤트 레벨 {@link E} 개체로 반환하는 인터페이스.
 *
 * @param <P> 프로세스 개체 타입
 * @param <E> 이벤트 개체 타입
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public interface EventElementFromProcessElement<P, E> {
    /**
     * 프로세스 요소 읽어 이벤트 레벨 {@link E} 개체로 반환.
     *
     * @param processElement 프로세 요소 개체
     * @return 이벤트 레벨 {@link E} 개체 집합
     */
    Set<E> eventElement(P processElement);
}
