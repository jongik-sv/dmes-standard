package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** spec §5.3 리비전 규칙 다섯 가지 + RELOAD + 장애 시 유지(§5.4) + 순번 역전 되돌아보기(검토 A1) — 가짜 피드·가짜 시계. */
class MdmRevisionPollerTest {

    private MutableClock clock;
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;
    private MdmRevisionPoller poller;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        feed = new FakeMetaFeed().put(MdmTargetType.COLUMN, "A", "a").put(MdmTargetType.COLUMN, "B", "b")
                .put(MdmTargetType.DOMAIN, "3", "d3");
        cache = new MdmMetaCache(100, Duration.ofMinutes(60), clock);
        service = new MdmMetaService(feed, cache, clock);
        // 규칙 시험은 되돌아보기를 끈다(since = appliedSeq). 되돌아보기는 아래 A1 시험이 따로 본다.
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, 0);
    }

    private static MdmChanges changes(long latest, boolean truncated, MdmChange... items) {
        return new MdmChanges(latest, List.of(items), truncated);
    }

    private void started(long latest) {
        feed.changes.add(changes(latest, false));
        poller.pollOnce();
    }

    @Test
    void 규칙1_첫_폴링은_latestSeq_를_appliedSeq_로_삼고_그_전에_적재한_항목을_비운다() {
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        assertThat(cache.sizes().get(MdmTargetType.COLUMN)).isEqualTo(1);

        started(5);

        assertThat(feed.changesSince).containsExactly(0L);
        assertThat(cache.appliedSeq()).isEqualTo(5);
        assertThat(cache.sizes().get(MdmTargetType.COLUMN)).isZero();
        assertThat(poller.status().latestSeq()).isEqualTo(5);
        assertThat(poller.status().lastSuccessAt()).isEqualTo(clock.instant());
    }

    @Test
    void 규칙1_MDM_이_꺼져_첫_폴링이_실패하면_처음_성공할_때_같은_규칙을_적용한다() {
        feed.changes.add(new MdmUnavailableException("꺼짐"));
        poller.pollOnce();
        assertThat(cache.appliedSeq()).isEqualTo(-1);
        assertThat(poller.status().consecutiveFailures()).isEqualTo(1);

        started(7);
        assertThat(cache.appliedSeq()).isEqualTo(7);
        assertThat(poller.status().consecutiveFailures()).isZero();
    }

    @Test
    void 규칙2_정상_폴링은_받은_키만_지우고_appliedSeq_를_마지막_seq_로_올린다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A", "B"));
        service.lookup(MdmTargetType.DOMAIN, List.of("3"));

        feed.changes.add(changes(7, false, new MdmChange(6, "COLUMN", "A", "SAVE"), new MdmChange(7, "DOMAIN", "3", "SAVE")));
        poller.pollOnce();

        assertThat(feed.changesSince).containsExactly(0L, 5L);
        assertThat(cache.appliedSeq()).isEqualTo(7);
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.DOMAIN, "3")).isEmpty();
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).isPresent();
    }

    @Test
    void 규칙3_truncated_면_캐시를_비우고_appliedSeq_를_latestSeq_로_둔다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("B"));

        feed.changes.add(changes(5000, true, new MdmChange(6, "COLUMN", "A", "SAVE")));
        poller.pollOnce();

        assertThat(cache.appliedSeq()).isEqualTo(5000);
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).isEmpty();
    }

    @Test
    void 규칙4_latestSeq_가_appliedSeq_보다_작으면_역행으로_보고_비운다() {
        started(50);
        service.lookup(MdmTargetType.COLUMN, List.of("B"));

        feed.changes.add(changes(2, false));
        poller.pollOnce();

        assertThat(cache.appliedSeq()).isEqualTo(2);
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).isEmpty();
    }

    @Test
    void 규칙5_경합_적재_결과는_캐시에_남지_않고_다음_조회가_다시_받는다() {
        started(5);
        MdmMetaCache.Ticket before = cache.ticket(); // 적재가 이 시점에 시작했다고 친다
        feed.changes.add(changes(6, false, new MdmChange(6, "COLUMN", "A", "SAVE")));
        poller.pollOnce();

        assertThat(cache.put(MdmTargetType.COLUMN, "A", "옛 값", before)).isFalse();
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void RELOAD_는_지운_뒤_바로_다시_적재한다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.put(MdmTargetType.COLUMN, "A", "a2");

        feed.changes.add(changes(6, false, new MdmChange(6, "COLUMN", "A", "RELOAD")));
        poller.pollOnce();

        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("a2");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }

    @Test
    void EVICT_와_모르는_종류() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        feed.changes.add(changes(7, false, new MdmChange(6, "COLUMN", "A", "EVICT"), new MdmChange(7, "TABLE", "Z", "SAVE")));
        poller.pollOnce();

        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.appliedSeq()).isEqualTo(7);
        assertThat(feed.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void 폴링_실패는_캐시를_비우지_않고_실패_수와_마지막_오류만_남긴다() {
        started(5);
        service.lookup(MdmTargetType.COLUMN, List.of("A"));
        Instant lastOk = poller.status().lastSuccessAt();
        clock.advance(Duration.ofSeconds(10));

        feed.changes.add(new MdmUnavailableException("꺼짐"));
        poller.pollOnce();
        feed.changes.add(new MdmUnavailableException("꺼짐"));
        poller.pollOnce();

        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isPresent();
        assertThat(cache.appliedSeq()).isEqualTo(5);
        assertThat(poller.status().consecutiveFailures()).isEqualTo(2);
        assertThat(poller.status().lastError()).contains("꺼짐");
        assertThat(poller.status().lastSuccessAt()).isEqualTo(lastOk);
    }

    // ---- 검토 A1: 순번 역전 대비 되돌아보기 ----

    @Test
    void 늦게_커밋된_낮은_순번은_다음_폴링에서_지운다() {
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, 100);
        started(4);
        service.lookup(MdmTargetType.COLUMN, List.of("A", "B"));

        // 순번 6(B)이 먼저 커밋됐다 — 5 는 아직 보이지 않는다.
        feed.changes.add(changes(6, false, new MdmChange(6, "COLUMN", "B", "SAVE")));
        poller.pollOnce();
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isPresent();
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).isEmpty();
        service.lookup(MdmTargetType.COLUMN, List.of("B")); // B 를 다시 적재해 둔다

        // 순번 5(A)가 늦게 커밋됐다 — 되돌아보기 구간이 5·6 을 다시 준다.
        feed.changes.add(changes(6, false, new MdmChange(5, "COLUMN", "A", "SAVE"), new MdmChange(6, "COLUMN", "B", "SAVE")));
        poller.pollOnce();

        assertThat(feed.changesSince).containsExactly(0L, 0L, 0L);
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).as("이미 처리한 순번 6 은 두 번 지우지 않는다").isPresent();
        assertThat(cache.appliedSeq()).isEqualTo(6);
    }

    @Test
    void 되돌아보기_구간_밖_순번은_기억에서_버린다() {
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, 3);
        started(0);
        for (long seq = 1; seq <= 10; seq++) {
            feed.changes.add(changes(seq, false, new MdmChange(seq, "COLUMN", "K" + seq, "SAVE")));
            poller.pollOnce();
        }

        assertThat(cache.appliedSeq()).isEqualTo(10);
        assertThat(poller.processedSeqCount()).isEqualTo(3); // 8·9·10 — 구간(7 초과) 안 순번만
        // since = max(0, appliedSeq - 3): 0(기동), 0, 0, 0, 1, 2, … 6
        assertThat(feed.changesSince).containsExactly(0L, 0L, 0L, 0L, 0L, 1L, 2L, 3L, 4L, 5L, 6L);
    }

    @Test
    void lookback_0_이면_since_는_appliedSeq_그대로다() {
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, 0);
        started(5);
        feed.changes.add(changes(7, false, new MdmChange(7, "COLUMN", "A", "SAVE")));
        poller.pollOnce();
        feed.changes.add(changes(7, false));
        poller.pollOnce();

        assertThat(feed.changesSince).containsExactly(0L, 5L, 7L);
        assertThat(poller.processedSeqCount()).isZero();
    }

    @Test
    void 기본_생성자는_되돌아보기_100_이다() {
        assertThat(new MdmClientProperties().getRevisionLookback()).isEqualTo(100);
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000);
        started(250);
        feed.changes.add(changes(250, false));
        poller.pollOnce();

        assertThat(feed.changesSince).containsExactly(0L, 150L);
    }

    @Test
    void limit_가_lookback_보다_크지_않으면_기동_때_예외() {
        assertThatThrownBy(() -> new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 100, 100))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("revision-lookback");
        assertThatThrownBy(() -> new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, -1))
                .isInstanceOf(IllegalArgumentException.class);
        new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1, 0); // 끄면 limit 와 상관없다
    }

    // ---- Task 6 검토: data.result 없는 성공 응답은 장애로 다룬다 ----

    @Test
    void 결과가_빠진_성공_응답은_장애로_보고_캐시를_비우지_않는다() {
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        MdmMetaClient client = new MdmMetaClient(builder.build(), "http://mdm.test", "mls");
        MdmMetaService realService = new MdmMetaService(client, cache, clock);
        MdmRevisionPoller realPoller = new MdmRevisionPoller(client, cache, realService, clock, Duration.ofSeconds(10), 1000, 0);
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search")).andRespond(withSuccess(
                "{\"meta\":{\"success\":true},\"data\":{\"result\":{\"latestSeq\":5,\"items\":[],\"truncated\":false}}}",
                MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/view")).andRespond(withSuccess(
                "{\"meta\":{\"success\":true},\"data\":{\"result\":{\"items\":[{\"key\":\"3\",\"value\":{\"layoutName\":\"전문\"}}],"
                        + "\"failed\":[]}}}",
                MediaType.APPLICATION_JSON));
        server.expect(requestTo("http://mdm.test/oasis/metaFeed/search")).andRespond(withSuccess(
                "{\"meta\":{\"success\":true}}", MediaType.APPLICATION_JSON));

        realPoller.pollOnce();
        realService.lookup(MdmTargetType.LAYOUT, List.of("3"));
        realPoller.pollOnce();

        server.verify();
        assertThat(cache.get(MdmTargetType.LAYOUT, "3")).isPresent();
        assertThat(cache.appliedSeq()).isEqualTo(5);
        assertThat(realPoller.status().consecutiveFailures()).isEqualTo(1);
        assertThat(realPoller.status().lastError()).contains("data.result");
    }
}
