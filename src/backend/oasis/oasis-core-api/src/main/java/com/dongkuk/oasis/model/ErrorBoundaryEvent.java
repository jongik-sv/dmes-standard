package com.dongkuk.oasis.model;

/**
 * 에러 바운더리 이벤트 요소를 대표하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2022-09-24
 */
public interface ErrorBoundaryEvent extends BoundaryEvent, ErrorEvent {

    /**
     * 태스크에 저정한 예외 클래스를 반환한다.
     * <p>
     * 특별히 지정한 클래스가 없으면 {@link Exception}을 반환한다.
     *
     * @return 클래스
     */
    Class<?> getExceptionClass();
}
