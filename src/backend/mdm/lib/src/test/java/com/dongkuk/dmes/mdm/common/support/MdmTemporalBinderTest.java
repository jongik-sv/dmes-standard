package com.dongkuk.dmes.mdm.common.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/**
 * TSK-01-03 design.md §3.1 L5 — 네이티브 SQL 일시 바인딩·읽기의 유일한 자리(D9, 불변 규칙 I15).
 * SQLite 는 KST 초 단위 문자열, MSSQL 은 LocalDateTime(DATETIME2).
 */
class MdmTemporalBinderTest {

    private static final LocalDateTime JULY_1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    private final MdmTemporalBinder sqlite = new MdmTemporalBinder(() -> MdmDialect.SQLITE);
    private final MdmTemporalBinder mssql = new MdmTemporalBinder(() -> MdmDialect.MSSQL);

    @Test
    void SQLite_는_초_단위_문자열로_쓴다() {
        assertEquals("2026-07-01 00:00:00", sqlite.toDb(JULY_1));
        assertEquals("2026-07-01 00:00:00", sqlite.toDb(JULY_1.plusNanos(987_654_321)));
    }

    @Test
    void Instant_는_KST_로_바꿔_쓴다() {
        assertEquals("2026-07-01 00:00:00", sqlite.toDb(Instant.parse("2026-06-30T15:00:00Z")));
        assertEquals(JULY_1, mssql.toDb(Instant.parse("2026-06-30T15:00:00.500Z")));
    }

    @Test
    void MSSQL_은_LocalDateTime_을_초_단위로_쓴다() {
        assertEquals(JULY_1, mssql.toDb(JULY_1));
        assertEquals(JULY_1, mssql.toDb(JULY_1.plusNanos(1)));
    }

    @Test
    void null_은_null_로_쓴다() {
        assertNull(sqlite.toDb((LocalDateTime) null));
        assertNull(mssql.toDb((Instant) null));
    }

    @Test
    void 여러_모양의_읽기_값을_같은_LocalDateTime_으로_읽는다() {
        assertEquals(JULY_1, sqlite.fromDb("2026-07-01 00:00:00"));
        assertEquals(JULY_1, sqlite.fromDb("2026-07-01 00:00:00.123"));
        assertEquals(JULY_1, sqlite.fromDb(Timestamp.valueOf(JULY_1.plusNanos(5))));
        assertEquals(JULY_1, sqlite.fromDb(JULY_1));
        assertNull(sqlite.fromDb(null));
    }
}
