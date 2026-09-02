package com.dongkuk.oasis.model;

/**
 * 서비스를 대표하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-01-29
 */
public interface Service {
    /**
     * 요소 식별자.
     * <p>
     * 항상 {@code null} 이 아닌 값을 반환해야 함.
     *
     * @return 요소 식별자
     */
    String getServiceId();

    /**
     * 요소 이름.
     * <p>
     * {@code null} 일 수 있음
     *
     * @return 요소 이름
     */
    String getServiceName();

    /**
     * 서비스가 실행할 최초 프로세스를 반환.
     *
     * @return 프로세스 인스턴스
     */
    Process getInitialProcess();

    /**
     * 지정한 프로세스 식별자를 가진 프로세스 객체를 반환.
     *
     * @param processId 반환 받을 프로세스 식별자
     * @return 프로세스 객체
     */
    Process getProcess(String processId);
}
