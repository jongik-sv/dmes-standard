package com.dongkuk.oasis.service;

/**
 * @author Jeongjin Kim
 * @since 2021-06-02
 */
public interface ServiceStarterFactory {
    /**
     * ServiceStarter 를 생성해서 반환한다.
     *
     * @return 서비스 스타터
     */
    ServiceStarter generateServiceStarter();
}
