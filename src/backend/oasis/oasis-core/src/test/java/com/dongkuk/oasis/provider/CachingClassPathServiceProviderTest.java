package com.dongkuk.oasis.provider;

import com.dongkuk.oasis.cache.CacheService;
import com.dongkuk.oasis.cache.SizeBaseCacheService;
import com.dongkuk.oasis.model.Service;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-09-15
 */
class CachingClassPathServiceProviderTest {
    @Test
    void getFromCache() {
        Service aaaService = mock(Service.class);
        Service bbbService = mock(Service.class);
        Service cccService = mock(Service.class);
        ServiceProvider serviceProvider = mock(ServiceProvider.class);
        given(serviceProvider.service("aaa")).willReturn(aaaService);
        given(serviceProvider.service("bbb")).willReturn(bbbService);

        CacheService<String, Service> cacheService = new SizeBaseCacheService<>();
        cacheService.cache("ccc", cccService);

        CachingServiceProvider pathServiceProvider = new CachingServiceProvider(
                serviceProvider, cacheService
        );

        Service ccc = pathServiceProvider.service("ccc");

        assertThat(ccc).isNotNull();
    }

    @Test
    void getFromProvider() {
        Service aaaService = mock(Service.class);
        Service bbbService = mock(Service.class);
        Service cccService = mock(Service.class);
        ServiceProvider serviceProvider = mock(ServiceProvider.class);
        given(serviceProvider.service("aaa")).willReturn(aaaService);
        given(serviceProvider.service("bbb")).willReturn(bbbService);

        CacheService<String, Service> cacheService = new SizeBaseCacheService<>();
        cacheService.cache("ccc", cccService);

        CachingServiceProvider pathServiceProvider = new CachingServiceProvider(
                serviceProvider, cacheService
        );

        Service bbb = pathServiceProvider.service("bbb");

        assertThat(bbb).isNotNull();
    }
}