package com.dongkuk.dmes.cactus.mdm;

import static com.dongkuk.dmes.cactus.mdm.MdmDefinitionLookupTest.rule;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 버전 대상 적재 흐름(스펙 §5.2·§5.6·§5.8·§5.9). 시계 0 시 = KST 2026-10-03 00:00. 룰 R: 1.000 [2026-01-01, 01:00), 2.000 [01:00, 열린 끝).
 */
class MdmMetaServiceVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private static final LocalDateTime KST0 = LocalDateTime.parse("2026-10-03T00:00:00");
    private static final Instant PAST = Instant.parse("2026-05-31T15:00:00Z"); // KST 2026-06-01 — 1.000

    private MutableClock clock;
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.RULE, "R", List.of(
                rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), KST0.plusHours(1)),
                rule("2.000", KST0.plusHours(1), null)));
        cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
    }

    private static BigDecimal verOf(MdmMetaService.MdmAt at) {
        return ((RuleDefinition) at.body()).ver();
    }

    @Test
    void 목차_미스는_TOC_at_한_번이고_current_가_맞으면_본문을_따로_받지_않는다() {
        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);

        assertThat(r.found().get("R").ver()).isEqualTo("1.000");
        assertThat(verOf(r.found().get("R"))).isEqualByComparingTo("1.000");
        assertThat(feed.tocCalls.get()).isEqualTo(1);
        assertThat(feed.tocAts).containsExactly(KST0);
        assertThat(feed.bodyCalls.get()).isZero();
        assertThat(cache.get(MdmTargetType.RULE, "R").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isPresent();

        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        assertThat(feed.tocCalls.get()).as("두 번째는 캐시").isEqualTo(1);
    }

    @Test
    void 목차가_있고_고른_버전의_본문이_없으면_본문만_묶어_받는다() {
        feed.put(MdmTargetType.RULE, "S", List.of(rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        service.lookupAt(MdmTargetType.RULE, List.of("R", "S"), clock.instant().plus(Duration.ofHours(2))); // 목차 + 2.000·1.000

        service.lookupAt(MdmTargetType.RULE, List.of("R", "S"), PAST);

        assertThat(feed.tocCalls.get()).isEqualTo(1);
        assertThat(feed.bodyCalls.get()).as("R@1.000 만 미스 — S@1.000 은 current 로 받았다").isEqualTo(1);
        assertThat(feed.bodyKeys.get(0)).containsExactly(new MdmBodyKey("R", "1.000"));
    }

    @Test
    void 적용_버전_없음은_없음과_다르다() {
        feed.put(MdmTargetType.RULE, "LATER", List.of(rule("1.000", LocalDateTime.parse("2027-01-01T00:00:00"), null)));

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("LATER", "NO"), T0);

        assertThat(r.found().get("LATER").ver()).isNull();
        assertThat(r.found().get("LATER").body()).isNull();
        assertThat(r.found().get("LATER").toc().versions()).hasSize(1);
        assertThat(r.missing()).containsExactly("NO");
        assertThat(r.unavailable()).isEmpty();
    }

    @Test
    void NOT_RELEASED_면_묶음을_지우고_목차부터_한_번만_다시_받는다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2))); // 목차 + 2.000
        feed.notReleasedOnce.add(new MdmBodyKey("R", "1.000"));

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), PAST);

        assertThat(r.found().get("R").ver()).isEqualTo("1.000");
        assertThat(feed.tocCalls.get()).as("처음 + 재시도").isEqualTo(2);
    }

    @Test
    void 두_번째에도_어긋나면_받을_수_없음이고_없음으로_캐시하지_않는다() {
        feed.omitCurrent = true;
        feed.notReleasedAlways.add(new MdmBodyKey("R", "1.000"));

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);

        assertThat(r.unavailable()).containsExactly("R");
        assertThat(r.missing()).isEmpty();
        assertThat(feed.tocCalls.get()).isEqualTo(2);
        assertThat(feed.bodyCalls.get()).isEqualTo(2);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).as("본문을 없음·빈 값으로 캐시하지 않는다").isEmpty();
        MdmMetaCache.Entry head = cache.get(MdmTargetType.RULE, "R").orElseThrow();
        assertThat(head.absent()).as("목차를 없음으로 덮지 않는다").isFalse();
        assertThat(head.part()).isEqualTo(MdmMetaCache.Part.TOC);
    }

    @Test
    void 예약_버전의_적용_시작이_지나면_쓰기_없이_새_버전_본문을_받는다() {
        assertThat(service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant()).found().get("R").ver()).isEqualTo("1.000");
        clock.advance(Duration.ofMinutes(30));
        service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant()); // 목차 조회 — 유휴 수명(60분)을 연장한다

        clock.advance(Duration.ofMinutes(30)); // KST 01:00 — 2.000 적용 시작
        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant());

        assertThat(r.found().get("R").ver()).isEqualTo("2.000");
        assertThat(feed.tocCalls.get()).as("목차는 캐시").isEqualTo(1);
        assertThat(feed.bodyCalls.get()).isEqualTo(1);
    }

    @Test
    void MDM_이_멈췄는데_고른_버전_본문이_없으면_다른_버전으로_대신하지_않고_받을_수_없음이다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0); // 목차 + 1.000
        feed.fetchError = new MdmUnavailableException("MDM 연결 실패");

        MdmMetaService.MdmAtLookup r = service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2)));

        assertThat(r.unavailable()).containsExactly("R");
        assertThat(service.lookupAt(MdmTargetType.RULE, List.of("R"), T0).found().get("R").ver()).as("캐시에 있는 본문은 계속 쓴다").isEqualTo("1.000");
    }

    @Test
    void 같은_목차_동시_적재는_한_번이고_같은_코드의_두_버전_본문은_따로_받는다() throws Exception {
        feed.omitCurrent = true;
        feed.fetchGate = new CountDownLatch(1);
        CompletableFuture<MdmMetaService.MdmAtLookup> a = CompletableFuture.supplyAsync(() -> service.lookupAt(MdmTargetType.RULE, List.of("R"), PAST));
        assertThat(feed.fetchEntered.await(5, TimeUnit.SECONDS)).isTrue();
        CompletableFuture<MdmMetaService.MdmAtLookup> b = CompletableFuture.supplyAsync(() ->
                service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2))));
        Thread.sleep(100);
        feed.fetchGate.countDown();

        assertThat(a.get(5, TimeUnit.SECONDS).found().get("R").ver()).isEqualTo("1.000");
        assertThat(b.get(5, TimeUnit.SECONDS).found().get("R").ver()).isEqualTo("2.000");
        assertThat(feed.tocCalls.get()).isEqualTo(1);
        assertThat(feed.bodyKeys.stream().flatMap(List::stream).toList())
                .containsExactlyInAnyOrder(new MdmBodyKey("R", "1.000"), new MdmBodyKey("R", "2.000"));
    }

    @Test
    void 옛_MDM_응답이면_전_이력에서_목차와_본문을_만들어_캐시하고_전_이력은_남기지_않는다() {
        FakeMetaFeed old = new FakeMetaFeed(); // versioned 아님 — default 메서드가 fetch 로 전 이력을 받는다
        old.put(MdmTargetType.CODE, "C", codeRows());
        MdmMetaService s = new MdmMetaService(old, cache, clock, true);

        MdmMetaService.MdmAt at = s.oneAt(MdmTargetType.CODE, "C", T0).orElseThrow();

        assertThat(at.ver()).isEqualTo("2.000");
        MdmCodeVersion body = (MdmCodeVersion) at.body();
        assertThat(body.isSliced()).isTrue();
        assertThat(body.members("TB")).contains(java.util.Set.of("B"));
        assertThat(cache.get(MdmTargetType.CODE, "C").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(cache.getBody(MdmTargetType.CODE, "C", "2.000")).isPresent();
        assertThat(old.fetchCalls.get()).isEqualTo(1);
        assertThat(at.toc().versions()).as("DRAFT 는 목차에 없다").extracting(MdmTocVersion::ver)
                .containsExactly(new BigDecimal("1.000"), new BigDecimal("2.000"));
    }

    @Test
    void 옛_MDM_본문_응답이면_전_이력에서_그_버전을_잘라_캐시한다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.CODE, "C", codeRows());
        MdmMetaService s = new MdmMetaService(old, cache, clock, true);
        s.oneAt(MdmTargetType.CODE, "C", T0); // 목차 + 2.000

        MdmMetaService.MdmAt at = s.oneAt(MdmTargetType.CODE, "C", Instant.parse("2026-02-28T15:00:00Z")).orElseThrow(); // KST 03-01 — 1.000

        assertThat(at.ver()).isEqualTo("1.000");
        assertThat(old.fetchCalls.get()).as("목차 한 번 + 본문 한 번(둘 다 옛 view)").isEqualTo(2);
        assertThat(((MdmCodeVersion) at.body()).isSliced()).isTrue();
        assertThat(((MdmCodeVersion) at.body()).members("TB")).as("TB 는 2.000 부터").contains(java.util.Set.of());
        assertThat(cache.getBody(MdmTargetType.CODE, "C", "1.000")).isPresent();
        assertThat(cache.getBody(MdmTargetType.CODE, "C", "2.000")).isPresent();
    }

    @Test
    void 옛_MDM_에_물었는데_정의가_사라졌으면_목차부터_다시_받고_없음이다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.CODE, "C", codeRows());
        MdmMetaService s = new MdmMetaService(old, cache, clock, true);
        s.oneAt(MdmTargetType.CODE, "C", T0); // 목차 + 2.000
        old.values.get(MdmTargetType.CODE).remove("C");

        MdmMetaService.MdmAtLookup r = s.lookupAt(MdmTargetType.CODE, List.of("C"), Instant.parse("2026-02-28T15:00:00Z"));

        assertThat(r.missing()).containsExactly("C");
        assertThat(r.unavailable()).isEmpty();
        assertThat(old.fetchCalls.get()).as("목차 + 본문(정의 없음 = 목차가 낡음) + 재시도 목차").isEqualTo(3);
        assertThat(cache.get(MdmTargetType.CODE, "C").orElseThrow().absent()).isTrue();
    }

    @Test
    void versioned_feed_off_는_전_이력_한_키로_캐시하고_코드는_자르지_않는다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.CODE, "C", codeRows());
        old.put(MdmTargetType.RULE, "R", feed.values.get(MdmTargetType.RULE).get("R"));
        MdmMetaService off = new MdmMetaService(old, cache, clock); // 3인자 = off

        MdmMetaService.MdmAt code = off.oneAt(MdmTargetType.CODE, "C", T0).orElseThrow();
        MdmMetaService.MdmAt ruleAt = off.oneAt(MdmTargetType.RULE, "R", T0).orElseThrow();

        assertThat(off.versioned()).isFalse();
        assertThat(((MdmCodeVersion) code.body()).isSliced()).isFalse();
        assertThat(((MdmCodeVersion) code.body()).members("TB")).isEmpty();
        assertThat(ruleAt.ver()).isEqualTo("1.000");
        assertThat(cache.get(MdmTargetType.CODE, "C").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.VALUE);
        assertThat(cache.bodySizes().get(MdmTargetType.CODE)).isZero();
    }

    @Test
    void 버전_경로에서_값_입구에_버전_대상을_넘기면_막는다() {
        assertThatThrownBy(() -> service.lookup(MdmTargetType.RULE, List.of("R"))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.one(MdmTargetType.CODE, "C")).isInstanceOf(IllegalStateException.class);
        assertThat(service.lookup(MdmTargetType.COLUMN, List.of("X")).missing()).containsExactly("X");
    }

    @Test
    void 캐시만_읽기는_목차와_본문을_따로_알린다() {
        assertThat(service.cachedToc(MdmTargetType.RULE, "R").cached()).isFalse();
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        assertThat(service.cachedToc(MdmTargetType.RULE, "R").value()).isInstanceOf(MdmToc.class);
        assertThat(service.cachedBody(MdmTargetType.RULE, "R", "1.000").cached()).isTrue();
        assertThat(service.cachedBody(MdmTargetType.RULE, "R", "2.000").cached()).isFalse();
        assertThat(feed.tocCalls.get()).isEqualTo(1);
    }

    @Test
    void reloadAt_정의_키는_목차와_최종_본문을_본문_키는_그_본문만_다시_받는다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        service.lookupAt(MdmTargetType.RULE, List.of("R"), clock.instant().plus(Duration.ofHours(2))); // 2.000 본문
        int tocs = feed.tocCalls.get();
        int bodies = feed.bodyCalls.get();

        MdmMetaService.MdmAtLookup one = service.reloadAt(MdmTargetType.RULE, List.of("R@2.000"), T0);
        assertThat(one.found()).containsOnlyKeys("R@2.000");
        assertThat(feed.tocCalls.get()).isEqualTo(tocs);
        assertThat(feed.bodyCalls.get()).isEqualTo(bodies + 1);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).as("다른 버전은 그대로").isPresent();

        MdmMetaService.MdmAtLookup all = service.reloadAt(MdmTargetType.RULE, List.of("R"), T0);
        assertThat(all.found()).containsOnlyKeys("R");
        assertThat(feed.tocCalls.get()).isEqualTo(tocs + 1);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "2.000")).as("옛 본문은 다시 받지 않는다").isEmpty();
    }

    @Test
    void off_reloadAt_은_요청한_논리_키로_답하고_목차에_없는_버전_본문_키는_없음이다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.RULE, "R", feed.values.get(MdmTargetType.RULE).get("R"));
        old.failedKeys.put("F", "깨진 정의");
        MdmMetaService off = new MdmMetaService(old, cache, clock);

        MdmMetaService.MdmAtLookup r = off.reloadAt(MdmTargetType.RULE,
                List.of("R@1.000", "R@9.000", "NO@1.000", "NO", "F@1.000", "R"), T0);

        assertThat(r.found()).containsOnlyKeys("R", "R@1.000");
        assertThat(r.found().get("R@1.000").ver()).isEqualTo("1.000");
        assertThat(verOf(r.found().get("R@1.000"))).isEqualByComparingTo("1.000");
        assertThat(r.missing()).as("버전 경로와 같게 정의 키 먼저, 그다음 본문 키 — 요청한 논리 키 그대로").containsExactly("NO", "R@9.000", "NO@1.000");
        assertThat(r.unavailable()).containsExactly("F@1.000");
    }

    @Test
    void off_reloadAt_코드도_목차에_없는_버전_본문_키는_없음이다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.CODE, "C", codeRows());
        MdmMetaService off = new MdmMetaService(old, cache, clock);

        MdmMetaService.MdmAtLookup r = off.reloadAt(MdmTargetType.CODE, List.of("C@1.000", "C@2.001", "C@5.000"), T0);

        assertThat(r.found()).containsOnlyKeys("C@1.000");
        assertThat(r.missing()).as("DRAFT 2.001 은 목차에 없다").containsExactly("C@2.001", "C@5.000");
    }

    @Test
    void off_경로는_값_하나를_해석할_수_없으면_그_키만_받을_수_없음이다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.RULE_SET, "S", List.of(MdmValidatorTest.set("S", "R1")));
        old.put(MdmTargetType.RULE_SET, "NULL_VER", List.of(new kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition(
                "NULL_VER", null, LocalDateTime.parse("2026-01-01T00:00:00"), null, List.of("R1"),
                kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus.INUSE, null)));
        old.put(MdmTargetType.RULE, "R", feed.values.get(MdmTargetType.RULE).get("R"));
        old.put(MdmTargetType.RULE, "FOUR", List.of(rule("1.0001", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        MdmMetaService off = new MdmMetaService(old, cache, clock);

        MdmMetaService.MdmAtLookup sets = off.lookupAt(MdmTargetType.RULE_SET, List.of("NULL_VER", "S", "NO"), T0);
        assertThat(sets.found()).containsOnlyKeys("S");
        assertThat(sets.unavailable()).containsExactly("NULL_VER");
        assertThat(sets.missing()).containsExactly("NO");

        MdmMetaService.MdmAtLookup rules = off.reloadAt(MdmTargetType.RULE, List.of("FOUR", "R", "FOUR@1.000"), T0);
        assertThat(rules.found()).containsOnlyKeys("R");
        assertThat(rules.unavailable()).containsExactly("FOUR", "FOUR@1.000");

        assertThatThrownBy(() -> off.toc(MdmTargetType.RULE_SET, "NULL_VER")).isInstanceOf(MdmUnavailableException.class);
        assertThatThrownBy(() -> off.oneAt(MdmTargetType.RULE, "FOUR", T0)).isInstanceOf(MdmUnavailableException.class);
    }

    /** RELEASED 1.000 [2026-01-01, 2026-07-01)·2.000 [2026-07-01, 열린 끝), DRAFT 2.001(초안 사본 C). TABLE TB(2.000~): B. */
    static CodeRows codeRows() {
        BigDecimal v1 = new BigDecimal("1.000");
        BigDecimal v2 = new BigDecimal("2.000");
        BigDecimal d = new BigDecimal("2.001");
        BigDecimal open = new BigDecimal("9999.000");
        return new CodeRows(new CodeHeader("C", "INUSE"),
                List.of(new CodeVersionRow(v1, "RELEASED", LocalDateTime.parse("2026-01-01T00:00:00"), LocalDateTime.parse("2026-07-01T00:00:00")),
                        new CodeVersionRow(v2, "RELEASED", LocalDateTime.parse("2026-07-01T00:00:00"), LocalDateTime.parse("9999-12-31T00:00:00")),
                        new CodeVersionRow(d, "DRAFT", null, null)),
                List.of(item("A", v1, open), item("B", v2, open), item("C", d, open)),
                List.of(new CodeCateRow("BASE", v1, open, "REGEX", ".*", "CODE"), new CodeCateRow("TB", v2, open, "TABLE", null, null)),
                List.of(new CodeCateItemRow("TB", "B", v2, open)));
    }

    private static CodeItemRow item(String code, BigDecimal from, BigDecimal to) {
        return new CodeItemRow(code, from, to, code + " 이름", null, 1, Arrays.asList(new String[5]), Arrays.asList(new String[10]));
    }
}
