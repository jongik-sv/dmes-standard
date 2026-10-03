package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.code.DefaultCodeResolver;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 캐시만 읽는 엔진 조회기의 목차·본문(스펙 §5.2-5)과 §5.4 불변식: 목차는 있는데 본문이 없으면 빈 값을 주지 않고 부재 기록({@code CODE:X@ver})을
 * 남긴 뒤 {@link MdmUnavailableException} 을 던진다 — TABLE 소속이 조용히 false 가 되지 않는다.
 */
class MdmCachedDefinitionsTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z");
    private static final LocalDateTime KST0 = LocalDateTime.parse("2026-10-03T00:00:00");
    private FakeMetaFeed feed;
    private MdmMetaCache cache;
    private MdmMetaService service;
    private MdmCachedDefinitions cached;

    @BeforeEach
    void setUp() {
        MutableClock clock = new MutableClock(T0);
        feed = new FakeMetaFeed().versioned();
        feed.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        feed.put(MdmTargetType.RULE, "R", List.of(MdmDefinitionLookupTest.rule("1.000", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        cache = new MdmMetaCache(1000, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
        service = new MdmMetaService(feed, cache, clock, true);
        cached = new MdmCachedDefinitions(service);
    }

    @Test
    void 목차는_있고_본문이_없으면_소속도_행도_빈_값_대신_부재_기록과_예외다() {
        service.lookupAt(MdmTargetType.CODE, List.of("C"), T0);
        cache.evictLocalBody(MdmTargetType.CODE, "C", "2.000");
        MdmCachedDefinitions.MissLog log = new MdmCachedDefinitions.MissLog();

        assertThatThrownBy(() -> MdmCachedDefinitions.recording(log, () -> cached.codes("C", new BigDecimal("2.000"), "TB")))
                .isInstanceOf(MdmUnavailableException.class);
        assertThat(log.since(0)).containsExactly("CODE:C@2.000");
        for (CodeEffLookup eff : List.of((CodeEffLookup) cached, CodeEffLookup.NONE)) {
            DefaultCodeResolver r = new DefaultCodeResolver(cached, eff);
            assertThatThrownBy(() -> r.isMember("C", "TB", "B", KST0)).as("조용히 false 가 아니다").isInstanceOf(MdmUnavailableException.class);
        }
        assertThat(feed.bodyCalls.get()).as("평가 중에는 MDM 을 부르지 않는다").isZero();
    }

    @Test
    void 목차에_없는_버전의_소속도_빈_값_대신_부재_기록과_예외다() {
        service.lookupAt(MdmTargetType.CODE, List.of("C"), T0);
        MdmCachedDefinitions.MissLog log = new MdmCachedDefinitions.MissLog();

        assertThatThrownBy(() -> MdmCachedDefinitions.recording(log, () -> cached.codes("C", new BigDecimal("2.001"), "TB")))
                .as("DRAFT 2.001 은 목차에 없다 — MdmDefinitionLookup.codes 와 같게 던진다").isInstanceOf(MdmUnavailableException.class);
        assertThat(log.since(0)).containsExactly("CODE:C@2.001");
    }

    @Test
    void 목차가_없으면_코드_부재_기록과_예외다() {
        MdmCachedDefinitions.MissLog log = new MdmCachedDefinitions.MissLog();
        assertThatThrownBy(() -> MdmCachedDefinitions.recording(log, () -> cached.code("C"))).isInstanceOf(MdmUnavailableException.class);
        assertThat(log.since(0)).containsExactly("CODE:C");
    }

    @Test
    void 룰은_목차로_고른_버전_본문이_없으면_빈_값과_부재_기록이다() {
        service.lookupAt(MdmTargetType.RULE, List.of("R"), T0);
        cache.evictLocalBody(MdmTargetType.RULE, "R", "1.000");
        MdmCachedDefinitions.MissLog log = new MdmCachedDefinitions.MissLog();

        assertThat(MdmCachedDefinitions.recording(log, () -> cached.rule("R", T0))).isEmpty();
        assertThat(log.since(0)).containsExactly("RULE:R@1.000");
    }

    @Test
    void 캐시에_다_있으면_판정하고_MDM_을_부르지_않는다() {
        service.lookupAt(MdmTargetType.CODE, List.of("C"), T0);
        int calls = feed.tocCalls.get() + feed.bodyCalls.get();
        DefaultCodeResolver r = new DefaultCodeResolver(cached, cached);
        assertThat(r.isMember("C", "TB", "B", KST0)).isTrue();
        assertThat(r.isMember("C", "TB", "A", KST0)).isFalse();
        assertThat(feed.tocCalls.get() + feed.bodyCalls.get()).isEqualTo(calls);
    }

    @Test
    void off_전_이력은_소속을_계산해_두지_않았다는_빈_값이고_해석기가_전체_행으로_판정한다() {
        FakeMetaFeed old = new FakeMetaFeed();
        old.put(MdmTargetType.CODE, "C", MdmMetaServiceVersionedTest.codeRows());
        MdmMetaService off = new MdmMetaService(old, cache, new MutableClock(T0));
        off.lookupAt(MdmTargetType.CODE, List.of("C"), T0);
        MdmCachedDefinitions offCached = new MdmCachedDefinitions(off);

        assertThat(offCached.codes("C", new BigDecimal("2.000"), "TB")).isEmpty();
        assertThat(new DefaultCodeResolver(offCached, offCached).isMember("C", "TB", "B", KST0)).isTrue();
    }
}
