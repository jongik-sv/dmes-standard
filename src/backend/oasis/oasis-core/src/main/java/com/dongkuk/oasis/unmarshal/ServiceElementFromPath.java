package com.dongkuk.oasis.unmarshal;

/**
 * 서비스 문서 파일을 읽어 {@link T} 개체로 반환하는 인터페이스.
 *
 * @param <T> 개체 타입
 * @author Jeongjin Kim
 * @since 2021-02-04
 */
public interface ServiceElementFromPath<T> {
    /**
     * Path 에 있는 문서를 읽어 Service level {@link T} 개체로 반환.
     *
     * @param path 문서 경로
     * @return Service Level {@link T} 객체
     */
    T serviceElement(String path);

}
