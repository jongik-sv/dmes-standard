package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.parser.ParseException;
import java.math.BigDecimal;
import java.util.Locale;
import java.util.Set;
import java.util.TimeZone;
import java.util.TreeSet;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-03-02 design.md §3.1·§6.1(D3) — 설정 팩토리가 고정값 14개와 허용 함수 사전을 실제 설정에 넣는다(06:442).
 */
class MdmExpressionConfigTest {

    private static final ExpressionConfiguration ENGINE = MdmExpressionConfig.create(InMemoryLookups.create().build());

    private static Set<String> upper(Set<String> names) {
        return names.stream().map(n -> n.toUpperCase(Locale.ROOT)).collect(Collectors.toCollection(TreeSet::new));
    }

    /** 호스트 기본 시간대·로캘을 고정값과 다르게 둔 채 만든 설정 — 빌더에 값을 넣지 않으면 호스트 값이 새어 나온다. */
    private static ExpressionConfiguration createOnForeignHost() {
        TimeZone zone = TimeZone.getDefault();
        Locale locale = Locale.getDefault();
        try {
            TimeZone.setDefault(TimeZone.getTimeZone("UTC"));
            Locale.setDefault(Locale.US);
            return MdmExpressionConfig.create(InMemoryLookups.create().build());
        } finally {
            TimeZone.setDefault(zone);
            Locale.setDefault(locale);
        }
    }

    @Test
    void create_설정이_고정값_14개와_같다() {
        ExpressionConfiguration c = createOnForeignHost();
        assertAll(
                () -> assertEquals(MdmExpressionConfig.MATH_CONTEXT, c.getMathContext()),
                () -> assertEquals(MdmExpressionConfig.ZONE, c.getZoneId()),
                () -> assertEquals(MdmExpressionConfig.LOCALE, c.getLocale()),
                () -> assertEquals(MdmExpressionConfig.REGEX_TIMEOUT_MILLIS, c.getRegexTimeoutMillis()),
                () -> assertEquals(MdmExpressionConfig.MAX_RECURSION_DEPTH, c.getMaxRecursionDepth()),
                () -> assertEquals(MdmExpressionConfig.ALLOW_OVERWRITE_CONSTANTS, c.isAllowOverwriteConstants()),
                () -> assertEquals(MdmExpressionConfig.LENIENT_MODE, c.isLenientMode()),
                () -> assertEquals(MdmExpressionConfig.ARRAYS_ALLOWED, c.isArraysAllowed()),
                () -> assertEquals(MdmExpressionConfig.STRUCTURES_ALLOWED, c.isStructuresAllowed()),
                () -> assertEquals(MdmExpressionConfig.IMPLICIT_MULTIPLICATION_ALLOWED, c.isImplicitMultiplicationAllowed()),
                () -> assertEquals(MdmExpressionConfig.SINGLE_QUOTE_STRING_LITERALS_ALLOWED,
                        c.isSingleQuoteStringLiteralsAllowed()),
                () -> assertEquals(MdmExpressionConfig.BINARY_ALLOWED, c.isBinaryAllowed()),
                () -> assertEquals(MdmExpressionConfig.STRIP_TRAILING_ZEROS, c.isStripTrailingZeros()),
                () -> assertEquals(MdmExpressionConfig.DECIMAL_PLACES_ROUNDING, c.getDecimalPlacesRounding()));
    }

    @Test
    void baseBuilder_사전은_BASE_24종뿐이다() {
        Set<String> names = MdmExpressionConfig.baseBuilder().build().getFunctionDictionary().getAvailableFunctionNames();
        assertEquals(new TreeSet<>(FunctionSets.BASE), upper(names));
    }

    @Test
    void create_사전은_STANDARD_와_비즈니스_함수다() {
        ExpressionConfiguration c = MdmExpressionConfig.create(InMemoryLookups.create()
                .function(InMemoryLookups.fn("THK_OK", args -> Boolean.TRUE, "v"))
                .build());
        Set<String> expected = new TreeSet<>(FunctionSets.STANDARD);
        expected.add("THK_OK");
        assertEquals(expected, upper(c.getFunctionDictionary().getAvailableFunctionNames()));
    }

    @Test
    void 상수_사전이_남고_상수_이름_값_넣기가_거부된다() {
        assertAll(
                () -> assertTrue(upper(ENGINE.getDefaultConstants().keySet()).containsAll(ReservedNames.CONSTANTS)),
                () -> assertThrows(UnsupportedOperationException.class, () -> new Expression("x", ENGINE).with("null", 1)));
    }

    @Test
    void ROUND_는_HALF_EVEN_이고_정밀도는_68_이다() throws Exception {
        assertAll(
                () -> assertEquals(0, new BigDecimal("2.34").compareTo(
                        new Expression("ROUND(2.345, 2)", ENGINE).evaluate().getNumberValue())),
                () -> assertEquals(0, new BigDecimal("2.36").compareTo(
                        new Expression("ROUND(2.355, 2)", ENGINE).evaluate().getNumberValue())),
                () -> assertEquals(68, new Expression("1 / 3", ENGINE).evaluate().getNumberValue().precision()));
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"B[0] > 1", "c.d > 1", "2x > 1", "'A' == V"})
    void 문법_축소는_파싱_오류다(String text) {
        assertThrows(ParseException.class, () -> new Expression(text, ENGINE).validate());
    }
}
