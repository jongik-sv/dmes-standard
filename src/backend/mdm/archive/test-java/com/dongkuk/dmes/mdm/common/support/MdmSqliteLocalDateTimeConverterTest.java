package com.dongkuk.dmes.mdm.common.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import jakarta.persistence.Converter;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * SQLite 업무 일시 컨버터 단위 테스트. TSK-08-01 design.md §3.4·§6.6(D5)과 TSK-06-01 design.md §3.6(D7)이 같은 이름으로 각각
 * 만든 테스트를 dev 머지 때 한 파일로 합쳤다. 쓰기·읽기 형식이 네이티브 쓰기의 유일한 자리 {@link MdmTemporalBinder}(SQLite
 * 분기)와 글자까지 같아야 한다(TSK-08-01 불변 규칙 18, TSK-06-01 D7).
 */
class MdmSqliteLocalDateTimeConverterTest {

    private final MdmSqliteLocalDateTimeConverter converter = new MdmSqliteLocalDateTimeConverter();
    private final MdmTemporalBinder sqliteBinder = new MdmTemporalBinder(() -> MdmDialect.SQLITE);

    @Test
    void 쓰기는_초_단위로_잘라_yyyy_MM_dd_HH_mm_ss_문자열이다() {
        assertEquals("2026-10-01 00:00:00", converter.convertToDatabaseColumn(LocalDateTime.of(2026, 10, 1, 0, 0, 0, 789_000_000)));
        assertEquals("9999-12-31 00:00:00", converter.convertToDatabaseColumn(LocalDateTime.of(9999, 12, 31, 0, 0)));
        assertEquals("2026-06-20 09:08:07", converter.convertToDatabaseColumn(LocalDateTime.of(2026, 6, 20, 9, 8, 7, 999_999_999)));
    }

    @Test
    void 읽기는_공백과_T_구분_소수초를_받고_앞_19자만_쓴다() {
        LocalDateTime expected = LocalDateTime.of(2026, 9, 21, 10, 0, 0);
        assertEquals(expected, converter.convertToEntityAttribute("2026-09-21 10:00:00"));
        assertEquals(expected, converter.convertToEntityAttribute("2026-09-21T10:00:00"));
        assertEquals(expected, converter.convertToEntityAttribute("2026-09-21 10:00:00.789"));
        assertEquals(expected, converter.convertToEntityAttribute("2026-09-21T10:00:00.123456"));
    }

    @Test
    void null_은_null_이다() {
        assertNull(converter.convertToDatabaseColumn(null));
        assertNull(converter.convertToEntityAttribute(null));
    }

    @Test
    void 같은_입력에_대해_MdmTemporalBinder_의_SQLite_문자열과_글자까지_같다() {
        for (LocalDateTime value : List.of(
                LocalDateTime.of(2026, 10, 1, 0, 0, 0, 789_000_000),
                LocalDateTime.of(2024, 1, 1, 0, 0),
                LocalDateTime.of(2026, 6, 20, 23, 59, 59, 1))) {
            String converted = converter.convertToDatabaseColumn(value);
            assertEquals(sqliteBinder.toDb(value), converted, "바인더와 컨버터의 쓰기 형식");
            assertEquals(sqliteBinder.fromDb(converted), converter.convertToEntityAttribute(converted), "바인더와 컨버터의 읽기");
        }
        for (String stored : List.of("2026-09-21 10:00:00", "2026-09-21T10:00:00.5")) {
            assertEquals(sqliteBinder.fromDb(stored), converter.convertToEntityAttribute(stored), stored);
        }
    }

    @Test
    void 컨버터에는_Converter_어노테이션이_없다() {
        // 엔티티 스캔이 @Converter(autoApply) 를 자동 적용하면 SQLite 가 아닌 DB 에도 켜진다(D5, 불변 규칙 19).
        assertFalse(MdmSqliteLocalDateTimeConverter.class.isAnnotationPresent(Converter.class));
    }

    // ── TSK-06-01 design.md §3.6(D7) ──

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
