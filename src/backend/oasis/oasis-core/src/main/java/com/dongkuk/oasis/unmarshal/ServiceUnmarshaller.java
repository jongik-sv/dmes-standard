package com.dongkuk.oasis.unmarshal;

import com.dongkuk.oasis.model.Service;

/**
 * {@link Service} 객체로 전환을 표현한 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2017-03-31.
 */
public interface ServiceUnmarshaller {
    /**
     * {@link String} 으로 들어온 서비스 문서를 {@link Service} 객체로 변환.
     *
     * @param documentString 서비스 문자열
     * @param serviceId      서비스 식별자
     * @param serviceName    서비스 이름
     * @return {@link Service}
     */
    Service unmarshal(String documentString, String serviceId, String serviceName);
}
