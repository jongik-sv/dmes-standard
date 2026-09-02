package com.dongkuk.oasis.service;

/**
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
final class ServiceLoggerParam {
    private final String serviceId;
    private String requestTag;

    /**
     * @param serviceId 서비스 식별자
     */
    public ServiceLoggerParam(String serviceId) {
        this.serviceId = serviceId;
    }

    /**
     * @return 서비스 식별자
     */
    public String getServiceId() {
        return serviceId;
    }

    public String getRequestTag() {
        return requestTag;
    }

    public void setRequestTag(String requestTag) {
        this.requestTag = requestTag;
    }
}
