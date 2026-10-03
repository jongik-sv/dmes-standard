package com.dongkuk.dmes.cactus.mdm;

import static com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookupTest.rule;
import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.AbstractMap;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * fu5 특성 시험 — 값·목차·본문 세 적재 경로가 같이 지켜야 하는 규칙을 리팩터 전에 고정한다(이 파일은 리팩터 뒤에 고치지 않는다).
 *
 * <ul>
 *   <li>(a) feed 호출만 실패로 센다 — 해석·캐시 쓰기 단계의 예외는 실패 집계가 아니라 finally 가 "적재가 끝나지 않았습니다" 로 닫는다(본문 경로의
 *       키별 해석 예외는 그 키만 받을 수 없음).</li>
 *   <li>(b) 캐시 쓰기가 future 완료보다 먼저다 — 합류자가 깨어나면 캐시가 이미 채워져 있다.</li>
 *   <li>(c) finally 의 remove(id, f) 는 자기 자리만 지운다 — 자리를 빼앗은 새 적재를 지우지 않는다(값·목차 경로는 기존 시험이 고정, 여기서는 본문).</li>
 *   <li>(d) health 는 feed 호출이 성공하면 해석 전에 OK 로 돌아간다. 목차·본문 실패는 값 경로와 같은 health 하나를 쓴다.</li>
 *   <li>(e) 진행 중 적재에 합류한다. 기다리는 동안 인터럽트되면 그 키는 받을 수 없음이고 인터럽트 표시는 남는다(대기 한도 {@code WAIT_LIMIT} 30초는
 *       상수라 시험하지 않는다 — 같은 catch 갈래).</li>
 * </ul>
 */
class MdmMetaServiceLoadRulesTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z"); // KST 2026-10-03 00:00
    private static final LocalDateTime KST0 = LocalDateTime.parse("2026-10-03T00:00:00");
    private static final Instant PAST = Instant.parse("2026-05-31T15:00:00Z"); // KST 2026-06-01 — 1.000

    private MutableClock clock;
    private ParkingClock pclock;
    private StepFeed feed;
    private MdmMetaCache cache;
    private CountDownLatch gate;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(T0);
        pclock = new ParkingClock(clock);
        FakeMetaFeed data = new FakeMetaFeed().versioned();
        data.put(MdmTargetType.COLUMN, "A", "a");
        data.put(MdmTargetType.RULE, "R", List.of(
                rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), KST0.plusHours(1)),
                rule("2.000", KST0.plusHours(1), null)));
        feed = new StepFeed(data);
        cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), pclock);
        cache.clear(0);
        gate = new CountDownLatch(1);
    }

    @AfterEach
    void release() {
        gate.countDown();
        pclock.release.countDown();
    }

    private MdmMetaService valueService() {
        return new MdmMetaService(feed, cache, pclock);
    }

    private MdmMetaService versionedService() {
        return new MdmMetaService(feed, cache, pclock, true);
    }

    /** 목차만 캐시에 둔다(current 없이) — 이어지는 조회가 본문 요청 경로를 탄다. */
    private void tocOnly(MdmMetaService s) {
        feed.data.omitCurrent = true;
        assertThat(s.toc(MdmTargetType.RULE, "R")).isPresent();
        assertThat(feed.data.bodyCalls.get()).isZero();
    }

    // ------------------------------------------------------------------ (a)(d) 해석 단계 예외

    @Test
    void 값_해석_단계_예외는_실패로_세지_않고_합류자를_받을_수_없음으로_닫고_자리를_비운다() throws Exception {
        MdmMetaService s = valueService();
        feed.data.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(s.lookup(MdmTargetType.COLUMN, List.of("A")).unavailable()).containsExactly("A");
        assertThat(s.consecutiveFailures()).isEqualTo(1);
        feed.data.fetchError = null;

        feed.nextBoom.set(new IllegalStateException("해석 폭발"));
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmLookup> loader = new Call<>("loader", false, () -> s.lookup(MdmTargetType.COLUMN, List.of("A")));
        feed.awaitEntered("value");
        Call<MdmMetaService.MdmLookup> joiner = new Call<>("joiner", false, () -> s.lookup(MdmTargetType.COLUMN, List.of("A")));
        awaitWaiting(joiner);
        gate.countDown();

        assertThat(loader.error()).as("해석 단계 예외는 적재한 호출자에게 그대로 나간다").isInstanceOf(IllegalStateException.class).hasMessage("해석 폭발");
        assertThat(joiner.get().unavailable()).as("합류자는 finally 가 닫아 받을 수 없음").containsExactly("A");
        assertThat(s.consecutiveFailures()).as("feed 호출은 성공 — 해석 전에 health 가 OK 로 돌아갔고 해석 예외는 세지 않는다").isZero();
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).as("캐시 쓰기 전에 터졌다").isEmpty();

        int calls = feed.data.fetchCalls.get();
        assertThat(s.lookup(MdmTargetType.COLUMN, List.of("A")).found()).containsEntry("A", "a");
        assertThat(feed.data.fetchCalls.get()).as("진행 중 자리가 비어 새로 적재한다").isEqualTo(calls + 1);
    }

    @Test
    void 목차_해석_단계_예외는_실패로_세지_않고_합류자를_받을_수_없음으로_닫고_자리를_비운다() throws Exception {
        MdmMetaService s = versionedService();
        feed.data.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("S"), T0).unavailable()).containsExactly("S");
        assertThat(s.consecutiveFailures()).isEqualTo(1);
        feed.data.fetchError = null;

        feed.nextBoom.set(new IllegalStateException("해석 폭발"));
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmAtLookup> loader = new Call<>("loader", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), T0));
        feed.awaitEntered("toc");
        Call<MdmMetaService.MdmAtLookup> joiner = new Call<>("joiner", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), T0));
        awaitWaiting(joiner);
        gate.countDown();

        assertThat(loader.error()).isInstanceOf(IllegalStateException.class).hasMessage("해석 폭발");
        assertThat(joiner.get().unavailable()).containsExactly("R");
        assertThat(s.consecutiveFailures()).isZero();
        assertThat(cache.get(MdmTargetType.RULE, "R")).isEmpty();

        int tocs = feed.data.tocCalls.get();
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), T0).found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.data.tocCalls.get()).as("진행 중 자리가 비어 새로 적재한다").isEqualTo(tocs + 1);
    }

    /** 본문 해석은 키마다 RuntimeException 을 잡는다 — 그 밖(캐시 쓰기)의 예외는 실패로 세지 않고 바깥 finally 로만 닫힌다. */
    @Test
    void 본문_캐시_쓰기_단계_예외는_실패로_세지_않고_합류자를_받을_수_없음으로_닫고_자리를_비운다() throws Exception {
        MdmMetaService s = versionedService();
        tocOnly(s);
        feed.data.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST).unavailable()).containsExactly("R");
        assertThat(s.consecutiveFailures()).isEqualTo(1);
        feed.data.fetchError = null;

        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmAtLookup> loader = new Call<>("loader", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        feed.awaitEntered("body");
        Call<MdmMetaService.MdmAtLookup> joiner = new Call<>("joiner", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        awaitWaiting(joiner);
        pclock.failNextCallOf(loader.thread, new IllegalStateException("캐시 쓰기 폭발")); // feed 다음 첫 시각 질의 = putBodies 안
        gate.countDown();

        assertThat(loader.error()).as("캐시 쓰기 단계 예외는 적재한 호출자에게 그대로 나간다").isInstanceOf(IllegalStateException.class)
                .hasMessage("캐시 쓰기 폭발");
        assertThat(joiner.get().unavailable()).containsExactly("R");
        assertThat(s.consecutiveFailures()).isZero();
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();

        int bodies = feed.data.bodyCalls.get();
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST).found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.data.bodyCalls.get()).as("진행 중 자리가 비어 새로 적재한다").isEqualTo(bodies + 1);
    }

    @Test
    void 본문_해석의_RuntimeException_은_그_키만_받을_수_없음이고_실패로_세지_않는다() {
        MdmMetaService s = versionedService();
        tocOnly(s);
        feed.data.fetchError = new MdmUnavailableException("꺼짐");
        s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST);
        assertThat(s.consecutiveFailures()).isEqualTo(1);
        feed.data.fetchError = null;

        feed.nextBoom.set(new IllegalStateException("해석 폭발"));
        MdmMetaService.MdmAtLookup r = s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST);

        assertThat(r.unavailable()).containsExactly("R");
        assertThat(s.consecutiveFailures()).isZero();
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
    }

    // ------------------------------------------------------------------ (d) 건너뛰기

    @Test
    void 목차_적재가_연속_두_번_실패하면_30초_건너뛰고_그동안은_feed_를_부르지_않는다() {
        MdmMetaService s = versionedService();
        feed.data.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), T0).unavailable()).containsExactly("R");
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), T0).unavailable()).containsExactly("R");
        assertThat(feed.data.tocCalls.get()).isEqualTo(2);
        assertThat(s.consecutiveFailures()).isEqualTo(2);

        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), T0).unavailable()).containsExactly("R");
        assertThat(feed.data.tocCalls.get()).as("건너뛰는 동안 feed 를 부르지 않는다").isEqualTo(2);

        clock.advance(Duration.ofSeconds(31));
        feed.data.fetchError = null;
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant()).found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.data.tocCalls.get()).isEqualTo(3);
        assertThat(s.consecutiveFailures()).isZero();
    }

    @Test
    void 본문_적재도_목차와_같은_health_로_연속_두_번_실패하면_건너뛴다() {
        MdmMetaService s = versionedService();
        tocOnly(s);
        feed.data.fetchError = new MdmUnavailableException("꺼짐");
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("S"), T0).unavailable()).containsExactly("S"); // 목차 실패 1
        assertThat(s.consecutiveFailures()).isEqualTo(1);
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST).unavailable()).containsExactly("R"); // 본문 실패 2
        assertThat(feed.data.bodyCalls.get()).isEqualTo(1);
        assertThat(s.consecutiveFailures()).as("목차·본문 실패를 한 health 로 센다").isEqualTo(2);

        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST).unavailable()).containsExactly("R");
        assertThat(feed.data.bodyCalls.get()).as("건너뛰는 동안 본문 feed 도 부르지 않는다").isEqualTo(1);

        clock.advance(Duration.ofSeconds(31));
        feed.data.fetchError = null;
        assertThat(s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST).found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.data.bodyCalls.get()).isEqualTo(2);
        assertThat(s.consecutiveFailures()).isZero();
    }

    // ------------------------------------------------------------------ (b) 캐시 쓰기가 완료보다 먼저

    @Test
    void 값_적재는_캐시에_넣은_뒤에_합류자를_깨운다() throws Exception {
        MdmMetaService s = valueService();
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmLookup> loader = new Call<>("loader", false, () -> s.lookup(MdmTargetType.COLUMN, List.of("A")));
        feed.awaitEntered("value");
        Call<MdmMetaService.MdmLookup> joiner = new Call<>("joiner", false, () -> s.lookup(MdmTargetType.COLUMN, List.of("A")));
        awaitWaiting(joiner);

        pclock.parkNextCallOf(loader.thread); // feed 다음 첫 시각 질의 = 캐시 쓰기 안
        gate.countDown();
        assertThat(pclock.parked.await(5, TimeUnit.SECONDS)).isTrue();
        Thread.sleep(200);
        assertThat(joiner.isDone()).as("캐시 쓰기가 끝나기 전에는 합류자가 깨지 않는다").isFalse();
        pclock.release.countDown();

        assertThat(joiner.get().found()).containsEntry("A", "a");
        assertThat(loader.get().found()).containsEntry("A", "a");
        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("a");
        assertThat(feed.data.fetchCalls.get()).isEqualTo(1);
    }

    @Test
    void 목차_적재는_목차와_current_본문을_캐시에_넣은_뒤에_합류자를_깨운다() throws Exception {
        MdmMetaService s = versionedService();
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmAtLookup> loader = new Call<>("loader", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), T0));
        feed.awaitEntered("toc");
        Call<MdmMetaService.MdmAtLookup> joiner = new Call<>("joiner", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), T0));
        awaitWaiting(joiner);

        pclock.parkNextCallOf(loader.thread);
        gate.countDown();
        assertThat(pclock.parked.await(5, TimeUnit.SECONDS)).isTrue();
        Thread.sleep(200);
        assertThat(joiner.isDone()).isFalse();
        pclock.release.countDown();

        assertThat(joiner.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(loader.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.data.tocCalls.get()).isEqualTo(1);
        assertThat(feed.data.bodyCalls.get()).as("합류자는 깨어났을 때 current 본문을 캐시에서 찾았다(putBodies 가 완료보다 먼저)").isZero();
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isPresent();
    }

    @Test
    void 본문_적재는_캐시에_넣은_뒤에_합류자를_깨운다() throws Exception {
        MdmMetaService s = versionedService();
        tocOnly(s);
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmAtLookup> loader = new Call<>("loader", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        feed.awaitEntered("body");
        Call<MdmMetaService.MdmAtLookup> joiner = new Call<>("joiner", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        awaitWaiting(joiner);

        pclock.parkNextCallOf(loader.thread);
        gate.countDown();
        assertThat(pclock.parked.await(5, TimeUnit.SECONDS)).isTrue();
        Thread.sleep(200);
        assertThat(joiner.isDone()).isFalse();
        pclock.release.countDown();

        assertThat(joiner.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(loader.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isPresent();
        assertThat(feed.data.bodyCalls.get()).isEqualTo(1);
    }

    // ------------------------------------------------------------------ (c) 본문 자리 빼앗기

    @Test
    void 본문_적재의_finally_는_reloadAt_이_빼앗은_새_자리를_지우지_않는다() throws Exception {
        MdmMetaService s = versionedService();
        tocOnly(s);
        CountDownLatch newGate = new CountDownLatch(1);
        try {
            feed.nextGate.set(gate);
            Call<MdmMetaService.MdmAtLookup> old = new Call<>("old", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
            feed.awaitEntered("body");

            feed.nextGate.set(newGate);
            Call<MdmMetaService.MdmAtLookup> reload = new Call<>("reload", false,
                    () -> s.reloadAt(MdmTargetType.RULE, List.of("R@1.000"), T0));
            feed.awaitEntered("body");
            assertThat(feed.data.bodyCalls.get()).as("진행 중 본문 적재에 합류하지 않고 자기 요청").isEqualTo(2);

            gate.countDown(); // 새 적재를 문에 둔 채 옛 적재를 먼저 끝낸다 — 옛 finally 가 inflightBody.remove(id, f) 를 지난다
            assertThat(old.get().found().get("R").ver()).isEqualTo("1.000");
            assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).as("옛 적재는 지운 본문을 넣지 못한다").isEmpty();

            Call<MdmMetaService.MdmAtLookup> later = new Call<>("later", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
            awaitWaiting(later);

            newGate.countDown();
            assertThat(reload.get().found()).containsOnlyKeys("R@1.000");
            assertThat(later.get().found().get("R").ver()).isEqualTo("1.000");
            assertThat(feed.data.bodyCalls.get()).as("옛 finally 가 새 자리를 지우지 않아 뒤이은 조회가 새 적재에 합류했다").isEqualTo(2);
            assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isPresent();
        } finally {
            newGate.countDown();
        }
    }

    // ------------------------------------------------------------------ (e) 합류·기다리기

    @Test
    void 같은_본문_동시_적재는_한_번이다() throws Exception {
        MdmMetaService s = versionedService();
        tocOnly(s);
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmAtLookup> a = new Call<>("a", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        feed.awaitEntered("body");
        Call<MdmMetaService.MdmAtLookup> b = new Call<>("b", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        awaitWaiting(b);
        gate.countDown();

        assertThat(a.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(b.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(a.get().found().get("R").body()).isSameAs(b.get().found().get("R").body());
        assertThat(feed.data.bodyKeys).containsExactly(List.of(new MdmBodyKey("R", "1.000")));
    }

    @Test
    void 값_합류자가_기다리다_인터럽트되면_그_키는_받을_수_없음이고_인터럽트_표시는_남는다() throws Exception {
        MdmMetaService s = valueService();
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmLookup> loader = new Call<>("loader", false, () -> s.lookup(MdmTargetType.COLUMN, List.of("A")));
        feed.awaitEntered("value");

        Call<MdmMetaService.MdmLookup> joiner = new Call<>("joiner", true, () -> s.lookup(MdmTargetType.COLUMN, List.of("A")));
        assertThat(joiner.get().unavailable()).containsExactly("A");
        assertThat(joiner.interrupted).as("인터럽트 표시를 되살린다").isTrue();

        gate.countDown();
        assertThat(loader.get().found()).containsEntry("A", "a");
        assertThat(feed.data.fetchCalls.get()).as("합류자는 feed 를 부르지 않았다").isEqualTo(1);
    }

    @Test
    void 목차_합류자가_기다리다_인터럽트되면_그_키는_받을_수_없음이고_인터럽트_표시는_남는다() throws Exception {
        MdmMetaService s = versionedService();
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmAtLookup> loader = new Call<>("loader", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), T0));
        feed.awaitEntered("toc");

        Call<MdmMetaService.MdmAtLookup> joiner = new Call<>("joiner", true, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), T0));
        assertThat(joiner.get().unavailable()).containsExactly("R");
        assertThat(joiner.interrupted).isTrue();

        gate.countDown();
        assertThat(loader.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.data.tocCalls.get()).isEqualTo(1);
    }

    @Test
    void 본문_합류자가_기다리다_인터럽트되면_그_키는_받을_수_없음이고_인터럽트_표시는_남는다() throws Exception {
        MdmMetaService s = versionedService();
        tocOnly(s);
        feed.nextGate.set(gate);
        Call<MdmMetaService.MdmAtLookup> loader = new Call<>("loader", false, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        feed.awaitEntered("body");

        Call<MdmMetaService.MdmAtLookup> joiner = new Call<>("joiner", true, () -> s.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        assertThat(joiner.get().unavailable()).containsExactly("R");
        assertThat(joiner.interrupted).isTrue();

        gate.countDown();
        assertThat(loader.get().found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.data.bodyCalls.get()).isEqualTo(1);
    }

    // ------------------------------------------------------------------ 시험 도구

    private static void awaitWaiting(Call<?> call) {
        long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (call.thread.getState() != Thread.State.TIMED_WAITING && !call.isDone() && System.nanoTime() < until) {
            Thread.onSpinWait();
        }
        assertThat(call.thread.getState()).as(call.thread.getName() + " 가 진행 중 적재를 기다린다").isEqualTo(Thread.State.TIMED_WAITING);
    }

    /** 이름 있는 스레드 하나에서 부른다 — 결과·예외·끝날 때의 인터럽트 표시를 담는다. */
    private static final class Call<T> {
        final Thread thread;
        private final CountDownLatch done = new CountDownLatch(1);
        private volatile T result;
        private volatile Throwable error;
        volatile boolean interrupted;

        Call(String name, boolean preInterrupt, Supplier<T> body) {
            thread = new Thread(() -> {
                try {
                    if (preInterrupt) {
                        Thread.currentThread().interrupt();
                    }
                    result = body.get();
                } catch (Throwable t) {
                    error = t;
                } finally {
                    interrupted = Thread.currentThread().isInterrupted();
                    done.countDown();
                }
            }, name);
            thread.setDaemon(true);
            thread.start();
        }

        boolean isDone() {
            return done.getCount() == 0;
        }

        T get() throws InterruptedException {
            assertThat(done.await(5, TimeUnit.SECONDS)).as(thread.getName() + " 가 끝난다").isTrue();
            assertThat(error).as(thread.getName() + " 예외").isNull();
            return result;
        }

        Throwable error() throws InterruptedException {
            assertThat(done.await(5, TimeUnit.SECONDS)).as(thread.getName() + " 가 끝난다").isTrue();
            return error;
        }
    }

    /**
     * 값은 {@link FakeMetaFeed} 로 정하고, 다음 호출 하나만 문에 세우거나({@code nextGate}) 해석 단계에서 터지게 한다({@code nextBoom}). 문과 폭발은
     * 들어오자마자 가져가므로 들어왔다는 알림 뒤에 바꾼 값은 다음 호출 몫이다.
     */
    private static final class StepFeed implements MdmMetaFeed {
        final FakeMetaFeed data;
        final AtomicReference<CountDownLatch> nextGate = new AtomicReference<>();
        final AtomicReference<RuntimeException> nextBoom = new AtomicReference<>();
        final LinkedBlockingQueue<String> entered = new LinkedBlockingQueue<>();

        StepFeed(FakeMetaFeed data) {
            this.data = data;
        }

        void awaitEntered(String kind) throws InterruptedException {
            long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (System.nanoTime() < until) {
                String k = entered.poll(100, TimeUnit.MILLISECONDS);
                if (kind.equals(k)) {
                    return;
                }
            }
            throw new AssertionError(kind + " 요청이 들어오지 않았다");
        }

        @Override
        public MdmChanges changes(long since, int limit) {
            throw new UnsupportedOperationException();
        }

        @Override
        public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
            CountDownLatch g = nextGate.getAndSet(null);
            RuntimeException boom = nextBoom.getAndSet(null);
            MdmFetchResult r = data.fetch(type, keys);
            pass("value", g);
            return boom == null ? r : new MdmFetchResult(r.found(), new Boom<>(boom));
        }

        @Override
        public MdmTocResult fetchToc(MdmTargetType type, Collection<String> keys, LocalDateTime at) {
            CountDownLatch g = nextGate.getAndSet(null);
            RuntimeException boom = nextBoom.getAndSet(null);
            MdmTocResult r = data.fetchToc(type, keys, at);
            pass("toc", g);
            return boom == null ? r : new MdmTocResult(r.tocs(), r.current(), r.legacy(), new Boom<>(boom));
        }

        @Override
        public MdmBodyResult fetchBodies(MdmTargetType type, Collection<MdmBodyKey> keys) {
            CountDownLatch g = nextGate.getAndSet(null);
            RuntimeException boom = nextBoom.getAndSet(null);
            MdmBodyResult r = data.fetchBodies(type, keys);
            pass("body", g);
            return boom == null ? r : new MdmBodyResult(new Boom<>(boom), r.failed(), r.legacy(), r.legacyFailed(), r.legacyAsked());
        }

        private void pass(String kind, CountDownLatch g) {
            entered.add(kind);
            if (g != null) {
                try {
                    g.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
        }
    }

    /** 읽으면 터지는 맵 — 해석 단계 예외를 만든다. */
    private static final class Boom<K, V> extends AbstractMap<K, V> {
        private final RuntimeException boom;

        Boom(RuntimeException boom) {
            this.boom = boom;
        }

        private RuntimeException fire() {
            return boom;
        }

        @Override
        public Set<Map.Entry<K, V>> entrySet() {
            throw fire();
        }

        @Override
        public boolean containsKey(Object key) {
            throw fire();
        }

        @Override
        public V get(Object key) {
            throw fire();
        }
    }

    /** 지정한 스레드가 다음에 시각을 물으면 한 번 멈춰 세우거나({@code parkNextCallOf}) 던진다({@code failNextCallOf}). */
    private static final class ParkingClock extends Clock {
        private final Clock delegate;
        private volatile Thread target;
        private volatile RuntimeException failure;
        final CountDownLatch parked = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);

        ParkingClock(Clock delegate) {
            this.delegate = delegate;
        }

        void parkNextCallOf(Thread t) {
            failure = null;
            target = t;
        }

        void failNextCallOf(Thread t, RuntimeException e) {
            failure = e;
            target = t;
        }

        @Override
        public ZoneId getZone() {
            return delegate.getZone();
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            if (Thread.currentThread() == target) {
                target = null;
                RuntimeException toThrow = failure;
                if (toThrow != null) {
                    failure = null;
                    throw toThrow;
                }
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
}
