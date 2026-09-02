package com.dongkuk.oasis.provider;

import com.dongkuk.oasis.cache.CacheService;
import com.dongkuk.oasis.model.Service;

/**
 * {@link Service} 를 반환하는 서비스 프로바이더이다.
 */
public class CachingServiceProvider implements ServiceProvider {
    private final ServiceProvider serviceProvider;
    private final CacheService<String, Service> cacheService;

    /**
     * @param serviceProvider 서비스 프로바이더
     * @param cacheService    캐시 서비스
     */
    public CachingServiceProvider(ServiceProvider serviceProvider
            , CacheService<String, Service> cacheService) {
        this.serviceProvider = serviceProvider;
        this.cacheService = cacheService;
    }

    @Override
    public Service service(String serviceId) {
        Service service = cacheService.getObject(serviceId);

        if (service != null)
            return service;

        return serviceProvider.service(serviceId);
    }
}
