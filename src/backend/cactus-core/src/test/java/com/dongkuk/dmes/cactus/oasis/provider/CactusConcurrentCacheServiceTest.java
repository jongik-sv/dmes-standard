package com.dongkuk.dmes.cactus.oasis.provider;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;

/** {@link CactusConcurrentCacheService} — 넣은 순서(FIFO) 상한, evict, null 처리, 동시 쓰기 상한. */
class CactusConcurrentCacheServiceTest {

    @Test
    void 넣은_값을_그대로_주고_없는_키는_null() {
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(10);

        cache.cache("a", "A");

        assertThat(cache.getObject("a")).isEqualTo("A");
        assertThat(cache.getObject("b")).isNull();
        assertThat(cache.getObject(null)).isNull();
        assertThat(cache.size()).isEqualTo(1);
    }

    @Test
    void 상한을_넘으면_가장_먼저_넣은_키부터_내보내고_적중은_순서를_바꾸지_않는다() {
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(3);
        cache.cache("a", "A");
        cache.cache("b", "B");
        cache.cache("c", "C");
        cache.getObject("a");   // 적중해도 a 는 여전히 가장 오래된 키

        cache.cache("d", "D");

        assertThat(cache.getObject("a")).isNull();
        assertThat(cache.getObject("b")).isEqualTo("B");
        assertThat(cache.getObject("c")).isEqualTo("C");
        assertThat(cache.getObject("d")).isEqualTo("D");
        assertThat(cache.size()).isEqualTo(3);

        cache.cache("e", "E");
        assertThat(cache.getObject("b")).isNull();
        assertThat(cache.size()).isEqualTo(3);
    }

    @Test
    void 이미_있는_키를_다시_넣으면_값만_바뀌고_순서와_개수는_그대로다() {
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(2);
        cache.cache("a", "A1");
        cache.cache("b", "B");
        cache.cache("a", "A2");

        assertThat(cache.getObject("a")).isEqualTo("A2");
        assertThat(cache.size()).isEqualTo(2);

        cache.cache("c", "C");   // a 가 가장 먼저 들어간 키
        assertThat(cache.getObject("a")).isNull();
        assertThat(cache.getObject("b")).isEqualTo("B");
        assertThat(cache.getObject("c")).isEqualTo("C");
    }

    @Test
    void 상한_1이면_마지막_키_하나만_남는다() {
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(1);
        for (int i = 0; i < 10; i++) {
            cache.cache("k" + i, "v" + i);
        }
        assertThat(cache.size()).isEqualTo(1);
        assertThat(cache.getObject("k9")).isEqualTo("v9");
    }

    @Test
    void evict_는_모두_비우고_그_뒤에도_상한이_처음부터_다시_적용된다() {
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(2);
        cache.cache("a", "A");
        cache.cache("b", "B");

        cache.evict();

        assertThat(cache.size()).isZero();
        assertThat(cache.getObject("a")).isNull();
        cache.cache("c", "C");
        cache.cache("d", "D");
        assertThat(cache.getObject("c")).isEqualTo("C");
        assertThat(cache.getObject("d")).isEqualTo("D");
        assertThat(cache.size()).isEqualTo(2);
    }

    @Test
    void null_값을_넣으면_그_키를_지워_다음_조회가_미스가_된다() {
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(2);
        cache.cache("a", "A");
        cache.cache("a", null);
        cache.cache("x", null);   // 없는 키에 null — 아무 일 없음

        assertThat(cache.getObject("a")).isNull();
        assertThat(cache.size()).isZero();
        // 지운 키가 순서 큐에 남아 다른 키를 잘못 내보내지 않는다
        cache.cache("b", "B");
        cache.cache("c", "C");
        assertThat(cache.getObject("b")).isEqualTo("B");
        assertThat(cache.getObject("c")).isEqualTo("C");
    }

    @Test
    void null_키로_넣기와_1보다_작은_상한은_거절한다() {
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(2);
        assertThatThrownBy(() -> cache.cache(null, "A")).isInstanceOf(NullPointerException.class);
        assertThatThrownBy(() -> new CactusConcurrentCacheService<String, String>(0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CactusConcurrentCacheService<String, String>(-1))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @RepeatedTest(20)
    void 여러_스레드가_동시에_넣고_읽고_비워도_상한을_넘지_않고_읽은_값은_늘_자기_키의_값이다() throws Exception {
        int threads = 8;
        int maxSize = 16;
        CactusConcurrentCacheService<String, String> cache = new CactusConcurrentCacheService<>(maxSize);
        CountDownLatch ready = new CountDownLatch(threads);
        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (int t = 0; t < threads; t++) {
                int seed = t;
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(5, TimeUnit.SECONDS);
                    int maxSeen = 0;
                    for (int i = 0; i < 2_000; i++) {
                        String key = "k" + ((i * 7 + seed) % 64);
                        String v = cache.getObject(key);
                        if (v != null) {
                            assertThat(v).isEqualTo("v-" + key);
                        }
                        cache.cache(key, "v-" + key);
                        if (seed == 0 && i % 500 == 0) {
                            cache.evict();
                        }
                        maxSeen = Math.max(maxSeen, cache.size());
                    }
                    return maxSeen;
                }));
            }
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            go.countDown();
            for (Future<Integer> f : futures) {
                assertThat(f.get(30, TimeUnit.SECONDS)).isLessThanOrEqualTo(maxSize);
            }
        } finally {
            pool.shutdownNow();
            assertThat(pool.awaitTermination(10, TimeUnit.SECONDS)).isTrue();
        }
        assertThat(cache.size()).isLessThanOrEqualTo(maxSize);
    }
}
