package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-03-02 design.md §3.1·§6.7(D2) — 타입 변환 공개 단일 진입점의 변환 표. 도메인 검증(02 3단계)과
 * 룰 판정(06:198 엔진 계약 2)이 같은 표를 쓴다.
 */
class ValueConverterTest {

    private static final Instant TS = Instant.parse("2026-09-06T00:00:00Z");

    static Stream<Arguments> 받는_사례() {
        return Stream.of(
                // NUMBER — scale 을 유지한다(equals 로 본다)
                Arguments.of(DataType.NUMBER, new BigDecimal("1.10"), new BigDecimal("1.10")),
                Arguments.of(DataType.NUMBER, 3, new BigDecimal("3")),
                Arguments.of(DataType.NUMBER, 30_000_000_000L, new BigDecimal("30000000000")),
                Arguments.of(DataType.NUMBER, 0.1d, new BigDecimal("0.1")),
                Arguments.of(DataType.NUMBER, "1.60", new BigDecimal("1.60")),
                Arguments.of(DataType.NUMBER, "-2", new BigDecimal("-2")),
                // STRING
                Arguments.of(DataType.STRING, "A", "A"),
                Arguments.of(DataType.STRING, new BigDecimal("82.0"), "82.0"),
                Arguments.of(DataType.STRING, 82, "82"),
                // BOOLEAN
                Arguments.of(DataType.BOOLEAN, Boolean.TRUE, Boolean.TRUE),
                Arguments.of(DataType.BOOLEAN, "true", Boolean.TRUE),
                Arguments.of(DataType.BOOLEAN, "FALSE", Boolean.FALSE),
                // DATE
                Arguments.of(DataType.DATE, TS, TS));
    }

    static Stream<Arguments> 거부_사례() {
        return Stream.of(
                Arguments.of(DataType.NUMBER, "1e3"),
                Arguments.of(DataType.NUMBER, "0xFF"),
                Arguments.of(DataType.NUMBER, " 1"),
                Arguments.of(DataType.NUMBER, "1,000"),
                Arguments.of(DataType.NUMBER, "abc"),
                Arguments.of(DataType.NUMBER, Boolean.TRUE),
                Arguments.of(DataType.NUMBER, Double.NaN),
                Arguments.of(DataType.STRING, Boolean.TRUE),
                Arguments.of(DataType.BOOLEAN, "Y"),
                Arguments.of(DataType.BOOLEAN, 1),
                Arguments.of(DataType.DATE, "20260101"));
    }

    @ParameterizedTest(name = "{0} ← {1}")
    @MethodSource("받는_사례")
    void 변환표대로_바꾼다(DataType type, Object input, Object expected) {
        Object actual = ValueConverter.convert(input, type);
        assertEquals(expected, actual);
        assertEquals(expected.getClass(), actual.getClass());
    }

    @ParameterizedTest(name = "{0} ← {1}")
    @MethodSource("거부_사례")
    void 변환표_밖은_거부한다(DataType type, Object input) {
        assertThrows(ValueConversionException.class, () -> ValueConverter.convert(input, type));
    }

    @ParameterizedTest
    @EnumSource(DataType.class)
    void null_은_어느_타입이든_null_이다(DataType type) {
        assertNull(ValueConverter.convert(null, type));
    }
}
