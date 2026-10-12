package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** 변경 신호 + 안전망 폴링(mdm ADR-0007 D2 개정, 2026-10-12) — 기동 첫 확인, 신호 묶음 합치기, 시작 전·닫힌 뒤 신호. 실제 폴러 스레드로 돈다. */
class MdmRevisionPollerSignalTest {

    private static final Duration SAFETY_INTERVAL = Duration.ofMinutes(5);
    private FakeMetaFeed feed;
    private MdmRevisionPoller poller;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(Instant.parse("2026-10-12T00:00:00Z"));
        feed = new FakeMetaFeed();
        for (int i = 0; i < 50; i++) {
            feed.changes.add(new MdmChanges(5, List.of(), false)); // 매 확인이 성공하게(빈 변경)
        }
        MdmMetaCache cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        MdmMetaService service = new MdmMetaService(feed, cache, clock);
        poller = new MdmRevisionPoller(feed, cache, service, clock, SAFETY_INTERVAL, 1000, 0, Duration.ofMillis(200));
    }

    @AfterEach
    void tearDown() {
        poller.close();
    }

    @Test
    void 정기_주기가_5분이어도_기동_첫_확인은_바로_한다() {
        poller.start();

        assertThat(waitUntil(() -> feed.changesSince.size() == 1, 3_000)).as("첫 확인").isTrue();
        assertThat(poller.status().lastSuccessAt()).isNotNull();
        assertThat(poller.status().latestSeq()).isEqualTo(5);
    }

    @Test
    void 연달아_온_신호는_확인_한_번으로_합친다() throws Exception {
        poller.start();
        assertThat(waitUntil(() -> feed.changesSince.size() == 1, 3_000)).isTrue();

        for (int i = 0; i < 20; i++) {
            assertThat(poller.requestPoll()).isTrue();
        }

        assertThat(waitUntil(() -> feed.changesSince.size() >= 2, 3_000)).as("신호 뒤 확인").isTrue();
        Thread.sleep(600); // 대기(200ms)를 넉넉히 지나도 더 돌지 않는다
        assertThat(feed.changesSince).hasSize(2);

        assertThat(poller.requestPoll()).isTrue(); // 앞 확인이 끝난 뒤 온 신호는 새 확인 하나
        assertThat(waitUntil(() -> feed.changesSince.size() == 3, 3_000)).isTrue();
        Thread.sleep(400);
        assertThat(feed.changesSince).hasSize(3);
    }

    @Test
    void 확인_중에_온_신호는_확인_하나를_더_남긴다() throws Exception {
        poller.start();
        assertThat(waitUntil(() -> feed.changesSince.size() == 1, 3_000)).isTrue();

        synchronized (feed) { // changes() 가 feed 잠금을 쓴다 — 신호 확인을 피드 호출 안에서 붙잡아 둔다
            assertThat(poller.requestPoll()).isTrue();
            assertThat(waitUntil(() -> !poller.signalPending(), 3_000)).as("대기 표시는 확인 직전에 내린다").isTrue();
            assertThat(poller.requestPoll()).isTrue();
            assertThat(poller.requestPoll()).isTrue();
        }

        assertThat(waitUntil(() -> feed.changesSince.size() == 3, 3_000)).isTrue();
        Thread.sleep(400);
        assertThat(feed.changesSince).as("붙잡힌 확인 1 + 그동안 온 신호 둘을 합친 확인 1").hasSize(3);
    }

    @Test
    void 시작_전이나_닫힌_뒤의_신호는_접수하지_않는다() {
        assertThat(poller.requestPoll()).isFalse();
        poller.start();
        poller.close();
        assertThat(poller.requestPoll()).isFalse();
    }

    private static boolean waitUntil(BooleanSupplier cond, long timeoutMs) {
        long end = System.nanoTime() + Duration.ofMillis(timeoutMs).toNanos();
        while (System.nanoTime() < end) {
            if (cond.getAsBoolean()) {
                return true;
            }
            try {
                Thread.sleep(20);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return cond.getAsBoolean();
    }
}
