package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.testsupport.CodeFixtures;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups.RecordingMasterLookup;
import kr.dongkuk.maru.mdm.engine.testsupport.PortFixtures;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * TSK-03-02 design.md §3.1·§6.2 — {@code MASTER}·{@code MASTER_AT}(05:363-400, engine-contract §7).
 * 첫 인자가 마루 코드면 코드 해석, 아니면 {@code MasterLookup}. {@code MASTER} 는 {@code EVAL_TS} 를 KST 로,
 * {@code MASTER_AT} 은 넷째 인자({@code YYYYMMDD}·{@code YYYYMMDDHHMMSS})를 기준 시각으로 쓴다.
 */
class MasterFunctionTest {

    /** KST 2026-09-10 00:00 — PROC_CD v1.002, PORT 는 KRPUS·CNSHA 가 열려 있다. */
    private static final Instant SEP10_KST = Instant.parse("2026-09-09T15:00:00Z");

    private RecordingMasterLookup masters;
    private MdmEvaluator evaluator;

    @BeforeEach
    void setUp() {
        masters = new RecordingMasterLookup(PortFixtures.resolver(PortFixtures.port()));
        evaluator = new MdmEvaluator(InMemoryLookups.create()
                .code(CodeFixtures.procCd())
                .code(CodeFixtures.steel())
                .masters(masters)
                .build());
    }

    private EvaluationValue eval(String text, Map<String, Object> values, Instant evalTs) {
        return evaluator.evaluate(text, values, evalTs);
    }

    private static Map<String, Object> vars(String name, Object value) {
        Map<String, Object> m = new HashMap<>();
        m.put(name, value);
        return m;
    }

    @Test
    void 첫_인자가_마루_코드면_코드_해석으로_간다() {
        EvaluationValue r = eval("MASTER(\"PROC_CD\", \"COATING\", \"82\")", Map.of(), SEP10_KST);
        assertAll(
                () -> assertEquals(Boolean.TRUE, r.getBooleanValue()),
                () -> assertEquals(List.of(), masters.baseDts()));
    }

    @Test
    void 첫_인자가_코드에_없으면_MasterLookup_으로_간다() {
        EvaluationValue r = eval("MASTER(\"PORT\", \"BASE\", \"KRPUS\")", Map.of(), SEP10_KST);
        assertAll(
                () -> assertEquals(Boolean.TRUE, r.getBooleanValue()),
                () -> assertEquals(1, masters.baseDts().size()));
    }

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', value = {
            "MASTER(\"PROC_CD\", \"BASE\", K)|BOOLEAN",
            "MASTER(\"PROC_CD\", \"BASE\", K, \"attr01\")|NULL"})
    void key_가_NULL_이면(String text, String expected) {
        EvaluationValue r = eval(text, vars("K", null), SEP10_KST);
        if (expected.equals("BOOLEAN")) {
            assertEquals(Boolean.FALSE, r.getBooleanValue());
        } else {
            assertTrue(r.isNullValue(), text + " = " + r);
        }
    }

    @Test
    void attr_형태는_저장된_문자열을_돌려준다() {
        assertAll(
                () -> assertEquals("KR", eval("MASTER(\"STEEL\", \"BASE\", \"82\", \"attr01\")", Map.of(), SEP10_KST)
                        .getStringValue()),
                () -> assertEquals("KR", eval("MASTER(\"PORT\", \"BASE\", \"KRPUS\", \"attr01\")", Map.of(), SEP10_KST)
                        .getStringValue()));
    }

    static Stream<Arguments> base_dt_사례() {
        return Stream.of(
                Arguments.of("20260906", "2026-09-06T00:00"),
                Arguments.of("20260906093000", "2026-09-06T09:30"),
                Arguments.of(null, "FALSE"),
                Arguments.of("2026-09-06", "ERROR"),
                Arguments.of("20260231", "ERROR"),
                Arguments.of("2026090", "ERROR"),
                Arguments.of(new BigDecimal("20260906"), "ERROR"),
                Arguments.of(Boolean.TRUE, "ERROR"));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @MethodSource("base_dt_사례")
    void MASTER_AT_base_dt(Object baseDt, String expected) {
        String text = "MASTER_AT(\"PORT\", \"BASE\", \"KRPUS\", D)";
        switch (expected) {
            case "ERROR" -> {
                ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> eval(text, vars("D", baseDt), SEP10_KST));
                assertEquals(Code.EVALUATION_ERROR, f.code());
            }
            case "FALSE" -> assertAll(
                    () -> assertEquals(Boolean.FALSE, eval(text, vars("D", baseDt), SEP10_KST).getBooleanValue()),
                    () -> assertEquals(List.of(), masters.baseDts()));
            default -> assertAll(
                    () -> assertEquals(Boolean.TRUE, eval(text, vars("D", baseDt), SEP10_KST).getBooleanValue()),
                    () -> assertEquals(List.of(LocalDateTime.parse(expected)), masters.baseDts()));
        }
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource(delimiter = '|', value = {
            "20260231|달력에 없는 일시",
            "2026090|YYYYMMDD·YYYYMMDDHHMMSS 문자열이어야",
            "2026-09-06|YYYYMMDD·YYYYMMDDHHMMSS 문자열이어야",
            "20260906250000|달력에 없는 일시"})
    void MASTER_AT_base_dt_오류_메시지는_달력_오류와_모양_오류를_가른다(String baseDt, String expectedPart) {
        String text = "MASTER_AT(\"PORT\", \"BASE\", \"KRPUS\", D)";
        ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> eval(text, vars("D", baseDt), SEP10_KST));
        assertTrue(f.getMessage().contains(expectedPart), f.getMessage());
        String other = expectedPart.equals("달력에 없는 일시") ? "문자열이어야" : "달력에 없는 일시";
        assertFalse(f.getMessage().contains(other), "다른 종류의 오류 문구가 섞이면 안 된다: " + f.getMessage());
    }

    @Test
    void 인자_수_초과를_평가에서_만나면_평가_오류다() {
        ExpressionFailure f = assertThrows(ExpressionFailure.class,
                () -> eval("MASTER(\"PROC_CD\", \"BASE\", \"82\", \"attr01\", \"x\")", Map.of(), SEP10_KST));
        assertAll(
                () -> assertEquals(Code.EVALUATION_ERROR, f.code()),
                () -> assertEquals(ExpressionFailure.EVALUATION, f.reason()));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({"2026-08-31T14:59:59Z, false", "2026-08-31T15:00:00Z, true"})
    void EVAL_TS_KST_경계(Instant evalTs, boolean expected) {
        assertEquals(expected, eval("MASTER(\"PROC_CD\", \"COATING\", \"83\")", Map.of(), evalTs).getBooleanValue());
    }
}
