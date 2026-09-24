package com.dongkuk.dmes.mdm.common.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-01 design.md §3.6 — SQLite 엔티티 업무 일시 컨버터(D7). 쓰기 형식이 네이티브 경로
 * ({@link MdmTemporalBinder#toDb(LocalDateTime)})와 글자 단위로 같아야 한다(19자 {@code yyyy-MM-dd HH:mm:ss}).
 */
class MdmSqliteLocalDateTimeConverterTest {

    private final MdmSqliteLocalDateTimeConverter converter = new MdmSqliteLocalDateTimeConverter();
    private static final LocalDateTime VALUE = LocalDateTime.of(2026, 7, 1, 0, 0, 0, 700_000_000);
    private static final LocalDateTime SECONDS = LocalDateTime.of(2026, 7, 1, 0, 0, 0);

    @Test
    void 쓰기는_네이티브와_같은_19자_TEXT_다() {
        String written = converter.convertToDatabaseColumn(VALUE);
        assertEquals("2026-07-01 00:00:00", written);
        assertEquals(19, written.length());
        assertEquals(DateTimeFormatter.ofPattern(MdmTemporalBinder.SQLITE_TEXT_PATTERN).format(SECONDS), written);
        assertNull(converter.convertToDatabaseColumn(null));
    }

    @Test
    void 읽기는_네이티브_fromDb_문자열_규칙과_같다() {
        assertEquals(SECONDS, converter.convertToEntityAttribute("2026-07-01 00:00:00"));
        assertEquals(SECONDS, converter.convertToEntityAttribute("2026-07-01T00:00:00"));
        assertEquals(SECONDS, converter.convertToEntityAttribute("2026-07-01 00:00:00.123"), "앞 19자만 읽는다");
        assertNull(converter.convertToEntityAttribute(null));
        assertNull(converter.convertToEntityAttribute(""));
    }

    /** 형식을 하나로 고정하는 것이 목적이다 — epoch 정수 문자열(컨버터 없이 저장된 값)은 받지 않는다(D7). */
    @Test
    void epoch_정수_문자열은_거부한다() {
        assertThrows(RuntimeException.class, () -> converter.convertToEntityAttribute("1782864000000"));
    }
}
