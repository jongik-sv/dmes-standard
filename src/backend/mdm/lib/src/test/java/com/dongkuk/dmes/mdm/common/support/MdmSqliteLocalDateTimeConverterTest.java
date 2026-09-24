package com.dongkuk.dmes.mdm.common.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import jakarta.persistence.Converter;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-01 design.md §3.4·§6.6(D5) — SQLite 업무 일시 컨버터 단위 테스트. 쓰기·읽기 형식이 네이티브 쓰기의 유일한 자리
 * {@link MdmTemporalBinder}(SQLite 분기)와 글자까지 같아야 한다(불변 규칙 18).
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
        // 엔티티 스캔이 @Converter(autoApply) 를 자동 적용하면 MSSQL 에도 켜진다(D5, 불변 규칙 19).
        assertFalse(MdmSqliteLocalDateTimeConverter.class.isAnnotationPresent(Converter.class));
    }
}
