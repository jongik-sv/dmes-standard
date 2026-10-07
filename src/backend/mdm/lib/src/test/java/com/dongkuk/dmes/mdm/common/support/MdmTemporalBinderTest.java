package com.dongkuk.dmes.mdm.common.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L5 — 네이티브 SQL 일시 바인딩·읽기의 유일한 자리(D9, 불변 규칙 I15).
 * Oracle {@code TIMESTAMP(6)}(KST): 쓰기는 초 절삭한 {@link LocalDateTime}, 읽기는 {@link Timestamp}·{@link LocalDateTime}.
 */
class MdmTemporalBinderTest {

    private static final LocalDateTime JULY_1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    private final MdmTemporalBinder binder = new MdmTemporalBinder();

    @Test
    void LocalDateTime_을_초_단위로_잘라_그대로_바인딩한다() {
        assertEquals(JULY_1, binder.toDb(JULY_1));
        assertEquals(JULY_1, binder.toDb(JULY_1.plusNanos(987_654_321)));
    }

    @Test
    void Instant_는_KST_로_바꿔_바인딩한다() {
        assertEquals(JULY_1, binder.toDb(Instant.parse("2026-06-30T15:00:00Z")));
        assertEquals(JULY_1, binder.toDb(Instant.parse("2026-06-30T15:00:00.500Z")));
    }

    @Test
    void null_은_null_로_쓴다() {
        assertNull(binder.toDb((LocalDateTime) null));
        assertNull(binder.toDb((Instant) null));
    }

    @Test
    void Timestamp_와_LocalDateTime_을_같은_LocalDateTime_으로_읽고_초를_자른다() {
        assertEquals(JULY_1, binder.fromDb(Timestamp.valueOf(JULY_1.plusNanos(5))));
        assertEquals(JULY_1, binder.fromDb(Timestamp.valueOf(JULY_1)));
        assertEquals(JULY_1, binder.fromDb(JULY_1));
        assertEquals(JULY_1, binder.fromDb(JULY_1.plusNanos(123_000_000)));
        assertNull(binder.fromDb(null));
    }

    @Test
    void 문자열은_더_이상_일시로_읽지_않는다() {
        assertThrows(IllegalArgumentException.class, () -> binder.fromDb("2026-07-01 00:00:00"));
    }
}
