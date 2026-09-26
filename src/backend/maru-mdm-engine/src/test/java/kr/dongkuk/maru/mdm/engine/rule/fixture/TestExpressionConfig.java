package kr.dongkuk.maru.mdm.engine.rule.fixture;

import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.ALLOW_OVERWRITE_CONSTANTS;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.ARRAYS_ALLOWED;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.BINARY_ALLOWED;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.DECIMAL_PLACES_ROUNDING;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.IMPLICIT_MULTIPLICATION_ALLOWED;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.LENIENT_MODE;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.LOCALE;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.MATH_CONTEXT;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.MAX_RECURSION_DEPTH;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.REGEX_TIMEOUT_MILLIS;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.SINGLE_QUOTE_STRING_LITERALS_ALLOWED;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.STRIP_TRAILING_ZEROS;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.STRUCTURES_ALLOWED;
import static kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig.ZONE;

import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.config.FunctionDictionaryIfc;
import com.ezylang.evalex.config.MapBasedFunctionDictionary;
import com.ezylang.evalex.functions.FunctionIfc;
import java.time.ZoneId;
import java.util.Map;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;

/**
 * 테스트 전용 EvalEx 설정(TSK-03-03 design §6.16, D1). {@code MdmExpressionConfig} 의 상수 14개를 빌더에 그대로 넣고,
 * 함수 사전은 {@link FunctionSets#BASE}(EvalEx 기본 사전에서 꺼냄) + {@link TestFunctions} + 테스트가 더한 함수다.
 * 엔진 단위 테스트용 fixture 설정이다. 운영 설정과의 차이는 {@code ProductionConfigParityTest} 가 본다(D22).
 */
public final class TestExpressionConfig {

    private TestExpressionConfig() {}

    public static ExpressionConfiguration create() {
        return create(new TestFunctions());
    }

    public static ExpressionConfiguration create(TestFunctions functions) {
        return create(functions, Map.of());
    }

    /** {@code extra} 는 카운팅 함수처럼 테스트 안에서만 쓰는 함수다. */
    public static ExpressionConfiguration create(TestFunctions functions, Map<String, FunctionIfc> extra) {
        return create(functions, extra, ZONE);
    }

    /** 시간대만 바꾼 설정 — EVAL_TS 가 설정 시간대와 무관하게 {@code Instant} 로 들어가는지 볼 때만 쓴다(I28). */
    public static ExpressionConfiguration create(TestFunctions functions, Map<String, FunctionIfc> extra, ZoneId zone) {
        FunctionDictionaryIfc defaults = ExpressionConfiguration.defaultConfiguration().getFunctionDictionary();
        MapBasedFunctionDictionary dict = new MapBasedFunctionDictionary();
        for (String name : new TreeSet<>(FunctionSets.BASE)) {
            dict.addFunction(name, defaults.getFunction(name));
        }
        functions.functions().forEach(dict::addFunction);
        extra.forEach(dict::addFunction);
        return ExpressionConfiguration.builder()
                .mathContext(MATH_CONTEXT)
                .zoneId(zone)
                .locale(LOCALE)
                .regexTimeoutMillis(REGEX_TIMEOUT_MILLIS)
                .maxRecursionDepth(MAX_RECURSION_DEPTH)
                .allowOverwriteConstants(ALLOW_OVERWRITE_CONSTANTS)
                .lenientMode(LENIENT_MODE)
                .arraysAllowed(ARRAYS_ALLOWED)
                .structuresAllowed(STRUCTURES_ALLOWED)
                .implicitMultiplicationAllowed(IMPLICIT_MULTIPLICATION_ALLOWED)
                .singleQuoteStringLiteralsAllowed(SINGLE_QUOTE_STRING_LITERALS_ALLOWED)
                .binaryAllowed(BINARY_ALLOWED)
                .stripTrailingZeros(STRIP_TRAILING_ZEROS)
                .decimalPlacesRounding(DECIMAL_PLACES_ROUNDING)
                .functionDictionary(dict)
                .build();
    }
}
