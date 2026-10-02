package com.dongkuk.dmes.cactus.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/** spec §5.2·§5.3-5·§7 「cactus 캐시」 — 적재·없음·상한·max-age·지움 기록. */
class MdmMetaCacheTest {

    private MutableClock clock;
    private MdmMetaCache cache;

    @BeforeEach
    void setUp() {
        clock = new MutableClock(Instant.parse("2026-10-02T00:00:00Z"));
        cache = new MdmMetaCache(3, Duration.ofMinutes(60), clock);
        cache.clear(5);
    }

    @Test
    void 값과_없음을_돌려주고_조회_수를_센다() {
        cache.put(MdmTargetType.COLUMN, "A", "값", cache.ticket());
        cache.put(MdmTargetType.COLUMN, "X", null, cache.ticket());

        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("값");
        assertThat(cache.get(MdmTargetType.COLUMN, "X").orElseThrow().absent()).isTrue();
        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().hits()).isEqualTo(2L);
        assertThat(cache.get(MdmTargetType.DOMAIN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.COLUMN, "A").get().loadSeq()).isEqualTo(5);
    }

    @Test
    void max_age_가_지난_항목은_조회_때_버린다() {
        cache.put(MdmTargetType.RULE, "R", "v", cache.ticket());
        clock.advance(Duration.ofMinutes(59));
        assertThat(cache.get(MdmTargetType.RULE, "R")).isPresent();
        clock.advance(Duration.ofMinutes(1));
        assertThat(cache.get(MdmTargetType.RULE, "R")).isEmpty();
        assertThat(cache.sizes().get(MdmTargetType.RULE)).isZero();
    }

    @Test
    void max_entries_를_넘으면_적재가_오래된_순으로_지운다() {
        cache.put(MdmTargetType.COLUMN, "A", "a", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.DOMAIN, "B", "b", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.RULE, "C", "c", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.CODE, "D", "d", cache.ticket());

        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.CODE, "D")).isPresent();
        Map<MdmTargetType, Integer> sizes = cache.sizes();
        assertThat(sizes.values().stream().mapToInt(Integer::intValue).sum()).isEqualTo(3);
    }

    @Test
    void 적재_시작_뒤_폴링이_지운_키는_캐시에_넣지_않는다() {
        MdmMetaCache.Ticket ticket = cache.ticket();
        cache.evict(MdmTargetType.COLUMN, "A", 6);
        cache.markApplied(6);

        assertThat(cache.put(MdmTargetType.COLUMN, "A", "옛 값", ticket)).isFalse();
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.put(MdmTargetType.COLUMN, "B", "b", ticket)).isTrue();
        assertThat(cache.put(MdmTargetType.COLUMN, "A", "새 값", cache.ticket())).isTrue();
    }

    @Test
    void 캐시를_통째로_비우면_그_전에_시작한_적재는_넣지_않는다() {
        MdmMetaCache.Ticket ticket = cache.ticket();
        cache.clear(9);
        assertThat(cache.put(MdmTargetType.DOMAIN, "1", "v", ticket)).isFalse();
        assertThat(cache.appliedSeq()).isEqualTo(9);
    }

    @Test
    void 지움_기록은_5분이_지나면_markApplied_때_정리된다() {
        cache.evict(MdmTargetType.COLUMN, "A", 6);
        cache.markApplied(6);
        assertThat(cache.tombstoneCount()).isEqualTo(1);
        clock.advance(Duration.ofMinutes(6));
        cache.markApplied(6);
        assertThat(cache.tombstoneCount()).isZero();
    }

    @Test
    void entries_는_대상_종류와_키_부분_일치로_거르고_남은_수명을_준다() {
        cache.put(MdmTargetType.COLUMN, "COIL_THK", "t", cache.ticket());
        cache.put(MdmTargetType.COLUMN, "COIL_WID", null, cache.ticket());
        cache.put(MdmTargetType.DOMAIN, "COIL", "d", cache.ticket());
        clock.advance(Duration.ofMinutes(10));

        var rows = cache.entries(MdmTargetType.COLUMN, "coil_t");

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).key()).isEqualTo("COIL_THK");
        assertThat(rows.get(0).remainingSeconds()).isEqualTo(50 * 60);
        assertThat(cache.entries(null, null)).hasSize(3);
    }
}
