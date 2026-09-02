package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;

/**
 * 서비스 컨택스트에서 DTO 생성을 하여 반환한다.
 */
public interface DtoGeneratorFromServiceContext {
    /**
     * DTO 오브젝트 생성.
     *
     * @param serviceContext 서비스 컨텍스트
     * @param tClass         DTO 클래스
     * @param <T>            DTO 클래스 타입
     * @return DTO 오브젝트
     */
    <T> T generator(ServiceContext serviceContext, Class<T> tClass);
}
