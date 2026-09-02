package com.dongkuk.oasis.provider;

import com.dongkuk.oasis.model.Service;

/**
 * 서비스 모델을 생성하여 반환하는 역할.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public interface ServiceProvider {
    /**
     * @param serviceId 서비스 식별자
     * @return {@link Service} 객체
     */
    Service service(String serviceId);
}
