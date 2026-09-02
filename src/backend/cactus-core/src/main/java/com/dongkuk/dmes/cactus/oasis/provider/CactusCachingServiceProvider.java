package com.dongkuk.dmes.cactus.oasis.provider;

import com.dongkuk.oasis.cache.CacheService;
import com.dongkuk.oasis.cache.SizeBaseCacheService;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;

/**
 * BPMN 파싱 결과를 명시적으로 캐시 (1.0.21-SNAPSHOT 신규).
 *
 * <p>oasis-core 5.1.0 의 {@code CachingServiceProvider} 는 {@code cache.cache()} 호출 누락으로 사실상
 * 미동작 (R-multi-22). 본 wrapper 가 명시적으로 {@code cache.cache(serviceId, result)} 호출하여 정상 캐시.
 *
 * <p>Thread-safety: {@link SizeBaseCacheService} 가 자체 lock 보유. 본 wrapper 는 추가 동기화 불필요.
 *
 * <p>Cache miss race: 두 thread 가 동시 miss → 둘 다 underlying 호출 → 각자 cache.cache() — 마지막 put 이 승.
 * 두 호출이 같은 결과 (BPMN 동일) 라 정합성 영향 없음.
 */
public class CactusCachingServiceProvider implements ServiceProvider {

    private final ServiceProvider delegate;
    private final CacheService<String, Service> cache;

    public CactusCachingServiceProvider(ServiceProvider delegate, CacheService<String, Service> cache) {
        if (delegate == null) throw new NullPointerException("delegate null");
        if (cache == null) throw new NullPointerException("cache null");
        this.delegate = delegate;
        this.cache = cache;
    }

    /** 편의 ctor — default {@link SizeBaseCacheService} 사용 (size 인자는 oasis-core 가 처리). */
    public CactusCachingServiceProvider(ServiceProvider delegate, int cacheSize) {
        this(delegate, new SizeBaseCacheService<>(cacheSize));
    }

    @Override
    public Service service(String serviceId) {
        Service cached = cache.getObject(serviceId);
        if (cached != null) return cached;

        Service svc = delegate.service(serviceId);
        cache.cache(serviceId, svc);
        return svc;
    }

    /** 디버그 / 운영 도구용 — 캐시 비우기. */
    public void evictAll() {
        cache.evict();
    }
}
