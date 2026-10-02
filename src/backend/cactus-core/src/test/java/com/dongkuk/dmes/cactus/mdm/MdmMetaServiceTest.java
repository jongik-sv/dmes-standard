package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

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
}
