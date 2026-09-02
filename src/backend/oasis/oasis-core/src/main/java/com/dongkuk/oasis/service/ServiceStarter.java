package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.model.Service;

/**
 * {@code OASIS Service}를 실행하는 인터페이스이다.
 * <p>
 * {@link Service} 모델 생성과 실행에 관련한 전반적인 처리를 담당한다.
 * <p>
 * thread-safe 하게 구현해야함.
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public interface ServiceStarter {
    /**
     * 기본 프로세스를 시작함.
     *
     * @param serviceId      서비스 식별자
     * @param serviceContext 서비스 콘텍스트
     * @return 서비스 수행결과
     */
    ServiceResult start(String serviceId, ServiceContext serviceContext);

    /**
     * 기본 프로세스를 시작함.
     *
     * @param serviceId 서비스 식별자
     * @return 서비스 수행결과
     */
    ServiceResult start(String serviceId);
}
