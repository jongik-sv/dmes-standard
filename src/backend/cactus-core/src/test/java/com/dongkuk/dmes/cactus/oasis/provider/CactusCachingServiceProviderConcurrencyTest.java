package com.dongkuk.dmes.cactus.oasis.provider;

import static com.dongkuk.dmes.cactus.oasis.provider.FakeServices.txOf;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.oasis.provider.FakeServices.CountingProvider;
import com.dongkuk.oasis.model.PropertyNames;
import com.dongkuk.oasis.model.Service;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.RepeatedTest;

/**
 * {@link CactusCachingServiceProvider} + {@link CactusConcurrentCacheService} 동시성 테스트(리팩토링 항목 2 3단계).
 *
 * <p>로드 횟수 규칙: 같은 키를 동시에 처음 조회하면 로드는 정확히 1번, 모든 스레드가 같은 인스턴스를 받는다.
 * 로드가 진행 중일 때 다른 키는 막히지 않는다. 실패는 묶지 않는다. 모든 기다림에 시간 제한을 두어
 * 버그가 있으면 멈추지 않고 실패한다.
 */
class CactusCachingServiceProviderConcurrencyTest {

    private static final int THREADS = 8;
    private static final long WAIT_SEC = 10;

    @RepeatedTest(20)
    void 같은_키를_동시에_처음_조회하면_정확히_1번_로드하고_모두_같은_인스턴스를_받는다() throws Exception {
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CountingProvider delegate = new CountingProvider() {
            @Override
            void beforeReturn(String serviceId) {
                loading.countDown();
                await(release);
            }
        };
        CactusCachingServiceProvider provider =
                new CactusCachingServiceProvider(new DefaultTxInjectingServiceProvider(delegate, "mainTx"), 100);

        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        try {
            CountDownLatch ready = new CountDownLatch(THREADS);
            List<Future<Service>> futures = submitAll(pool, ready, () -> provider.service("a"));
            assertThat(ready.await(WAIT_SEC, TimeUnit.SECONDS)).isTrue();
            assertThat(loading.await(WAIT_SEC, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(50);   // 나머지 스레드가 진행 중 로드에 붙을 틈 — 늦게 와도 캐시 적중이라 단언은 같다
            release.countDown();

            Service first = futures.get(0).get(WAIT_SEC, TimeUnit.SECONDS);
            for (Future<Service> f : futures) {
                assertThat(f.get(WAIT_SEC, TimeUnit.SECONDS)).isSameAs(first);
            }
            assertThat(delegate.count("a")).isEqualTo(1);
            assertThat(first.getInitialProcess().properties().exportProperties())
                    .containsEntry(PropertyNames.TRANSACTION_MANAGER_NAME, "mainTx")
                    .hasSize(1);
            assertThat(provider.service("a")).isSameAs(first);
            assertThat(delegate.count("a")).isEqualTo(1);
        } finally {
            shutdown(pool);
        }
    }

    @RepeatedTest(10)
    void 한_키의_로드가_오래_걸려도_다른_키는_기다리지_않고_로드된다() throws Exception {
        CountDownLatch slowLoading = new CountDownLatch(1);
        CountDownLatch releaseSlow = new CountDownLatch(1);
        CountingProvider delegate = new CountingProvider() {
            @Override
            void beforeReturn(String serviceId) {
                if (serviceId.equals("slow")) {
                    slowLoading.countDown();
                    await(releaseSlow);
                }
            }
        };
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(delegate, 100);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<Service> slow = pool.submit(() -> provider.service("slow"));
            assertThat(slowLoading.await(WAIT_SEC, TimeUnit.SECONDS)).isTrue();

            for (int i = 0; i < 20; i++) {
                String key = "fast" + i;
                Service fast = pool.submit(() -> provider.service(key)).get(WAIT_SEC, TimeUnit.SECONDS);
                assertThat(fast.getServiceId()).isEqualTo(key);
            }
            assertThat(slow.isDone()).isFalse();

            releaseSlow.countDown();
            assertThat(slow.get(WAIT_SEC, TimeUnit.SECONDS).getServiceId()).isEqualTo("slow");
            assertThat(delegate.total()).isEqualTo(21);
        } finally {
            releaseSlow.countDown();
            shutdown(pool);
        }
    }

    @RepeatedTest(10)
    void 로드가_실패하면_기다리던_스레드도_같은_타입_예외를_받고_실패는_캐시되지_않는다() throws Exception {
        CountDownLatch loading = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        AtomicInteger failUntil = new AtomicInteger(Integer.MAX_VALUE);
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(id -> {
            int n = calls.incrementAndGet();
            if (n == 1) {
                loading.countDown();
                await(release);
            }
            if (n <= failUntil.get()) {
                throw new IllegalArgumentException("BPMN 없음: " + id);
            }
            return FakeServices.newService(id);
        }, 100);

        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        try {
            CountDownLatch ready = new CountDownLatch(THREADS);
            List<Future<Service>> futures = submitAll(pool, ready, () -> provider.service("a"));
            assertThat(ready.await(WAIT_SEC, TimeUnit.SECONDS)).isTrue();
            assertThat(loading.await(WAIT_SEC, TimeUnit.SECONDS)).isTrue();
            Thread.sleep(50);
            release.countDown();

            for (Future<Service> f : futures) {
                try {
                    f.get(WAIT_SEC, TimeUnit.SECONDS);
                    throw new AssertionError("예외가 나야 한다");
                } catch (ExecutionException e) {
                    assertThat(e.getCause())
                            .isExactlyInstanceOf(IllegalArgumentException.class)
                            .hasMessage("BPMN 없음: a");
                }
            }
            int failedCalls = calls.get();
            assertThat(failedCalls).isBetween(1, THREADS);

            // 실패는 캐시되지 않는다 — 원인이 풀리면 다음 호출이 로드해 캐시한다
            failUntil.set(failedCalls);
            Service svc = provider.service("a");
            assertThat(svc.getServiceId()).isEqualTo("a");
            assertThat(provider.service("a")).isSameAs(svc);
            assertThat(calls.get()).isEqualTo(failedCalls + 1);
        } finally {
            release.countDown();
            shutdown(pool);
        }
    }

    @RepeatedTest(10)
    void 같은_키와_다른_키를_동시에_조회하고_비워도_예외가_없고_값이_일관되며_로드_횟수는_비운_횟수_더하기_1_이하다()
            throws Exception {
        int keys = 6;
        int rounds = 300;
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider =
                new CactusCachingServiceProvider(new DefaultTxInjectingServiceProvider(delegate, "mainTx"), 100);
        AtomicInteger evicts = new AtomicInteger();

        ExecutorService pool = Executors.newFixedThreadPool(THREADS + 1);
        try {
            CountDownLatch ready = new CountDownLatch(THREADS);
            List<Future<Service>> readers = submitAll(pool, ready, () -> {
                Service last = null;
                for (int i = 0; i < rounds; i++) {
                    String key = "svc" + (i % keys);
                    Service svc = provider.service(key);
                    assertThat(svc.getServiceId()).isEqualTo(key);
                    assertThat(txOf(svc)).isEqualTo("mainTx");
                    assertThat(svc.getInitialProcess().properties().exportProperties()).hasSize(1);
                    last = svc;
                }
                return last;
            });
            Future<?> evictor = pool.submit(() -> {
                for (int i = 0; i < 20; i++) {
                    provider.evictAll();
                    evicts.incrementAndGet();
                    Thread.yield();
                }
            });
            assertThat(ready.await(WAIT_SEC, TimeUnit.SECONDS)).isTrue();
            evictor.get(WAIT_SEC * 3, TimeUnit.SECONDS);
            for (Future<Service> f : readers) {
                assertThat(f.get(WAIT_SEC * 3, TimeUnit.SECONDS)).isNotNull();
            }
        } finally {
            shutdown(pool);
        }

        for (int k = 0; k < keys; k++) {
            assertThat(delegate.count("svc" + k)).isBetween(1, evicts.get() + 1);
        }
    }

    @RepeatedTest(10)
    void 여러_스레드가_상한보다_많은_키를_동시에_넣어도_캐시는_상한을_넘지_않는다() throws Exception {
        CactusConcurrentCacheService<String, Service> cache = new CactusConcurrentCacheService<>(10);
        CactusCachingServiceProvider provider = new CactusCachingServiceProvider(new CountingProvider(), cache);

        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        try {
            CountDownLatch ready = new CountDownLatch(THREADS);
            List<Future<Integer>> futures = new ArrayList<>();
            for (int t = 0; t < THREADS; t++) {
                int seed = t;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    ready.await(WAIT_SEC, TimeUnit.SECONDS);
                    int maxSeen = 0;
                    for (int i = 0; i < 500; i++) {
                        String key = "svc" + ((i * 13 + seed) % 40);
                        assertThat(provider.service(key).getServiceId()).isEqualTo(key);
                        maxSeen = Math.max(maxSeen, cache.size());
                    }
                    return maxSeen;
                }));
            }
            for (Future<Integer> f : futures) {
                assertThat(f.get(WAIT_SEC * 3, TimeUnit.SECONDS)).isLessThanOrEqualTo(10);
            }
        } finally {
            shutdown(pool);
        }
        assertThat(cache.size()).isLessThanOrEqualTo(10);
    }

    private static <T> List<Future<T>> submitAll(ExecutorService pool, CountDownLatch ready, Callable<T> body) {
        List<Future<T>> futures = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            futures.add(pool.submit(() -> {
                ready.countDown();
                ready.await(WAIT_SEC, TimeUnit.SECONDS);
                return body.call();
            }));
        }
        return futures;
    }

    private static void await(CountDownLatch latch) {
        try {
            if (!latch.await(WAIT_SEC, TimeUnit.SECONDS)) {
                throw new IllegalStateException("latch 시간 초과");
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(e);
        }
    }

    private static void shutdown(ExecutorService pool) throws InterruptedException {
        pool.shutdownNow();
        assertThat(pool.awaitTermination(WAIT_SEC, TimeUnit.SECONDS)).isTrue();
    }
}
