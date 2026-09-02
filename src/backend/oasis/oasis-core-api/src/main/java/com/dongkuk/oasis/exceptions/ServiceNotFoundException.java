package com.dongkuk.oasis.exceptions;

/**
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public final class ServiceNotFoundException extends RuntimeException {
    private static final long serialVersionUID = -939835341831046784L;

    /**
     * @param serviceId 서비스 식별자
     * @param e         예외
     */
    public ServiceNotFoundException(String serviceId, Throwable e) {
        super("Can not find the service called '" + serviceId + "'.", e);
    }

    /**
     * @param serviceId 서비스 식별자
     */
    public ServiceNotFoundException(String serviceId) {
        super("Can not find the service called '" + serviceId + "'.");
    }

}
