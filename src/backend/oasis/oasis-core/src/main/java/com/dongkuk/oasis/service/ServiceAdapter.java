package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;

/**
 * @author Jeongjin Kim
 * @since 2021-06-04
 */
public interface ServiceAdapter {
    /**
     * @param serviceContext 서비스 컨텍스트
     * @return 변환된 서비스 컨텍스트
     */
    ServiceContext adapt(ServiceContext serviceContext);
}
