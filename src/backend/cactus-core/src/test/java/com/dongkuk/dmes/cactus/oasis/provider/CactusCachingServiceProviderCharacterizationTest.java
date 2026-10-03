package com.dongkuk.dmes.cactus.oasis.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.oasis.provider.FakeServices.CountingProvider;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

/**
 * {@link CactusCachingServiceProvider} 특성 테스트 — 캐시 구현을 바꾸기 전 동작을 고정한다(리팩토링 항목 5a).
 *
 * <p>모두 편의 생성자 {@code (delegate, int cacheSize)} 로 만든다. 편의 생성자가 어떤 캐시 구현을 쓰든
 * 이 파일의 단언은 그대로 통과해야 한다(교체 전 {@code SizeBaseCacheService}, 교체 뒤 cactus 자체 구현).
 */
class CactusCachingServiceProviderCharacterizationTest {

    @Test
    void 첫_호출은_delegate_를_부르고_같은_키_두번째부터는_캐시에서_같은_인스턴스를_준다() {
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(delegate, 100);

        Service first = provider.service("a");
        Service second = provider.service("a");
        Service third = provider.service("a");

        assertThat(delegate.count("a")).isEqualTo(1);
        assertThat(second).isSameAs(first);
        assertThat(third).isSameAs(first);
        assertThat(first.getServiceId()).isEqualTo("a");
    }

    @Test
    void 키마다_따로_로드하고_따로_캐시한다() {
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(delegate, 100);

        Service a = provider.service("a");
        Service b = provider.service("b");

        assertThat(a).isNotSameAs(b);
        assertThat(provider.service("a")).isSameAs(a);
        assertThat(provider.service("b")).isSameAs(b);
        assertThat(delegate.count("a")).isEqualTo(1);
        assertThat(delegate.count("b")).isEqualTo(1);
        assertThat(delegate.total()).isEqualTo(2);
    }

    @Test
    void evictAll_뒤에는_다시_로드해서_새_인스턴스를_준다() {
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(delegate, 100);

        Service before = provider.service("a");
        provider.service("b");
        provider.evictAll();
        Service after = provider.service("a");

        assertThat(after).isNotSameAs(before);
        assertThat(delegate.count("a")).isEqualTo(2);
        assertThat(provider.service("a")).isSameAs(after);
        assertThat(delegate.count("a")).isEqualTo(2);
        // b 도 비워졌다
        provider.service("b");
        assertThat(delegate.count("b")).isEqualTo(2);
    }

    @Test
    void delegate_예외는_원래_타입_그대로_나가고_캐시되지_않아_다음_호출이_다시_로드한다() {
        AtomicInteger calls = new AtomicInteger();
        ServiceProvider failingOnce = id -> {
            if (calls.incrementAndGet() == 1) {
                throw new IllegalArgumentException("BPMN 없음: " + id);
            }
            return FakeServices.newService(id);
        };
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(failingOnce, 100);

        assertThatThrownBy(() -> provider.service("a"))
                .isExactlyInstanceOf(IllegalArgumentException.class)
                .hasMessage("BPMN 없음: a");

        Service svc = provider.service("a");
        assertThat(svc.getServiceId()).isEqualTo("a");
        assertThat(calls.get()).isEqualTo(2);
        assertThat(provider.service("a")).isSameAs(svc);
        assertThat(calls.get()).isEqualTo(2);
    }

    @Test
    void delegate_가_null_을_주면_null_을_그대로_주고_캐시되지_않아_매번_다시_부른다() {
        AtomicInteger calls = new AtomicInteger();
        ServiceProvider nullProvider = id -> {
            calls.incrementAndGet();
            return null;
        };
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(nullProvider, 100);

        assertThat(provider.service("a")).isNull();
        assertThat(provider.service("a")).isNull();
        assertThat(calls.get()).isEqualTo(2);
    }

    @Test
    void 생성자는_null_delegate_와_null_cache_를_거절한다() {
        assertThatThrownBy(() -> new CactusCachingServiceProvider(null, 100))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("delegate null");
        assertThatThrownBy(() -> new CactusCachingServiceProvider(new CountingProvider(), null))
                .isInstanceOf(NullPointerException.class)
                .hasMessage("cache null");
    }

    @Test
    void 상한_안쪽의_키_개수는_모두_캐시에_남는다() {
        // 운영 기준(mcm BPMN 35개, mdm 52개, 상한 100)에 해당하는 범위 — 두 번째 순회는 전부 적중해야 한다.
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(delegate, 100);

        List<Service> firstPass = new ArrayList<>();
        for (int i = 0; i < 52; i++) {
            firstPass.add(provider.service("svc" + i));
        }
        for (int i = 0; i < 52; i++) {
            assertThat(provider.service("svc" + i)).isSameAs(firstPass.get(i));
        }
        assertThat(delegate.total()).isEqualTo(52);
    }

    @Test
    void 같은_키를_동시에_처음_조회하면_로드는_1번_이상_스레드수_이하이고_모두_같은_키의_서비스를_받는다() throws Exception {
        // 교체 전: 동시 미스면 각자 로드한다(마지막 put 이 이김). 교체 뒤: 1번만 로드한다.
        // 두 구현이 함께 지키는 범위만 고정하고, 정확히 1번은 교체 뒤 동시성 테스트가 확인한다.
        int threads = 8;
        CountingProvider delegate = new CountingProvider() {
            @Override
            void beforeReturn(String serviceId) {
                sleepQuietly(20);
            }
        };
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(delegate, 100);

        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Service>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(5, TimeUnit.SECONDS);
                    return provider.service("a");
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            for (Future<Service> f : futures) {
                assertThat(f.get(10, TimeUnit.SECONDS).getServiceId()).isEqualTo("a");
            }
        } finally {
            pool.shutdownNow();
            assertThat(pool.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }

        int loads = delegate.count("a");
        assertThat(loads).isBetween(1, threads);
        // 경합이 끝난 뒤에는 적중한다
        provider.service("a");
        assertThat(delegate.count("a")).isEqualTo(loads);
    }

    static void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
