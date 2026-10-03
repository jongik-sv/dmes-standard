package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * D-154 — 묶음 구조(스펙 §5.1)·항목별 수명(§5.5)·정의 키 지움 기록(§5.6). 시계 0 시 = KST 2026-10-03 00:00. 목차 R: 1.000 [2026-01-01, 01:00),
 * 2.000 [01:00, 열린 끝) — 예약 버전 2.000 의 적용 시작이 60분 뒤다.
 */
class MdmMetaCacheVersionedTest {

    private static final Instant T0 = Instant.parse("2026-10-02T15:00:00Z"); // KST 2026-10-03 00:00
    private MutableClock clock;
    private MdmMetaCache cache;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(T0);
        cache = new MdmMetaCache(100, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        cache.clear(0);
    }

    static MdmToc toc() {
        return new MdmToc(null, List.of(
                new MdmTocVersion(new BigDecimal("1.000"), "RELEASED", LocalDateTime.parse("2026-01-01T00:00:00"),
                        LocalDateTime.parse("2026-10-03T01:00:00")),
                new MdmTocVersion(new BigDecimal("2.000"), "RELEASED", LocalDateTime.parse("2026-10-03T01:00:00"), null)));
    }

    private static Map<MdmBodyKey, Object> bodies(String key, String... vers) {
        Map<MdmBodyKey, Object> out = new LinkedHashMap<>();
        for (String v : vers) {
            out.put(new MdmBodyKey(key, v), "본문 " + key + "@" + v);
        }
        return out;
    }

    private MdmMetaCache.EntryView view(String logical) {
        return cache.entries(MdmTargetType.RULE, null).stream().filter(v -> v.key().equals(logical)).findFirst().orElseThrow();
    }

    @Test
    void 목차와_본문은_한_묶음이고_entries_에_논리_키_구분_ver_최종_여부로_보인다() {
        cache.putTocs(MdmTargetType.RULE, Map.of("R", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), cache.ticket());

        assertThat(cache.get(MdmTargetType.RULE, "R").orElseThrow().part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000").orElseThrow().value()).isEqualTo("본문 R@1.000");
        assertThat(cache.entries(MdmTargetType.RULE, null)).extracting(MdmMetaCache.EntryView::key).containsExactly("R", "R@1.000");
        assertThat(view("R").part()).isEqualTo(MdmMetaCache.Part.TOC);
        assertThat(view("R").current()).isNull();
        assertThat(view("R@1.000").part()).isEqualTo(MdmMetaCache.Part.BODY);
        assertThat(view("R@1.000").ver()).isEqualTo("1.000");
        assertThat(view("R@1.000").current()).isTrue();
        assertThat(cache.entries(MdmTargetType.RULE, "r@1.0")).extracting(MdmMetaCache.EntryView::key).containsExactly("R@1.000");
        assertThat(cache.peek(MdmTargetType.RULE, "R@1.000").orElseThrow().ver()).isEqualTo("1.000");
        assertThat(cache.sizes().get(MdmTargetType.RULE)).isEqualTo(2);
        assertThat(cache.bodySizes().get(MdmTargetType.RULE)).isEqualTo(1);
    }

    @Test
    void 예약_버전의_적용_시작이_지나면_쓰기_없이_최종이_바뀌고_수명도_바뀐다() {
        cache.putTocs(MdmTargetType.RULE, Map.of("R", toc()), cache.ticket());
        clock.advance(Duration.ofMinutes(55));
        cache.get(MdmTargetType.RULE, "R"); // 목차를 조회해 유휴 수명을 연장한다
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000", "2.000"), cache.ticket());

        clock.advance(Duration.ofSeconds(4 * 60 + 59)); // 00:59:59 — 경계 직전
        assertThat(view("R@1.000").current()).isTrue();
        assertThat(view("R@2.000").current()).as("예약 버전은 옛 수명").isFalse();

        clock.advance(Duration.ofSeconds(1)); // 01:00:00 — 경계
        assertThat(view("R@1.000").current()).isFalse();
        assertThat(view("R@2.000").current()).isTrue();

        clock.advance(Duration.ofMinutes(5)); // 01:05 — 1.000 은 마지막 조회(00:55) + 10분에 만료
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "2.000")).as("새 최종은 60분").isPresent();
    }

    @Test
    void 목차가_없는_본문은_옛_버전_수명이다() {
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), cache.ticket());
        clock.advance(Duration.ofMinutes(10));
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "1.000")).isEmpty();
    }

    @Test
    void 없는_정의는_목차_자리에_없음으로_캐시한다() {
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        tocs.put("NO", null);
        cache.putTocs(MdmTargetType.RULE, tocs, cache.ticket());
        MdmMetaCache.Entry e = cache.get(MdmTargetType.RULE, "NO").orElseThrow();
        assertThat(e.absent()).isTrue();
        assertThat(e.part()).isEqualTo(MdmMetaCache.Part.TOC);
    }

    @Test
    void 폴러_지움은_목차와_본문_전부를_지우고_지움_기록은_정의_키_하나다_그_전에_시작한_본문_적재는_막는다() {
        cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000", "2.000"), cache.ticket());
        MdmMetaCache.Ticket before = cache.ticket();

        cache.evict(MdmTargetType.CODE, "X", 5);
        cache.markApplied(5);

        assertThat(cache.get(MdmTargetType.CODE, "X")).isEmpty();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "1.000")).isEmpty();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "2.000")).isEmpty();
        assertThat(cache.tombstoneCount()).isEqualTo(1);
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), before)).as("늦게 도착한 옛 본문").isEmpty();
        assertThat(cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), before)).isEmpty();
        MdmMetaCache.Ticket after = cache.ticket();
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), after)).hasSize(1);
        assertThat(cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), after)).containsExactly("X");
    }

    @Test
    void 정의_키_표지만으로도_그_전에_시작한_본문_적재를_막고_지운_뒤_시작한_적재는_넣는다() {
        cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), cache.ticket());
        MdmMetaCache.Ticket before = cache.ticket();

        cache.evictLocal(MdmTargetType.CODE, "X"); // 순번 없는 지움(관리 화면 load·NOT_RELEASED 재시도) — 표지만 오른다

        assertThat(before.appliedSeq()).as("순번으로는 막히지 않는다").isEqualTo(cache.appliedSeq());
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), before)).as("지움 전에 시작한 본문 적재").isEmpty();
        assertThat(cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), before)).isEmpty();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "1.000")).isEmpty();
        MdmMetaCache.Ticket after = cache.ticket();
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), after)).hasSize(1);
        assertThat(cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), after)).containsExactly("X");
    }

    @Test
    void 살아_있는_묶음에_목차를_바꿔_넣으면_최종_버전을_곧바로_다시_고른다() {
        MdmToc a = new MdmToc(null, List.of(
                new MdmTocVersion(new BigDecimal("1.000"), "RELEASED", LocalDateTime.parse("2026-01-01T00:00:00"), null)));
        cache.putTocs(MdmTargetType.RULE, Map.of("R", a), cache.ticket());
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000", "2.000"), cache.ticket());
        assertThat(view("R@1.000").current()).isTrue();
        assertThat(view("R@2.000").current()).isFalse();

        MdmToc b = new MdmToc(null, List.of( // 2.000 의 적용 시작이 이미 지났다 — 목차 A 에는 다음 경계가 없어 옛 판정이 남으면 영영 1.000 이다
                new MdmTocVersion(new BigDecimal("1.000"), "RELEASED", LocalDateTime.parse("2026-01-01T00:00:00"),
                        LocalDateTime.parse("2026-10-02T00:00:00")),
                new MdmTocVersion(new BigDecimal("2.000"), "RELEASED", LocalDateTime.parse("2026-10-02T00:00:00"), null)));
        cache.putTocs(MdmTargetType.RULE, Map.of("R", b), cache.ticket());

        assertThat(view("R@2.000").current()).isTrue();
        assertThat(view("R@1.000").current()).isFalse();
        assertThat(view("R@2.000").remainingSeconds()).as("최종 본문은 max-idle").isEqualTo(60 * 60);
        assertThat(view("R@1.000").remainingSeconds()).as("옛 버전 본문은 old-version-max-idle").isEqualTo(10 * 60);
    }

    @Test
    void 본문_하나만_지우면_목차와_다른_버전은_남고_그_버전의_앞선_적재만_막는다() {
        cache.putTocs(MdmTargetType.CODE, Map.of("X", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000", "2.000"), cache.ticket());
        MdmMetaCache.Ticket before = cache.ticket();

        cache.evictLocalBody(MdmTargetType.CODE, "X", "1.000");

        assertThat(cache.get(MdmTargetType.CODE, "X")).isPresent();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "2.000")).isPresent();
        assertThat(cache.getBody(MdmTargetType.CODE, "X", "1.000")).isEmpty();
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), before)).isEmpty();
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "2.000"), before)).hasSize(1);
        assertThat(cache.putBodies(MdmTargetType.CODE, bodies("X", "1.000"), cache.ticket())).hasSize(1);
    }

    @Test
    void 상한은_목차와_본문을_합해_세고_오래_안_쓴_본문부터_줄인다() {
        MdmMetaCache small = new MdmMetaCache(4, Duration.ofHours(24), Duration.ofMinutes(60), Duration.ofMinutes(10), clock);
        small.clear(0);
        small.putTocs(MdmTargetType.RULE, Map.of("R", toc()), small.ticket());
        small.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), small.ticket());
        clock.advance(Duration.ofSeconds(1));
        small.putBodies(MdmTargetType.RULE, bodies("R", "2.000"), small.ticket());
        clock.advance(Duration.ofSeconds(1));
        small.get(MdmTargetType.RULE, "R");
        small.getBody(MdmTargetType.RULE, "R", "1.000");
        clock.advance(Duration.ofSeconds(1));

        small.putTocs(MdmTargetType.RULE, Map.of("S", toc()), small.ticket());
        small.putBodies(MdmTargetType.RULE, bodies("S", "1.000"), small.ticket()); // 5개 → 95%(3개)까지

        assertThat(small.sizes().get(MdmTargetType.RULE)).isEqualTo(3);
        assertThat(small.getBody(MdmTargetType.RULE, "R", "2.000")).as("가장 오래 안 쓴 본문").isEmpty();
    }

    @Test
    void 폴링의_쓸기는_만료된_본문과_빈_묶음을_맵에서_뺀다() {
        cache.putBodies(MdmTargetType.RULE, bodies("R", "1.000"), cache.ticket());
        clock.advance(Duration.ofMinutes(11));
        cache.markApplied(1);
        assertThat(cache.storedCount(MdmTargetType.RULE)).isZero();
        assertThat(cache.bytes().get(MdmTargetType.RULE)).isZero();
    }

    @Test
    void entries_와_peek_은_본문_수명을_연장하지_않는다() {
        cache.putTocs(MdmTargetType.RULE, Map.of("R", toc()), cache.ticket());
        cache.putBodies(MdmTargetType.RULE, bodies("R", "2.000"), cache.ticket()); // 예약 버전 → 10분
        clock.advance(Duration.ofMinutes(9));
        cache.entries(MdmTargetType.RULE, null);
        cache.peek(MdmTargetType.RULE, "R@2.000");
        clock.advance(Duration.ofMinutes(1));
        assertThat(cache.getBody(MdmTargetType.RULE, "R", "2.000")).isEmpty();
        assertThat(view("R").remainingSeconds()).isEqualTo(50 * 60);
    }
}
