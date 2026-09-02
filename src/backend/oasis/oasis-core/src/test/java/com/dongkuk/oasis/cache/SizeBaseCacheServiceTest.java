package com.dongkuk.oasis.cache;

import com.dongkuk.oasis.model.Service;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;

/**
 * @author Jeongjin Kim
 * @since 2021-09-15
 */
class SizeBaseCacheServiceTest {
    @Test
    void requestCachedObjectThenReturnObject() {
        Service service = mock(Service.class);
        SizeBaseCacheService<String, Service> sizeBaseCacheService = new SizeBaseCacheService<>(1);
        sizeBaseCacheService.cache("a", service);

        Service a = sizeBaseCacheService.getObject("a");
        Assertions.assertThat(a).isNotNull();
    }

    @Test
    void oldestObjectEvicted() {
        Service service = mock(Service.class);
        SizeBaseCacheService<String, Service> sizeBaseCacheService = new SizeBaseCacheService<>(1);
        sizeBaseCacheService.cache("a", service);
        sizeBaseCacheService.cache("b", service);

        Service b = sizeBaseCacheService.getObject("b");
        Assertions.assertThat(b).isNotNull();

        Service a = sizeBaseCacheService.getObject("a");
        Assertions.assertThat(a).isNull();
    }

    @Test
    void givenRequestNoCachedObjectThenReturnNull() {
        SizeBaseCacheService<String, Service> sizeBaseCacheService = new SizeBaseCacheService<>(1);

        Service a = sizeBaseCacheService.getObject("a");
        Assertions.assertThat(a).isNull();
    }
}