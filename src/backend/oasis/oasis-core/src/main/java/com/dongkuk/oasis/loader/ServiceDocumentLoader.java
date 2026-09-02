package com.dongkuk.oasis.loader;

/**
 * 요청한 식별자를 가진 서비스 정의 문서를 로드.
 *
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public interface ServiceDocumentLoader {
    /**
     * @param serviceId 서비스 식별자
     * @return 서비스 정의 문서
     */
    String serviceDocument(String serviceId);
}
