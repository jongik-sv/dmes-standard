package com.dongkuk.dmes.mcm.common.util;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

class McmValuesTest {

    private static final LocalDateTime FB = LocalDateTime.of(2000, 1, 1, 0, 0);

    @Test
    void strOf_keepsWhitespace() {
        assertNull(McmValues.strOf(null));
        assertEquals("", McmValues.strOf(""));
        assertEquals("  ", McmValues.strOf("  "));
        assertEquals(" a ", McmValues.strOf(" a "));
        assertEquals("1", McmValues.strOf(1));
        assertEquals("1", McmValues.strOf(1L));
        assertEquals("1.0", McmValues.strOf(1.0));
        assertEquals("1E+3", McmValues.strOf(new BigDecimal("1E+3")));
    }

    @Test
    void strOfTrim_trims() {
        assertNull(McmValues.strOfTrim(null));
        assertEquals("", McmValues.strOfTrim(""));
        assertEquals("", McmValues.strOfTrim("   "));
        assertEquals("a", McmValues.strOfTrim(" a "));
        assertEquals("1", McmValues.strOfTrim(1));
        assertEquals("1.0", McmValues.strOfTrim(1.0));
        assertEquals("1E+3", McmValues.strOfTrim(new BigDecimal("1E+3")));
    }

    @Test
    void blankToNullTrim_trimsAndNullsBlank() {
        assertNull(McmValues.blankToNullTrim(null));
        assertNull(McmValues.blankToNullTrim(""));
        assertNull(McmValues.blankToNullTrim("  "));
        assertEquals("a", McmValues.blankToNullTrim(" a "));
        assertEquals("null", McmValues.blankToNullTrim("null"));
    }

    @Test
    void blankToNull_keepsOriginal() {
        assertNull(McmValues.blankToNull(null));
        assertNull(McmValues.blankToNull(""));
        assertNull(McmValues.blankToNull("  "));
        assertEquals(" a ", McmValues.blankToNull(" a "));
        assertEquals("null", McmValues.blankToNull("null"));
    }

    @Test
    void parseLocalDateTime_formats() {
        assertEquals(LocalDateTime.of(2026, 10, 4, 0, 0), McmValues.parseLocalDateTime("20261004", FB));
        assertEquals(LocalDateTime.of(2026, 10, 4, 0, 0), McmValues.parseLocalDateTime("2026-10-04", FB));
        assertEquals(LocalDateTime.of(2026, 10, 4, 13, 5, 7), McmValues.parseLocalDateTime("2026-10-04 13:05:07", FB));
        assertEquals(LocalDateTime.of(2026, 10, 4, 13, 5, 7), McmValues.parseLocalDateTime(" 2026-10-04T13:05:07 ", FB));
    }

    @Test
    void parseLocalDateTime_fallbacksAndDirectInputs() {
        assertSame(FB, McmValues.parseLocalDateTime(null, FB));
        assertSame(FB, McmValues.parseLocalDateTime("", FB));
        assertSame(FB, McmValues.parseLocalDateTime("   ", FB));
        assertSame(FB, McmValues.parseLocalDateTime("null", FB));
        assertSame(FB, McmValues.parseLocalDateTime("garbage", FB));
        assertSame(FB, McmValues.parseLocalDateTime("2026-13-45", FB));
        assertNull(McmValues.parseLocalDateTime(null, null));
        LocalDateTime now = LocalDateTime.of(2026, 1, 2, 3, 4, 5);
        assertSame(now, McmValues.parseLocalDateTime(now, FB));
        assertEquals(LocalDateTime.of(2026, 10, 4, 13, 5, 7),
                McmValues.parseLocalDateTime(Timestamp.valueOf("2026-10-04 13:05:07"), FB));
    }

    @Test
    void toIntStrict_commaBlankAndErrors() {
        assertNull(McmValues.toIntStrict(null, "x"));
        assertNull(McmValues.toIntStrict("", "x"));
        assertNull(McmValues.toIntStrict("  ", "x"));
        assertEquals(1234, McmValues.toIntStrict("1,234", "x"));
        assertEquals(12, McmValues.toIntStrict(" 12 ", "x"));
        assertEquals(5, McmValues.toIntStrict(5, "x"));
        assertEquals(5, McmValues.toIntStrict(5L, "x"));
        BusinessException e = assertThrows(BusinessException.class, () -> McmValues.toIntStrict("abc", "정밀도"));
        assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode());
        assertEquals("정밀도은(는) 정수만 입력 가능합니다.", e.getMessage());
        // Double 1.0 은 문자열 "1.0" 이라 파싱 실패
        assertThrows(BusinessException.class, () -> McmValues.toIntStrict(1.0, "x"));
        assertThrows(BusinessException.class, () -> McmValues.toIntStrict(new BigDecimal("1E+3"), "x"));
    }

    @Test
    void toIntOrNull_numbersAndStrings() {
        assertNull(McmValues.toIntOrNull(null));
        assertNull(McmValues.toIntOrNull(""));
        assertNull(McmValues.toIntOrNull("  "));
        assertNull(McmValues.toIntOrNull("abc"));
        assertNull(McmValues.toIntOrNull("1,234"));
        assertNull(McmValues.toIntOrNull("1.0"));
        assertEquals(12, McmValues.toIntOrNull(" 12 "));
        assertEquals(1, McmValues.toIntOrNull(1));
        assertEquals(7, McmValues.toIntOrNull(7L));
        assertEquals(1, McmValues.toIntOrNull(1.9));
        assertEquals(1000, McmValues.toIntOrNull(new BigDecimal("1E+3")));
    }
}
