package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.Service;

/**
 * 서비스 레벨 요소로부터 {@link Service} 개체를 생성.
 *
 * @param <T> 요소 타입
 * @author Jeongjin Kim
 * @since 2021-02-02
 */
public interface ServiceBuilder<T> {
    /**
     * @param serviceElement 서비스 레벨 요소
     * @param serviceId      서비스 식별자
     * @param serviceName    서비스 이름
     * @return 서비스
     */
    Service buildService(T serviceElement, String serviceId, String serviceName);
}
