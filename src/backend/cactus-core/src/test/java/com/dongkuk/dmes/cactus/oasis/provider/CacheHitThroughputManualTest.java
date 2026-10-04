package com.dongkuk.dmes.cactus.oasis.provider;

import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.dongkuk.dmes.cactus.oasis.provider.FakeServices.CountingProvider;
import com.dongkuk.oasis.cache.SizeBaseCacheService;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

/**
 * 캐시 적중 경로 처리량 비교(JMH 없는 간이 측정). 평소 테스트에서는 건너뛰고, 환경 변수
 * {@code CACTUS_CACHE_BENCH=1} 일 때만 돈다. 결과는 표준 출력으로만 남기며 단언하지 않는다(이 PC 는 편차가 크다).
 *
 * <p>운영과 비슷하게 키 52개(mdm BPMN 수)를 먼저 한 바퀴 로드한 뒤, 여러 스레드가 그 키들을 돌아가며 조회한다.
 */
class CacheHitThroughputManualTest {

    private static final int KEYS = 52;
    private static final long WARMUP_MS = 300;
    private static final long MEASURE_MS = 500;
    private static final int RUNS = 5;

    @Test
    void 적중_경로_처리량_비교() throws Exception {
        assumeTrue("1".equals(System.getenv("CACTUS_CACHE_BENCH")), "CACTUS_CACHE_BENCH=1 일 때만 측정");

        for (int threads : new int[]{1, 4, 8}) {
            List<Double> oldRates = new ArrayList<>();
            List<Double> newRates = new ArrayList<>();
            for (int run = 0; run < RUNS; run++) {
                oldRates.add(measure(threads, () -> new CactusCachingServiceProvider(
                        new CountingProvider(), new SizeBaseCacheService<>(100))));
                newRates.add(measure(threads, () -> new CactusCachingServiceProvider(new CountingProvider(), 100)));
            }
            System.out.printf("[cache-bench] threads=%d old(SizeBase) %s Mops/s | new(Concurrent) %s Mops/s%n",
                    threads, range(oldRates), range(newRates));
        }
    }

    private static double measure(int threads, Supplier<CactusCachingServiceProvider> factory) throws Exception {
        CactusCachingServiceProvider provider = factory.get();
        String[] keys = new String[KEYS];
        for (int i = 0; i < KEYS; i++) {
            keys[i] = "svc" + i;
            provider.service(keys[i]);
        }
        AtomicBoolean measuring = new AtomicBoolean(false);
        AtomicBoolean stop = new AtomicBoolean(false);
        LongAdder ops = new LongAdder();
        CountDownLatch done = new CountDownLatch(threads);
        for (int t = 0; t < threads; t++) {
            int seed = t;
            Thread th = new Thread(() -> {
                int i = seed;
                long local = 0;
                while (!stop.get()) {
                    provider.service(keys[i++ % KEYS]);
                    if (measuring.get()) {
                        local++;
                    }
                }
                ops.add(local);
                done.countDown();
            });
            th.setDaemon(true);
            th.start();
        }
        Thread.sleep(WARMUP_MS);
        measuring.set(true);
        long start = System.nanoTime();
        Thread.sleep(MEASURE_MS);
        measuring.set(false);
        long elapsed = System.nanoTime() - start;
        stop.set(true);
        done.await(10, TimeUnit.SECONDS);
        return ops.sum() / (elapsed / 1_000.0);   // ops per µs = Mops/s
    }

    private static String range(List<Double> rates) {
        double min = rates.stream().mapToDouble(Double::doubleValue).min().orElse(0);
        double max = rates.stream().mapToDouble(Double::doubleValue).max().orElse(0);
        return String.format("%.2f~%.2f", min, max);
    }
}
