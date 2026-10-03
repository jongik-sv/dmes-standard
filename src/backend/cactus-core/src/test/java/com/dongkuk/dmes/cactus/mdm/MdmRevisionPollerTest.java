package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
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
        // 순번 5 가 커밋되기 전에 Ticket(6) 을 받아 옛 A 를 읽은 적재가 있다고 친다.
        MdmMetaCache.Ticket before = cache.ticket();

        // 순번 5(A)가 늦게 커밋됐다 — 되돌아보기 구간이 5·6 을 다시 준다.
        feed.changes.add(changes(6, false, new MdmChange(5, "COLUMN", "A", "SAVE"), new MdmChange(6, "COLUMN", "B", "SAVE")));
        poller.pollOnce();

        assertThat(feed.changesSince).containsExactly(0L, 0L, 0L);
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.COLUMN, "B")).as("이미 처리한 순번 6 은 두 번 지우지 않는다").isPresent();
        assertThat(cache.appliedSeq()).isEqualTo(6);
        // 규칙 5: 늦은 순번의 지움 뒤에는 그 전에 받은 Ticket(6) 의 옛 값을 넣지 못한다(지움 표지 규칙).
        assertThat(cache.put(MdmTargetType.COLUMN, "A", "옛 A", before)).isFalse();
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        // 지움 뒤에 받은 Ticket 은 바로 넣을 수 있다 — 5분 막힘이 없다.
        assertThat(cache.put(MdmTargetType.COLUMN, "A", "새 A", cache.ticket())).isTrue();
        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("새 A");
    }

    @Test
    void 기동_뒤_되돌아보기로_다시_온_옛_순번은_그_키를_캐시하지_못하게_하지_않는다() {
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, 100);
        started(5);
        // 기동 직후 첫 정상 폴링 — since = 0 이라 실제 MDM 은 applied(5) 이하의 옛 순번을 다시 준다.
        feed.changes.add(changes(5, false, new MdmChange(3, "COLUMN", "A", "SAVE"), new MdmChange(4, "COLUMN", "B", "SAVE"),
                new MdmChange(5, "COLUMN", "C", "SAVE")));
        poller.pollOnce();

        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).as("두 번째 조회는 캐시에서").isEqualTo(1);
    }

    @Test
    void 규칙3_4_로_비운_뒤_되돌아보기로_다시_온_옛_순번은_그_키를_캐시하지_못하게_하지_않는다() {
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, 100);
        started(5);
        feed.changes.add(changes(5000, true)); // 규칙 3
        poller.pollOnce();
        feed.changes.add(changes(5000, false, new MdmChange(4990, "COLUMN", "A", "SAVE")));
        poller.pollOnce();
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.fetchCalls.get()).isEqualTo(1);

        feed.changes.add(changes(10, false)); // 규칙 4 — 역행
        poller.pollOnce();
        feed.changes.add(changes(10, false, new MdmChange(9, "COLUMN", "B", "SAVE")));
        poller.pollOnce();
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("B")).found()).containsEntry("B", "b");
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("B")).found()).containsEntry("B", "b");
        assertThat(feed.fetchCalls.get()).isEqualTo(2);
    }

    @Test
    void 되돌아보기를_켠_채_규칙3_4_로_비우면_처리한_순번_기억도_비운다() {
        poller = new MdmRevisionPoller(feed, cache, service, clock, Duration.ofSeconds(10), 1000, 100);
        started(4);
        feed.changes.add(changes(6, false, new MdmChange(5, "COLUMN", "A", "SAVE"), new MdmChange(6, "COLUMN", "B", "SAVE")));
        poller.pollOnce();
        assertThat(poller.processedSeqCount()).isEqualTo(2);

        feed.changes.add(changes(5000, true, new MdmChange(7, "COLUMN", "A", "SAVE"))); // 규칙 3
        poller.pollOnce();
        assertThat(poller.processedSeqCount()).isZero();
        assertThat(cache.appliedSeq()).isEqualTo(5000);

        feed.changes.add(changes(5001, false, new MdmChange(5001, "COLUMN", "A", "SAVE")));
        poller.pollOnce();
        assertThat(poller.processedSeqCount()).isEqualTo(1);

        feed.changes.add(changes(3, false)); // 규칙 4 — 역행
        poller.pollOnce();
        assertThat(poller.processedSeqCount()).isZero();
        assertThat(cache.appliedSeq()).isEqualTo(3);
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
                "{\"meta\":{\"success\":true},\"data\":{\"result\":{\"items\":[{\"key\":\"3\",\"value\":[]}],"
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

    /** D-154 — 정의 키 변경은 목차와 본문 전부를 지우고, RELOAD 는 목차 + 지금 시각 최종 본문만 다시 받는다(옛 본문은 미스 때). */
    @Test
    void 버전_대상_RELOAD_는_묶음을_지우고_목차와_최종_본문만_다시_받는다() {
        FakeMetaFeed vfeed = new FakeMetaFeed().versioned();
        vfeed.put(MdmTargetType.RULE, "R", List.of(
                MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), LocalDateTime.parse("2026-06-01T00:00:00")),
                MdmDefinitionLookupTest.rule("2.000", LocalDateTime.parse("2026-06-01T00:00:00"), null)));
        MdmMetaCache vcache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        MdmMetaService vservice = new MdmMetaService(vfeed, vcache, clock, true);
        MdmRevisionPoller vpoller = new MdmRevisionPoller(vfeed, vcache, vservice, clock, Duration.ofSeconds(10), 1000, 0);
        vfeed.changes.add(changes(5, false));
        vpoller.pollOnce();
        vservice.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());                             // 목차 + 2.000
        vservice.lookupAt(MdmTargetType.RULE, List.of("R"), Instant.parse("2026-03-01T00:00:00Z"));       // 1.000 본문
        assertThat(vcache.bodySizes().get(MdmTargetType.RULE)).isEqualTo(2);
        int tocs = vfeed.tocCalls.get();

        vfeed.changes.add(changes(6, false, new MdmChange(6, "RULE", "R", "RELOAD")));
        vpoller.pollOnce();

        assertThat(vfeed.tocCalls.get()).isEqualTo(tocs + 1);
        assertThat(vcache.getBody(MdmTargetType.RULE, "R", "2.000")).isPresent();
        assertThat(vcache.getBody(MdmTargetType.RULE, "R", "1.000")).as("옛 본문은 다시 받지 않는다").isEmpty();
    }

    @Test
    void 버전_대상_EVICT_는_목차와_본문을_묶음째_지운다() {
        FakeMetaFeed vfeed = new FakeMetaFeed().versioned();
        vfeed.put(MdmTargetType.RULE, "R", List.of(MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        MdmMetaCache vcache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        MdmMetaService vservice = new MdmMetaService(vfeed, vcache, clock, true);
        MdmRevisionPoller vpoller = new MdmRevisionPoller(vfeed, vcache, vservice, clock, Duration.ofSeconds(10), 1000, 0);
        vfeed.changes.add(changes(5, false));
        vpoller.pollOnce();
        vservice.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());

        vfeed.changes.add(changes(6, false, new MdmChange(6, "RULE", "R", "EVICT")));
        vpoller.pollOnce();

        assertThat(vcache.get(MdmTargetType.RULE, "R")).isEmpty();
        assertThat(vcache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
        assertThat(vcache.sizes().get(MdmTargetType.RULE)).isZero();
    }

    // ---- fu3: RELOAD 는 지움 전에 시작한 진행 중 적재에 합류하지 않는다(관리 화면 reload 와 같은 자리 빼앗기) ----

    /**
     * 지움 전 Ticket 으로 시작해 문 앞에서 멈춘 목차 적재가 있을 때 RELOAD — 합류하면 그 적재를 기다리다(가짜 문 한도 5초) 3초 안에 끝나지 않고, 끝나도
     * 지움 전 Ticket 이라 목차·최종 본문이 캐시에 남지 않는다.
     */
    @Test
    void 버전_대상_RELOAD_는_지움_전에_시작한_목차_적재에_합류하지_않고_목차와_최종_본문을_넣는다() throws Exception {
        FakeMetaFeed vfeed = new FakeMetaFeed().versioned();
        vfeed.put(MdmTargetType.RULE, "R", List.of(
                MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        MdmMetaCache vcache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        MdmMetaService vservice = new MdmMetaService(vfeed, vcache, clock, true);
        MdmRevisionPoller vpoller = new MdmRevisionPoller(vfeed, vcache, vservice, clock, Duration.ofSeconds(10), 1000, 0);
        vfeed.changes.add(changes(5, false));
        vpoller.pollOnce();
        CountDownLatch gate = new CountDownLatch(1);
        try {
            vfeed.fetchGate = gate;
            CompletableFuture<MdmMetaService.MdmAtLookup> old = CompletableFuture.supplyAsync(
                    () -> vservice.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant()));
            assertThat(vfeed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue(); // 옛 목차(1.000 만)를 읽고 문 앞에서 멈췄다
            vfeed.fetchGate = null;
            vfeed.put(MdmTargetType.RULE, "R", List.of(
                    MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), LocalDateTime.parse("2026-06-01T00:00:00")),
                    MdmDefinitionLookupTest.rule("2.000", LocalDateTime.parse("2026-06-01T00:00:00"), null)));
            int tocs = vfeed.tocCalls.get();

            vfeed.changes.add(changes(6, false, new MdmChange(6, "RULE", "R", "RELOAD")));
            CompletableFuture.runAsync(vpoller::pollOnce).get(3, TimeUnit.SECONDS); // 옛 적재를 기다리지 않는다

            Object toc = vcache.get(MdmTargetType.RULE, "R").orElseThrow().value();
            assertThat(toc).isInstanceOf(MdmToc.class);
            assertThat(((MdmToc) toc).version("2.000")).as("새 목차").isPresent();
            assertThat(vcache.peek(MdmTargetType.RULE, "R@2.000").orElseThrow().current()).as("목차와 함께 들어가 최종 수명").isTrue();
            assertThat(vfeed.tocCalls.get()).as("합류하지 않고 자기 목차 요청 한 번").isEqualTo(tocs + 1);

            gate.countDown(); // 옛 적재의 put 이 RELOAD 의 put 보다 늦게 온다
            assertThat(old.get(5, TimeUnit.SECONDS).found().get("R").ver()).as("옛 값은 그 호출자에게만 간다").isEqualTo("1.000");
            assertThat(vcache.get(MdmTargetType.RULE, "R").orElseThrow().value()).as("옛 적재는 새 목차를 덮지 않는다").isSameAs(toc);
            assertThat(vcache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
            assertThat(vcache.peek(MdmTargetType.RULE, "R@2.000").orElseThrow().current()).isTrue();
        } finally {
            gate.countDown();
        }
    }

    @Test
    void RELOAD_는_지움_전에_시작한_값_적재에_합류하지_않고_새_값을_캐시한다() throws Exception {
        started(5);
        CountDownLatch gate = new CountDownLatch(1);
        try {
            feed.fetchGate = gate;
            CompletableFuture<MdmMetaService.MdmLookup> old = CompletableFuture.supplyAsync(() -> service.lookup(MdmTargetType.COLUMN, List.of("A")));
            assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue(); // 옛 적재가 "a" 를 읽고 문 앞에서 멈췄다
            feed.fetchGate = null;
            feed.put(MdmTargetType.COLUMN, "A", "a2");

            feed.changes.add(changes(6, false, new MdmChange(6, "COLUMN", "A", "RELOAD")));
            CompletableFuture.runAsync(poller::pollOnce).get(3, TimeUnit.SECONDS);

            assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("a2");
            assertThat(feed.fetchCalls.get()).isEqualTo(2);

            gate.countDown();
            assertThat(old.get(5, TimeUnit.SECONDS).found()).containsEntry("A", "a");
            assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("a2");
            assertThat(service.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a2");
            assertThat(feed.fetchCalls.get()).as("이어진 조회는 캐시에서").isEqualTo(2);
        } finally {
            gate.countDown();
        }
    }

    @Test
    void versioned_feed_off_의_버전_대상_RELOAD_도_합류하지_않는다() throws Exception {
        List<Object> before = List.of(MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null));
        List<Object> after = List.of(
                MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), LocalDateTime.parse("2026-06-01T00:00:00")),
                MdmDefinitionLookupTest.rule("2.000", LocalDateTime.parse("2026-06-01T00:00:00"), null));
        feed.put(MdmTargetType.RULE, "R", before);
        started(5);
        CountDownLatch gate = new CountDownLatch(1);
        try {
            feed.fetchGate = gate;
            CompletableFuture<MdmMetaService.MdmAtLookup> old = CompletableFuture.supplyAsync(
                    () -> service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant()));
            assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue();
            feed.fetchGate = null;
            feed.put(MdmTargetType.RULE, "R", after);

            feed.changes.add(changes(6, false, new MdmChange(6, "RULE", "R", "RELOAD")));
            CompletableFuture.runAsync(poller::pollOnce).get(3, TimeUnit.SECONDS);

            assertThat(cache.get(MdmTargetType.RULE, "R").orElseThrow().value()).as("새 전 이력").isEqualTo(after);

            gate.countDown();
            assertThat(old.get(5, TimeUnit.SECONDS).found().get("R").ver()).isEqualTo("1.000");
            assertThat(cache.get(MdmTargetType.RULE, "R").orElseThrow().value()).isEqualTo(after);
            assertThat(feed.fetchCalls.get()).isEqualTo(2);
        } finally {
            gate.countDown();
        }
    }
}
