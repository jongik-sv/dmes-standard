package com.dongkuk.dmes.cactus.oasis.provider;

import com.dongkuk.oasis.cache.CacheService;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;

/**
 * BPMN 파싱 결과를 명시적으로 캐시 (1.0.21-SNAPSHOT 신규).
 *
 * <p>oasis-core 5.1.0 의 {@code CachingServiceProvider} 는 {@code cache.cache()} 호출 누락으로 사실상
 * 미동작 (R-multi-22). 본 wrapper 가 명시적으로 {@code cache.cache(serviceId, result)} 호출하여 정상 캐시.
 *
 * <p>캐시 구현: 편의 생성자는 {@link CactusConcurrentCacheService}(읽기에 락 없음, 넣은 순서로 상한 유지)를 쓴다.
 * oasis-core-api {@code SizeBaseCacheService} 는 적중 때도 전역 락 아래 O(n) 작업을 하고 상한이 사실상 지켜지지 않아
 * 더 쓰지 않는다(리팩토링 항목 2). 생성자로 다른 {@link CacheService} 를 넣을 수도 있으며, 그 구현은 스레드 안전해야 한다.
 *
 * <p>로드 횟수 규칙(같은 키 동시 미스): 한 번만 로드한다. 처음 미스 난 스레드가 로드하고, 그 사이 같은 키로 들어온
 * 스레드는 진행 중 로드({@code inFlight})의 결과를 기다려 같은 인스턴스를 받는다. 다른 키의 로드는 서로 막지 않는다
 * ({@code computeIfAbsent} 는 BPMN 파싱 동안 맵 칸 락을 쥐어 같은 칸의 다른 키까지 세우므로 쓰지 않는다).
 * 예외:
 * <ul>
 *   <li>로드가 실패하면 실패는 묶지 않는다 — 기다리던 스레드는 각자 다시 로드해 자기 예외를 받는다(교체 전과 같은 예외 타입,
 *       예외 인스턴스를 스레드끼리 나눠 쓰지 않음). 실패는 캐시되지 않아 다음 호출이 다시 로드한다.</li>
 *   <li>기다리던 스레드가 인터럽트되면 인터럽트 표시를 되살리고 직접 로드한다.</li>
 *   <li>로드 도중 {@link #evictAll()} 이 끼면 그 로드 결과가 비운 뒤의 캐시에 들어갈 수 있다(교체 전과 같음).</li>
 * </ul>
 * 두 번 로드가 나더라도 정합성에는 영향이 없다 — 로드마다 BPMN 을 새로 파싱한 새 인스턴스이고,
 * {@link DefaultTxInjectingServiceProvider} 의 tx 주입도 그 새 인스턴스에만 일어난다(R-multi-21). 한 번 로드는 파싱 비용을 줄이는 목적이다.
 */
public class CactusCachingServiceProvider implements ServiceProvider {

    private final ServiceProvider delegate;
    private final CacheService<String, Service> cache;
    /** 진행 중인 키별 로드. 로드한 스레드가 캐시에 넣은 뒤 완료하고 지운다. */
    private final ConcurrentHashMap<String, CompletableFuture<Service>> inFlight = new ConcurrentHashMap<>();

    public CactusCachingServiceProvider(ServiceProvider delegate, CacheService<String, Service> cache) {
        if (delegate == null) throw new NullPointerException("delegate null");
        if (cache == null) throw new NullPointerException("cache null");
        this.delegate = delegate;
        this.cache = cache;
    }

    /** 편의 ctor — {@link CactusConcurrentCacheService}(상한 {@code cacheSize}, 1 이상) 사용. */
    public CactusCachingServiceProvider(ServiceProvider delegate, int cacheSize) {
        this(delegate, new CactusConcurrentCacheService<>(cacheSize));
    }

    @Override
    public Service service(String serviceId) {
        Service cached = cache.getObject(serviceId);
        if (cached != null) return cached;
        if (serviceId == null) return loadAndCache(null);   // ConcurrentHashMap 은 null 키를 받지 않는다

        CompletableFuture<Service> mine = new CompletableFuture<>();
        CompletableFuture<Service> running = inFlight.putIfAbsent(serviceId, mine);
        if (running != null) return awaitOrLoad(running, serviceId);

        try {
            // putIfAbsent 를 이긴 사이 앞선 로드가 캐시에 넣고 inFlight 를 지웠을 수 있다 — 다시 확인.
            Service svc = cache.getObject(serviceId);
            if (svc == null) {
                svc = loadAndCache(serviceId);
            }
            mine.complete(svc);   // 캐시에 넣은 뒤 완료 → 지운 뒤 들어온 스레드는 캐시에서 찾는다
            return svc;
        } catch (Throwable t) {
            mine.completeExceptionally(t);
            throw t;
        } finally {
            inFlight.remove(serviceId, mine);
        }
    }

    private Service awaitOrLoad(CompletableFuture<Service> running, String serviceId) {
        try {
            return running.get();
        } catch (ExecutionException e) {
            // 앞선 로드 실패 — 실패는 묶지 않고 이 스레드가 다시 로드한다.
            return loadAndCache(serviceId);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return loadAndCache(serviceId);
        }
    }

    private Service loadAndCache(String serviceId) {
        Service svc = delegate.service(serviceId);
        if (serviceId != null) cache.cache(serviceId, svc);
        return svc;
    }

    /** 디버그 / 운영 도구용 — 캐시 비우기. */
    public void evictAll() {
        cache.evict();
    }
}
