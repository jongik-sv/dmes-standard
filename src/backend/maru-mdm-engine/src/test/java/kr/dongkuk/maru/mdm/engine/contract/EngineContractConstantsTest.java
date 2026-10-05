package kr.dongkuk.maru.mdm.engine.contract;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.config.ExpressionConfiguration;
import com.ezylang.evalex.config.FunctionDictionaryIfc;
import java.math.MathContext;
import java.math.RoundingMode;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.MdmExpressionConfig;
import kr.dongkuk.maru.mdm.engine.expr.MdmFunction;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import org.junit.jupiter.api.Test;

/**
 * TSK-03-01 design.md §3.1·§5 I19-I22a — 설정 고정값·함수 집합·예약 이름·식 함수 시그니처를 고정한다. 영구 규칙.
 *
 * <p>EvalEx 표준 사전은 이 테스트에서만 부른다(main 은 계약 전용이라 EvalEx 를 실행하지 않는다).
 */
class EngineContractConstantsTest {

    private static final FunctionDictionaryIfc EVALEX_STANDARD =
            ExpressionConfiguration.defaultConfiguration().getFunctionDictionary();

    @Test
    void 설정_고정값이_06_442_와_같다() {
        assertAll(
                () -> assertEquals(new MathContext(68, RoundingMode.HALF_EVEN), MdmExpressionConfig.MATH_CONTEXT),
                () -> assertEquals(ZoneId.of("Asia/Seoul"), MdmExpressionConfig.ZONE),
                () -> assertEquals(Locale.ROOT, MdmExpressionConfig.LOCALE),
                () -> assertEquals(100, MdmExpressionConfig.REGEX_TIMEOUT_MILLIS),
                () -> assertEquals(2000, MdmExpressionConfig.MAX_RECURSION_DEPTH),
                () -> assertFalse(MdmExpressionConfig.ALLOW_OVERWRITE_CONSTANTS),
                () -> assertFalse(MdmExpressionConfig.LENIENT_MODE),
                () -> assertFalse(MdmExpressionConfig.ARRAYS_ALLOWED),
                () -> assertFalse(MdmExpressionConfig.STRUCTURES_ALLOWED),
                () -> assertFalse(MdmExpressionConfig.IMPLICIT_MULTIPLICATION_ALLOWED),
                () -> assertFalse(MdmExpressionConfig.SINGLE_QUOTE_STRING_LITERALS_ALLOWED),
                () -> assertFalse(MdmExpressionConfig.BINARY_ALLOWED),
                () -> assertTrue(MdmExpressionConfig.STRIP_TRAILING_ZEROS),
                () -> assertEquals(ExpressionConfiguration.DECIMAL_PLACES_ROUNDING_UNLIMITED,
                        MdmExpressionConfig.DECIMAL_PLACES_ROUNDING));
    }

    @Test
    void STANDARD_는_BASE_와_MDM_의_서로소_합집합이다() {
        Set<String> union = new TreeSet<>(FunctionSets.BASE);
        union.addAll(FunctionSets.MDM);
        Set<String> overlap = new TreeSet<>(FunctionSets.BASE);
        overlap.retainAll(FunctionSets.MDM);
        assertAll(
                () -> assertEquals(union, new TreeSet<>(FunctionSets.STANDARD), "STANDARD ≠ BASE ∪ MDM"),
                () -> assertEquals(Set.of(), overlap, "BASE ∩ MDM ≠ ∅"),
                () -> assertEquals(24, FunctionSets.BASE.size(), "BASE 는 evalex-guide §8.5 의 24개다"),
                () -> assertEquals(Set.of("INSTR", "MASTER", "MASTER_AT"), FunctionSets.MDM));
    }

    @Test
    void GENERATED_는_STANDARD_의_부분집합이다() {
        assertTrue(FunctionSets.STANDARD.containsAll(FunctionSets.GENERATED), "GENERATED ⊄ STANDARD");
        assertEquals(Set.of("STR_MATCHES", "STR_STARTS_WITH", "STR_ENDS_WITH", "INSTR", "MASTER"), FunctionSets.GENERATED);
    }

    @Test
    void 제외_함수는_STANDARD_에_없다() {
        // 시각·난수·로캘·형식 함수와 판정에 쓰지 않는 수학 함수(evalex-guide §8.5, 02:326 결정성).
        List<String> excluded = List.of(
                "DT_NOW", "DT_TODAY", "RANDOM", "STR_FORMAT", "STR_SPLIT", "LOG", "LOG10", "FACT", "SIN", "COS", "TAN");
        Map<String, Set<String>> sets = Map.of(
                "BASE", FunctionSets.BASE, "STANDARD", FunctionSets.STANDARD, "GENERATED", FunctionSets.GENERATED);
        Set<String> found = new TreeSet<>();
        sets.forEach((name, set) -> excluded.stream().filter(set::contains).forEach(f -> found.add(name + ":" + f)));
        assertEquals(Set.of(), found, "제외 함수가 허용 집합에 들어 있다");
    }

    @Test
    void BASE_는_EvalEx_3_7_0_표준_사전에_모두_있다() {
        Set<String> missing = FunctionSets.BASE.stream()
                .filter(n -> !EVALEX_STANDARD.hasFunction(n))
                .collect(Collectors.toCollection(TreeSet::new));
        assertEquals(Set.of(), missing, "EvalEx 표준 사전에 없는 BASE 함수");
    }

    @Test
    void MDM_함수는_EvalEx_표준_사전에_없다() {
        Set<String> present = FunctionSets.MDM.stream()
                .filter(EVALEX_STANDARD::hasFunction)
                .collect(Collectors.toCollection(TreeSet::new));
        assertEquals(Set.of(), present, "MDM 커스텀 함수가 EvalEx 표준 이름과 겹친다");
    }

    @Test
    void CONSTANTS_는_EvalEx_표준_상수와_같다() {
        Set<String> standard = ExpressionConfiguration.StandardConstants.keySet().stream()
                .map(k -> k.toUpperCase(Locale.ROOT))
                .collect(Collectors.toCollection(TreeSet::new));
        assertEquals(standard, new TreeSet<>(ReservedNames.CONSTANTS));
    }

    @Test
    void 예약_키_상수가_06_422_424_와_같다() {
        assertAll(
                () -> assertEquals("EVAL_TS", ReservedNames.EVAL_TS),
                () -> assertEquals("_", ReservedNames.RESERVED_PREFIX),
                () -> assertEquals("_V", ReservedNames.EXPR_VAR_PREFIX),
                () -> assertEquals("value", ReservedNames.DOMAIN_VALUE));
    }

    @Test
    void 받는_노드_예약_이름은_CATCH_다섯_개다() {
        assertEquals(new TreeSet<>(Set.of("CATCH_KIND", "CATCH_RULE", "CATCH_CODE", "CATCH_MSG", "CATCH_SET")),
                new TreeSet<>(ReservedNames.CATCH_NAMES));
        assertAll(
                () -> assertEquals("CATCH_KIND", ReservedNames.CATCH_KIND),
                () -> assertEquals("CATCH_RULE", ReservedNames.CATCH_RULE),
                () -> assertEquals("CATCH_CODE", ReservedNames.CATCH_CODE),
                () -> assertEquals("CATCH_MSG", ReservedNames.CATCH_MSG),
                () -> assertEquals("CATCH_SET", ReservedNames.CATCH_SET));
    }

    @Test
    void Slot_표지는_DOMAIN_BIZ_만_비즈니스_함수_DOMAIN_STD_만_value_전용이다() {
        Set<Slot> business = Arrays.stream(Slot.values()).filter(Slot::businessFunctions).collect(Collectors.toSet());
        Set<Slot> valueOnly = Arrays.stream(Slot.values()).filter(Slot::valueOnly).collect(Collectors.toSet());
        assertAll(
                () -> assertEquals(6, Slot.values().length),
                () -> assertEquals(Set.of(Slot.DOMAIN_BIZ), business),
                () -> assertEquals(Set.of(Slot.DOMAIN_STD), valueOnly));
    }

    @Test
    void MdmFunction_시그니처가_06_443_05_363_과_같다() {
        Set<String> names = Arrays.stream(MdmFunction.values()).map(Enum::name).collect(Collectors.toCollection(HashSet::new));
        assertAll(
                () -> assertEquals(FunctionSets.MDM, names, "MdmFunction 이름 집합 ≠ FunctionSets.MDM"),
                () -> assertSignature(MdmFunction.INSTR, 2, 2, List.of("s", "sub")),
                () -> assertSignature(MdmFunction.MASTER, 3, 4, List.of("id", "cate", "key", "attr")),
                () -> assertSignature(MdmFunction.MASTER_AT, 4, 5, List.of("id", "cate", "key", "base_dt", "attr")),
                () -> Arrays.stream(MdmFunction.values()).forEach(f -> assertEquals(f.maxArgs(), f.paramNames().size(),
                        f + " 인자 이름 수 ≠ 최대 인자 수")));
    }

    private static void assertSignature(MdmFunction f, int min, int max, List<String> params) {
        assertEquals(min, f.minArgs(), f + " 최소 인자 수");
        assertEquals(max, f.maxArgs(), f + " 최대 인자 수");
        assertEquals(params, f.paramNames(), f + " 인자 이름");
    }
}
