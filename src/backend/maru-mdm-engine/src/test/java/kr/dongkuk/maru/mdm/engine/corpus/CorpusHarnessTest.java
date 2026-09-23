package kr.dongkuk.maru.mdm.engine.corpus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.Expression;
import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.config.FunctionDictionaryIfc;
import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-04 design.md §3.1·§6.11 — 코퍼스 서버 하네스의 설정과 대역 함수. 하네스 설정은 계약 상수에서 온다(I42).
 */
class CorpusHarnessTest {

    @Test
    void 하네스_설정값이_MdmExpressionConfig_상수와_같다() {
        ExpressionConfiguration c = CorpusEvalExHarness.configuration(Map.of());
        assertEquals(MdmExpressionConfig.MATH_CONTEXT, c.getMathContext());
        assertEquals(MdmExpressionConfig.ZONE, c.getZoneId());
        assertEquals(MdmExpressionConfig.LOCALE, c.getLocale());
        assertEquals(MdmExpressionConfig.ALLOW_OVERWRITE_CONSTANTS, c.isAllowOverwriteConstants());
        assertEquals(MdmExpressionConfig.LENIENT_MODE, c.isLenientMode());
        assertEquals(MdmExpressionConfig.MAX_RECURSION_DEPTH, c.getMaxRecursionDepth());
        assertEquals(MdmExpressionConfig.ARRAYS_ALLOWED, c.isArraysAllowed());
        assertEquals(MdmExpressionConfig.STRUCTURES_ALLOWED, c.isStructuresAllowed());
        assertEquals(MdmExpressionConfig.IMPLICIT_MULTIPLICATION_ALLOWED, c.isImplicitMultiplicationAllowed());
        assertEquals(MdmExpressionConfig.SINGLE_QUOTE_STRING_LITERALS_ALLOWED, c.isSingleQuoteStringLiteralsAllowed());
        assertEquals(MdmExpressionConfig.BINARY_ALLOWED, c.isBinaryAllowed());
        assertEquals(MdmExpressionConfig.STRIP_TRAILING_ZEROS, c.isStripTrailingZeros());
        assertEquals(MdmExpressionConfig.DECIMAL_PLACES_ROUNDING, c.getDecimalPlacesRounding());
        assertEquals(MdmExpressionConfig.REGEX_TIMEOUT_MILLIS, c.getRegexTimeoutMillis());
    }

    @Test
    void 하네스_함수_사전은_BASE_와_INSTR_MASTER_뿐이다() {
        FunctionDictionaryIfc dict = CorpusEvalExHarness.configuration(Map.of()).getFunctionDictionary();
        for (String name : FunctionSets.BASE) {
            assertTrue(dict.hasFunction(name), "BASE 함수가 없다: " + name);
        }
        assertTrue(dict.hasFunction("INSTR"));
        assertTrue(dict.hasFunction("MASTER"));
        assertFalse(dict.hasFunction("MASTER_AT"));
        for (String outside : new String[] {"LOG", "DT_NOW", "STR_FORMAT"}) {
            assertFalse(FunctionSets.STANDARD.contains(outside));
            assertFalse(dict.hasFunction(outside), "STANDARD 밖 함수가 있다: " + outside);
        }
    }

    @Test
    void 대역_INSTR_는_06_규칙을_따른다() throws Exception {
        assertEquals(0, new BigDecimal("3").compareTo(eval("INSTR(\"SGCC\", \"CC\")", null).getNumberValue()));
        assertEquals(0, BigDecimal.ZERO.compareTo(eval("INSTR(\"SGCC\", \"cc\")", null).getNumberValue()));
        assertTrue(eval("INSTR(X, \"C\")", null).isNullValue());
        assertEquals(0, BigDecimal.ONE.compareTo(eval("INSTR(\"abc\", \"\")", null).getNumberValue()));
    }

    private static EvaluationValue eval(String text, Object x) throws Exception {
        Expression e = new Expression(text, CorpusEvalExHarness.configuration(Map.of()));
        if (text.contains("X")) {
            e.with("X", x);
        }
        return e.evaluate();
    }
}
