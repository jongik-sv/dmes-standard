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
    void max_entries_를_넘으면_적재가_오래된_순으로_95퍼센트까지_지운다() {
        cache.put(MdmTargetType.COLUMN, "A", "a", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.DOMAIN, "B", "b", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.RULE, "C", "c", cache.ticket());
        clock.advance(Duration.ofSeconds(1));
        cache.put(MdmTargetType.CODE, "D", "d", cache.ticket());

        // 상한 3 → 목표 max(1, floor(3 × 0.95)) = 2
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.get(MdmTargetType.DOMAIN, "B")).isEmpty();
        assertThat(cache.get(MdmTargetType.RULE, "C")).isPresent();
        assertThat(cache.get(MdmTargetType.CODE, "D")).isPresent();
        assertThat(total()).isEqualTo(2);
        assertThat(cache.trimPasses()).isEqualTo(1);
    }

    @Test
    void 상한을_넘는_묶음_적재는_한_번만_정리하고_상한_아래로_줄인다() {
        MdmMetaCache big = new MdmMetaCache(20, Duration.ofMinutes(60), clock);
        big.clear(0);
        for (int i = 0; i < 20; i++) {
            big.put(MdmTargetType.COLUMN, "OLD" + i, "o", big.ticket());
            clock.advance(Duration.ofSeconds(1));
        }
        assertThat(big.trimPasses()).isZero();

        Map<String, Object> batch = new java.util.LinkedHashMap<>();
        for (int i = 0; i < 8; i++) {
            batch.put("NEW" + i, i % 2 == 0 ? "n" : null);
        }
        java.util.Set<String> put = big.putAll(MdmTargetType.COLUMN, batch, big.ticket());

        assertThat(put).hasSize(8);
        assertThat(big.trimPasses()).as("키 8개 묶음이라도 정리는 한 번").isEqualTo(1);
        int size = big.sizes().get(MdmTargetType.COLUMN);
        assertThat(size).isLessThanOrEqualTo(20).isEqualTo(19); // 목표 floor(20 × 0.95) = 19
        for (int i = 0; i < 8; i++) {
            assertThat(big.get(MdmTargetType.COLUMN, "NEW" + i)).as("방금 넣은 키는 남는다").isPresent();
        }
        assertThat(big.get(MdmTargetType.COLUMN, "OLD0")).isEmpty();
    }

    @Test
    void 상한_정리는_수명이_지난_항목을_먼저_모두_지우고_새_항목은_남긴다() {
        MdmMetaCache small = new MdmMetaCache(5, Duration.ofMinutes(60), clock);
        small.clear(0);
        small.put(MdmTargetType.COLUMN, "E1", "x", small.ticket());
        small.put(MdmTargetType.COLUMN, "E2", "x", small.ticket());
        small.put(MdmTargetType.COLUMN, "E3", "x", small.ticket());
        clock.advance(Duration.ofMinutes(30));
        small.put(MdmTargetType.DOMAIN, "F1", "f", small.ticket());
        small.put(MdmTargetType.DOMAIN, "F2", "f", small.ticket());
        clock.advance(Duration.ofMinutes(31)); // E1~E3 수명 끝, F1·F2 는 29분 남음

        small.put(MdmTargetType.RULE, "N", "n", small.ticket()); // 6 > 5 → 정리, 목표 floor(4.75) = 4

        // 오래된 순만 보면 E 둘만 지우고 하나가 남는다 — 만료 항목은 목표와 상관없이 모두 지운다.
        assertThat(total(small)).isEqualTo(3);
        assertThat(small.entries(null, null)).extracting(MdmMetaCache.EntryView::key).containsExactly("F1", "F2", "N");
        assertThat(small.trimPasses()).isEqualTo(1);
    }

    @Test
    void 이_인스턴스_지움_뒤에는_그_전에_시작한_적재를_넣지_않고_뒤에_시작한_적재는_넣는다() {
        cache.put(MdmTargetType.COLUMN, "A", "옛 값", cache.ticket());
        MdmMetaCache.Ticket before = cache.ticket();
        cache.evictLocal(MdmTargetType.COLUMN, "A");

        assertThat(cache.put(MdmTargetType.COLUMN, "A", "옛 값", before)).isFalse();
        assertThat(cache.get(MdmTargetType.COLUMN, "A")).isEmpty();
        assertThat(cache.put(MdmTargetType.COLUMN, "A", "새 값", cache.ticket())).isTrue();
        assertThat(cache.get(MdmTargetType.COLUMN, "A").orElseThrow().value()).isEqualTo("새 값");
    }

    @Test
    void 같은_키를_다시_지워도_큰_순번을_지킨다() {
        MdmMetaCache.Ticket at6 = new MdmMetaCache.Ticket(cache.ticket().generation(), 6);
        cache.evict(MdmTargetType.COLUMN, "A", 8);
        cache.evictLocal(MdmTargetType.COLUMN, "A"); // 순번 없는 지움이 순번 8 을 덮지 않는다
        assertThat(cache.put(MdmTargetType.COLUMN, "A", "v", at6)).isFalse();
    }

    private int total() {
        return total(cache);
    }

    private static int total(MdmMetaCache c) {
        return c.sizes().values().stream().mapToInt(Integer::intValue).sum();
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
