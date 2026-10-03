package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** spec §5.2·§5.4·§7 「cactus 캐시」 — 묶음 조회, 없음 캐시, 동시 적재 1회, 장애 시 유지·건너뛰기. */
class MdmMetaServiceTest {

    private MutableClock clock;
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        feed = new FakeMetaFeed().put(MdmTargetType.COLUMN, "A", "a").put(MdmTargetType.COLUMN, "B", "b");
        cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock);
    }

    @Test
    void 캐시에_없는_키만_묶어_한_번에_요청하고_없는_키는_없음으로_캐시한다() {
        MdmMetaService.MdmLookup first = service.lookup(MdmTargetType.COLUMN, List.of("A", "B", "X"));

        assertThat(first.found()).containsEntry("A", "a").containsEntry("B", "b");
        assertThat(first.missing()).containsExactly("X");
        assertThat(first.unavailable()).isEmpty();
        assertThat(feed.fetchedKeys).containsExactly(List.of("A", "B", "X"));

        MdmMetaService.MdmLookup second = service.lookup(MdmTargetType.COLUMN, List.of("A", "X"));
        assertThat(second.found()).containsOnlyKeys("A");
        assertThat(second.missing()).containsExactly("X");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    /** 하위 프로젝트 C §6.2-4 — 검증기의 평가 단계는 캐시만 읽는다. 캐시에 없으면 MDM 을 부르지 않고 빈 값이다. */
    @Test
    void cached_는_캐시만_읽고_MDM_을_부르지_않는다() {
        assertThat(service.cached(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(feed.fetchCalls.get()).isZero();

        service.lookup(MdmTargetType.COLUMN, List.of("A", "X"));

        assertThat(service.cached(MdmTargetType.COLUMN, "A")).hasValueSatisfying(e -> assertThat(e.value()).isEqualTo("a"));
        assertThat(service.cached(MdmTargetType.COLUMN, "X")).hasValueSatisfying(e -> assertThat(e.absent()).isTrue());
        assertThat(service.cached(MdmTargetType.COLUMN, "B")).isEmpty();
        assertThat(service.cached(MdmTargetType.COLUMN, null)).isEmpty();
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void 같은_키_동시_적재는_한_번만_한다() throws Exception {
        feed.fetchGate = new CountDownLatch(1);
        CompletableFuture<MdmMetaService.MdmLookup> t1 = CompletableFuture.supplyAsync(() -> service.lookup(MdmTargetType.COLUMN, List.of("A")));
        assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<MdmMetaService.MdmLookup> t2 = CompletableFuture.supplyAsync(() -> service.lookup(MdmTargetType.COLUMN, List.of("A")));
        Thread.sleep(200);
        feed.fetchGate.countDown();

        assertThat(t1.get(5, TimeUnit.SECONDS).found()).containsEntry("A", "a");
        assertThat(t2.get(5, TimeUnit.SECONDS).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void MDM_실패는_unavailable_이고_없음으로_캐시하지_않는다() {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).unavailable()).containsExactly("A");

        feed.fetchError = null;
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }

    @Test
    void 연속_두_번_실패하면_30초_동안_MDM_을_부르지_않는다() {
        feed.fetchError = new MdmUnavailableException("꺼짐");
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        assertThat(feed.fetchCalls.get()).isEqualTo(2);

        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).unavailable()).containsExactly("A");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
        assertThat(service.consecutiveFailures()).isEqualTo(2);

        clock.advance(Duration.ofSeconds(31));
        feed.fetchError = null;
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(3);
        assertThat(service.consecutiveFailures()).isZero();
    }

    @Test
    void 캐시에_있는_키는_MDM_이_죽어도_답한다() {
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void MDM_이_만들지_못한_키는_unavailable_이지만_장애로_세지_않는다() {
        feed.failedKeys.put("B", "저장값 손상");
        for (int i = 0; i < 3; i++) {
            assertThat(service.lookup(MdmTargetType.COLUMN, List.of("B")).unavailable()).containsExactly("B");
        }
        assertThat(feed.fetchCalls.get()).isEqualTo(3);
        assertThat(service.consecutiveFailures()).isZero();
    }

    @Test
    void MDM_업무_거부와_값_하나의_변환_실패는_장애로_세지_않아_건너뛰기가_걸리지_않는다() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MdmMetaService real = new MdmMetaService(new MdmMetaClient(builder.build(), "http://mdm.test", "mls"), cache, clock);
        String rejected = "{\"meta\":{\"success\":false,\"code\":\"S001\",\"message\":\"키는 한 번에 500개까지 받습니다\"}}";
        String oneBad = "{\"meta\":{\"success\":true},\"data\":{\"result\":{\"items\":[{\"key\":\"L1\",\"value\":\"문자열\"},"
                + "{\"key\":\"L2\",\"value\":[]}],\"failed\":[]}}}";
        server.expect(ExpectedCount.twice(), requestTo("http://mdm.test/oasis/metaFeed/view"))
                .andRespond(withSuccess(rejected, MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view")).andRespond(withSuccess(oneBad, MediaType.APPLICATION_JSON));

        assertThat(real.lookup(MdmTargetType.LAYOUT, List.of("L1")).unavailable()).containsExactly("L1");
        assertThat(real.lookup(MdmTargetType.LAYOUT, List.of("L1")).unavailable()).containsExactly("L1");
        assertThat(real.consecutiveFailures()).as("업무 거부는 장애가 아니다").isZero();

        // 두 번 거부된 뒤에도 30초 건너뛰기 없이 바로 MDM 을 부른다. 값 하나가 깨져도 나머지는 받는다.
        MdmMetaService.MdmLookup r = real.lookup(MdmTargetType.LAYOUT, List.of("L1", "L2"));
        assertThat(r.unavailable()).containsExactly("L1");
        assertThat(r.found()).containsOnlyKeys("L2");
        assertThat(real.consecutiveFailures()).isZero();
        server.verify();
    }

    @Test
    void one_은_받을_수_없으면_MdmUnavailableException_이고_없으면_빈_값이다() {
        assertThat(service.one(MdmTargetType.COLUMN, "X")).isEmpty();
        assertThat(service.one(MdmTargetType.COLUMN, "A")).contains("a");
        feed.fetchError = new MdmUnavailableException("꺼짐");
        assertThatThrownBy(() -> service.one(MdmTargetType.COLUMN, "B")).isInstanceOf(MdmUnavailableException.class);
    }

    @Test
    void reload_는_이_인스턴스_캐시를_지우고_다시_받는다() {
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.put(MdmTargetType.COLUMN, "A", "a2");

        assertThat(service.reload(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a2");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }

    // ---- Task 7 검토 수정 1차 ----

    @Test
    void reload_는_진행_중_적재에_합류하지_않고_그_적재의_옛_값은_캐시에_남지_않는다() throws Exception {
        CountDownLatch oldGate = new CountDownLatch(1);
        feed.fetchGate = oldGate;
        CompletableFuture<MdmMetaService.MdmLookup> old = CompletableFuture.supplyAsync(() -> service.lookup(MdmTargetType.COLUMN, List.of("A")));
        assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue(); // 옛 적재가 "a" 를 읽고 문 앞에서 기다린다
        feed.fetchGate = null;
        feed.put(MdmTargetType.COLUMN, "A", "a2");

        MdmMetaService.MdmLookup reloaded = service.reload(MdmTargetType.COLUMN, List.of("A"));
        assertThat(reloaded.found()).containsEntry("A", "a2");

        oldGate.countDown();
        assertThat(old.get(5, TimeUnit.SECONDS).found()).as("옛 적재의 값은 그 호출자에게만 간다").containsEntry("A", "a");
        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("a2");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a2");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }

    @Test
    void 상한을_넘는_묶음_조회는_캐시_정리를_한_번만_한다() {
        MdmMetaCache small = new MdmMetaCache(4, Duration.ofMinutes(60), clock);
        small.clear(0);
        MdmMetaService s = new MdmMetaService(feed, small, clock);
        for (int i = 0; i < 10; i++) {
            feed.put(MdmTargetType.DOMAIN, "D" + i, "d" + i);
        }

        MdmMetaService.MdmLookup r = s.lookup(MdmTargetType.DOMAIN, List.of("D0", "D1", "D2", "D3", "D4", "D5", "D6", "D7", "D8", "D9"));

        assertThat(r.found()).hasSize(10);
        assertThat(small.trimPasses()).isEqualTo(1);
        assertThat(small.sizes().get(MdmTargetType.DOMAIN)).isLessThanOrEqualTo(4);
    }

    @Test
    void 피드가_null_맵을_돌려줘도_던지지_않고_없음으로_답한다() {
        assertThat(new MdmFetchResult(null, null).found()).isEmpty();
        assertThat(new MdmFetchResult(null, null).failed()).isEmpty();
        MdmMetaFeed nulls = new MdmMetaFeed() {
            @Override
            public MdmChanges changes(long since, int limit) {
                throw new UnsupportedOperationException();
            }

            @Override
            public MdmFetchResult fetch(MdmTargetType type, java.util.Collection<String> keys) {
                return new MdmFetchResult(null, null);
            }
        };
        MdmMetaService s = new MdmMetaService(nulls, cache, clock);

        MdmMetaService.MdmLookup r = s.lookup(MdmTargetType.COLUMN, List.of("A"));

        assertThat(r.missing()).containsExactly("A");
        assertThat(r.unavailable()).isEmpty();
        assertThat(s.consecutiveFailures()).isZero();
    }

    /**
     * 실패 처리 도중(실패 수를 올린 뒤, 건너뛰기 기한을 정하기 전) 다른 요청의 성공이 끼어드는 순서를 시계로 고정한다. 실패 수와 기한을 따로 바꾸면
     * 성공 뒤에 기한만 남아 "실패 0 인데 30초 건너뛰기"가 된다.
     */
    @Test
    void 실패_처리_중에_성공이_끼어들어도_성공_뒤에_건너뛰기가_남지_않는다() throws Exception {
        ParkingClock pclock = new ParkingClock(clock);
        CountDownLatch failGate = new CountDownLatch(1);
        CountDownLatch failEntered = new CountDownLatch(1);
        java.util.concurrent.atomic.AtomicInteger calls = new java.util.concurrent.atomic.AtomicInteger();
        MdmMetaFeed scripted = new MdmMetaFeed() {
            @Override
            public MdmChanges changes(long since, int limit) {
                throw new UnsupportedOperationException();
            }

            @Override
            public MdmFetchResult fetch(MdmTargetType type, java.util.Collection<String> keys) {
                calls.incrementAndGet();
                if (keys.contains("F1")) {
                    failEntered.countDown();
                    try {
                        failGate.await(5, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }
                if (keys.stream().anyMatch(k -> k.startsWith("F"))) {
                    throw new MdmUnavailableException("꺼짐");
                }
                java.util.Map<String, Object> found = new java.util.LinkedHashMap<>();
                keys.forEach(k -> found.put(k, "v" + k));
                return new MdmFetchResult(found, java.util.Map.of());
            }
        };
        MdmMetaService s = new MdmMetaService(scripted, cache, pclock);

        s.lookup(MdmTargetType.COLUMN, List.of("F0")); // 실패 1
        assertThat(s.consecutiveFailures()).isEqualTo(1);

        Thread failing = new Thread(() -> s.lookup(MdmTargetType.COLUMN, List.of("F1")), "failing-load");
        failing.start();
        assertThat(failEntered.await(5, TimeUnit.SECONDS)).isTrue();
        pclock.parkNextCallOf(failing);
        failGate.countDown(); // 실패 2 를 처리하다 시계에서 멈춘다
        assertThat(pclock.parked.await(5, TimeUnit.SECONDS)).isTrue();

        assertThat(s.lookup(MdmTargetType.COLUMN, List.of("S")).found()).containsEntry("S", "vS"); // 그 사이 성공
        pclock.release.countDown();
        failing.join(5000);
        assertThat(failing.isAlive()).isFalse();

        int before = calls.get();
        assertThat(s.lookup(MdmTargetType.COLUMN, List.of("T")).found()).as("성공 뒤에는 건너뛰지 않는다").containsEntry("T", "vT");
        assertThat(calls.get()).isEqualTo(before + 1);
        assertThat(s.consecutiveFailures()).isZero();
    }

    /** 지정한 스레드가 다음에 시각을 물으면 한 번 멈춰 세운다. */
    private static final class ParkingClock extends java.time.Clock {
        private final java.time.Clock delegate;
        private volatile Thread target;
        final CountDownLatch parked = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);

        ParkingClock(java.time.Clock delegate) {
            this.delegate = delegate;
        }

        void parkNextCallOf(Thread t) {
            target = t;
        }

        @Override
        public java.time.ZoneId getZone() {
            return delegate.getZone();
        }

        @Override
        public java.time.Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            if (Thread.currentThread() == target) {
                target = null; // 한 번만
                parked.countDown();
                try {
                    release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            return delegate.instant();
        }
    }

    // ---- fu3: 폴러 RELOAD 전용 입구 ----

    @Test
    void refreshAfterEvict_값_경로는_evictLocal_없이_자리를_빼앗는다() throws Exception {
        CountDownLatch oldGate = new CountDownLatch(1);
        try {
            feed.fetchGate = oldGate;
            CompletableFuture<MdmMetaService.MdmLookup> old = CompletableFuture.supplyAsync(() -> service.lookup(MdmTargetType.COLUMN, List.of("A")));
            assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue(); // 옛 적재가 "a" 를 읽고 멈췄다
            feed.fetchGate = null;
            feed.put(MdmTargetType.COLUMN, "A", "a2");
            cache.evict(MdmTargetType.COLUMN, "A", 1); // 폴러 지움
            cache.markApplied(1);
            int tombstones = cache.tombstoneCount();

            CompletableFuture.runAsync(() -> service.refreshAfterEvict(MdmTargetType.COLUMN, List.of("A"), clock.instant()))
                    .get(3, TimeUnit.SECONDS); // 옛 적재를 기다리지 않는다

            assertThat(cache.tombstoneCount()).as("지움 기록을 더하지 않는다").isEqualTo(tombstones);
            assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("a2");
            assertThat(feed.fetchCalls.get()).isEqualTo(2);

            oldGate.countDown();
            assertThat(old.get(5, TimeUnit.SECONDS).found()).containsEntry("A", "a");
            assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).as("옛 적재 값은 캐시에 남지 않는다").isEqualTo("a2");
            assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a2");
            assertThat(feed.fetchCalls.get()).as("옛 적재가 새 자리를 지우지 않았다").isEqualTo(2);
        } finally {
            oldGate.countDown();
        }
    }
}
