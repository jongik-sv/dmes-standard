package com.dongkuk.oasis.unmarshal;

import java.util.Set;

/**
 * 프로세스 요소 읽어 태스크 레벨 {@link T} 개체로 반환하는 인터페이스.
 *
 * @param <P> 프로세스 개체 타입
 * @param <T> 태스크 개체 타입
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public interface TaskElementFromProcessElement<P, T> {
    /**
     * 프로세스 요소 읽어 태스크 레벨 {@link T} 개체로 반환.
     *
     * @param processElement 프로세스 요소 개체
     * @return 테스크 레벨 {@link T} 개체 집합
     */
    Set<T> taskElement(P processElement);
}
