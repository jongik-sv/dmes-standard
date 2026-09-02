package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.model.Process;

/**
 * @author Jeongjin Kim
 * @since 2021-07-08
 */
public interface ServiceContextAdapter {
    /**
     * @param serviceContext 변환 전 서비스 컨텍스트
     * @param initialProcess 초기 프로세스
     * @return 변환된 서비스 컨텍스트
     */
    ServiceContext adaptServiceInput(ServiceContext serviceContext, Process initialProcess);
}
