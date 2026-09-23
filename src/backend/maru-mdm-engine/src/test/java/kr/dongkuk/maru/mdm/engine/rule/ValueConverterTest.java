package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.time.Duration;
import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 타입 변환 표(design §6.7, I33). 성공은 값 비교(숫자는 compareTo), 실패는 IAE.
 */
class ValueConverterTest {

    static Stream<Arguments> numberOk() {
        return Stream.of(
                Arguments.of(new BigDecimal("1.50"), "1.50"),
                Arguments.of(7, "7"),
                Arguments.of(7L, "7"),
                Arguments.of((short) 7, "7"),
                Arguments.of((byte) 7, "7"),
                Arguments.of(new BigInteger("12345678901234567890"), "12345678901234567890"),
                Arguments.of(0.1d, "0.1"),
                Arguments.of(0.1f, "0.1"),
                Arguments.of("1.8", "1.8"),
                Arguments.of("-2", "-2"),
                Arguments.of("1E+3", "1000"));
    }

    @ParameterizedTest(name = "{displayName} [{index}] {0}")
    @MethodSource("numberOk")
    void NUMBER_로_바꾼다(Object in, String expected) {
        Object out = ValueConverter.toDeclared(in, DataType.NUMBER);
        assertInstanceOf(BigDecimal.class, out);
        assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) out), in + " → " + out);
    }

    @Test
    void Double_은_toString_경유로_바꾼다() {
        // new BigDecimal(0.1d) 는 0.1000000000000000055… 가 된다.
        assertEquals("0.1", ((BigDecimal) ValueConverter.toDeclared(0.1d, DataType.NUMBER)).toPlainString());
        assertEquals("0.1", ((BigDecimal) ValueConverter.toDeclared(0.1f, DataType.NUMBER)).toPlainString());
    }

    @Test
    void BigDecimal_은_같은_인스턴스를_그대로_둔다() {
        BigDecimal v = new BigDecimal("2.50");
        assertSame(v, ValueConverter.toDeclared(v, DataType.NUMBER));
    }

    static Stream<Arguments> numberFail() {
        return Stream.of(
                Arguments.of(Double.NaN), Arguments.of(Double.POSITIVE_INFINITY), Arguments.of(Float.NEGATIVE_INFINITY),
                Arguments.of(""), Arguments.of(" 1"), Arguments.of("1 "), Arguments.of("abc"),
                Arguments.of(Boolean.TRUE), Arguments.of(new Object()), Arguments.of(Instant.EPOCH));
    }

    @ParameterizedTest(name = "{displayName} [{index}] {0}")
    @MethodSource("numberFail")
    void NUMBER_변환_실패(Object in) {
        assertThrows(IllegalArgumentException.class, () -> ValueConverter.toDeclared(in, DataType.NUMBER));
    }

    static Stream<Arguments> stringOk() {
        return Stream.of(
                Arguments.of("A", "A"),
                Arguments.of(new BigDecimal("1E+2"), "100"),
                Arguments.of(new BigDecimal("1.50"), "1.50"),
                Arguments.of(7, "7"),
                Arguments.of(7L, "7"),
                Arguments.of(new BigInteger("10"), "10"),
                Arguments.of(0.1d, "0.1"));
    }

    @ParameterizedTest(name = "{displayName} [{index}] {0}")
    @MethodSource("stringOk")
    void STRING_DATE_로_바꾼다(Object in, String expected) {
        assertEquals(expected, ValueConverter.toDeclared(in, DataType.STRING));
        assertEquals(expected, ValueConverter.toDeclared(in, DataType.DATE));
    }

    @Test
    void STRING_변환_실패() {
        assertThrows(IllegalArgumentException.class, () -> ValueConverter.toDeclared(Boolean.TRUE, DataType.STRING));
        assertThrows(IllegalArgumentException.class, () -> ValueConverter.toDeclared(new Object(), DataType.STRING));
        assertThrows(IllegalArgumentException.class, () -> ValueConverter.toDeclared(Instant.EPOCH, DataType.STRING));
        assertThrows(IllegalArgumentException.class, () -> ValueConverter.toDeclared(Double.NaN, DataType.STRING));
        assertThrows(IllegalArgumentException.class, () -> ValueConverter.toDeclared(Boolean.FALSE, DataType.DATE));
    }

    @Test
    void BOOLEAN_으로_바꾼다() {
        assertEquals(Boolean.TRUE, ValueConverter.toDeclared(Boolean.TRUE, DataType.BOOLEAN));
        assertEquals(Boolean.TRUE, ValueConverter.toDeclared("true", DataType.BOOLEAN));
        assertEquals(Boolean.FALSE, ValueConverter.toDeclared("FALSE", DataType.BOOLEAN));
        assertEquals(Boolean.FALSE, ValueConverter.toDeclared("False", DataType.BOOLEAN));
        for (Object bad : List.of("Y", "1", "", BigDecimal.ONE, 1, 1.0d, new BigInteger("1"), new Object())) {
            assertThrows(IllegalArgumentException.class, () -> ValueConverter.toDeclared(bad, DataType.BOOLEAN),
                    String.valueOf(bad));
        }
    }

    @Test
    void null_과_List_는_그대로_type_null_은_변환하지_않는다() {
        for (DataType t : DataType.values()) {
            assertNull(ValueConverter.toDeclared(null, t));
            List<Object> list = Arrays.asList(BigDecimal.ONE, null);
            assertSame(list, ValueConverter.toDeclared(list, t));
        }
        Object o = new Object();
        assertSame(o, ValueConverter.toDeclared(o, null));
        assertSame(Boolean.TRUE, ValueConverter.toDeclared(Boolean.TRUE, null));
    }

    @Test
    void fromEvalEx_는_EvalEx_값을_Java_값으로_바꾼다() {
        assertNull(ValueConverter.fromEvalEx(EvaluationValue.NULL_VALUE));
        assertEquals(0, BigDecimal.TEN.compareTo((BigDecimal) ValueConverter.fromEvalEx(
                EvaluationValue.numberValue(new BigDecimal("1E+1")))));
        assertEquals("A", ValueConverter.fromEvalEx(EvaluationValue.stringValue("A")));
        assertEquals(Boolean.TRUE, ValueConverter.fromEvalEx(EvaluationValue.TRUE));
        Instant t = Instant.parse("2026-09-30T15:00:00Z");
        assertEquals(t, ValueConverter.fromEvalEx(EvaluationValue.dateTimeValue(t)));
        Object arr = ValueConverter.fromEvalEx(EvaluationValue.arrayValue(
                List.of(EvaluationValue.numberValue(BigDecimal.ONE), EvaluationValue.NULL_VALUE, EvaluationValue.stringValue("x"))));
        assertEquals(Arrays.asList(BigDecimal.ONE, null, "x"), arr);
        assertThrows(UnsupportedOperationException.class, () -> ((List<?>) arr).clear());
        assertThrows(IllegalArgumentException.class,
                () -> ValueConverter.fromEvalEx(EvaluationValue.durationValue(Duration.ofSeconds(1))));
        assertThrows(IllegalArgumentException.class,
                () -> ValueConverter.fromEvalEx(EvaluationValue.structureValue(Map.of())));
    }
}
