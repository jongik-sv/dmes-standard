package com.dongkuk.oasis.unmarshal;

/**
 * 서비스 요소 파일을 읽어 프로세스 레벨 {@link P} 개체로 반환하는 인터페이스.
 *
 * @param <S> 서비스 개체 타입
 * @param <P> 프로세스 개체 타입
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public interface ProcessElementFromServiceElement<S, P> {
    /**
     * 서비스 요소 읽어 Process level {@link P} 개체로 반환.
     *
     * @param serviceElement 서비스 요소 개체
     * @return Process Level {@link P} 객체
     */
    P processElement(S serviceElement);
}
