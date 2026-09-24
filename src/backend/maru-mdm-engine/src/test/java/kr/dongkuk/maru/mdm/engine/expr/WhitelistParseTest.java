package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.TreeSet;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker.Problem;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups.CountingBody;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-03-02 design.md §3.1 — 수용 기준 1: 화이트리스트 밖 함수는 파싱 단계에서 거부한다.
 * 사전 밖 함수는 EvalEx 파서가 {@code Undefined function} 으로, 비즈니스 함수는 비즈니스 칸 밖에서 저장 시 검사(파싱 직후
 * AST 검사)가 거부한다. 거부된 식은 한 번도 평가되지 않는다.
 */
class WhitelistParseTest {

    private static final Instant TS = Instant.parse("2026-09-06T00:00:00Z");

    private CountingBody body;
    private MdmEvaluator evaluator;
    private ExpressionChecker checker;

    @BeforeEach
    void setUp() {
        body = new CountingBody(args -> Boolean.TRUE);
        evaluator = new MdmEvaluator(InMemoryLookups.create().function(InMemoryLookups.fn("THK_OK", body, "v")).build());
        checker = new ExpressionChecker(evaluator);
    }

    private static List<String> kinds(List<Problem> problems) {
        return problems.stream().map(Problem::kind).toList();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"DT_NOW()", "DT_TODAY()", "RANDOM()", "STR_FORMAT(\"%s\", 1)", "STR_SPLIT(\"a,b\", \",\")",
            "LOG(2)", "LOG10(2)", "FACT(3)", "SIN(1)"})
    void 사전_밖_함수는_파싱_단계에서_거부된다(String text) {
        List<Problem> problems = checker.check(text, Slot.DOMAIN_BIZ);
        ExpressionFailure f = assertThrows(ExpressionFailure.class, () -> evaluator.evaluate(text, Map.of(), TS));
        assertAll(
                () -> assertEquals(List.of(ExpressionChecker.PARSE), kinds(problems)),
                () -> assertTrue(problems.get(0).detail().contains("Undefined function"), problems.toString()),
                () -> assertEquals(ExpressionFailure.PARSE, f.reason()));
    }

    @ParameterizedTest(name = "{0}")
    @EnumSource(value = Slot.class, names = "DOMAIN_BIZ", mode = EnumSource.Mode.EXCLUDE)
    void 비즈니스_함수는_비즈니스_칸_밖에서_거부된다(Slot slot) {
        assertEquals(List.of(ExpressionChecker.FUNCTION), kinds(checker.check("THK_OK(value)", slot)));
    }

    @Test
    void 비즈니스_함수는_DOMAIN_BIZ_에서_통과한다() {
        assertEquals(List.of(), checker.check("THK_OK(value)", Slot.DOMAIN_BIZ));
    }

    @Test
    void 거부된_식은_평가되지_않는다() {
        String outside = "THK_OK(DT_NOW())";
        assertAll(
                () -> assertEquals(List.of(ExpressionChecker.PARSE), kinds(checker.check(outside, Slot.DOMAIN_BIZ))),
                () -> assertThrows(ExpressionFailure.class, () -> evaluator.evaluate(outside, Map.of(), TS)),
                () -> assertEquals(List.of(ExpressionChecker.FUNCTION),
                        kinds(checker.check("THK_OK(value)", Slot.RULE_COND_EXPR))));
        assertEquals(0, body.calls());
    }

    /** STANDARD 27종마다 리터럴과 {@code value} 만으로 만든 최소 인자 식. */
    private static Map<String, String> standardSamples() {
        Map<String, String> m = new TreeMap<>();
        m.put("IF", "IF(value, 1, 2)");
        m.put("SWITCH", "SWITCH(value, 1, \"a\", \"b\")");
        m.put("COALESCE", "COALESCE(value, 1)");
        m.put("NOT", "NOT(value)");
        m.put("ABS", "ABS(value)");
        m.put("CEILING", "CEILING(value)");
        m.put("FLOOR", "FLOOR(value)");
        m.put("SQRT", "SQRT(value)");
        m.put("ROUND", "ROUND(value, 1)");
        m.put("MIN", "MIN(value, 1)");
        m.put("MAX", "MAX(value, 1)");
        m.put("SUM", "SUM(value, 1)");
        m.put("AVERAGE", "AVERAGE(value, 1)");
        m.put("STR_LENGTH", "STR_LENGTH(value)");
        m.put("STR_UPPER", "STR_UPPER(value)");
        m.put("STR_LOWER", "STR_LOWER(value)");
        m.put("STR_TRIM", "STR_TRIM(value)");
        m.put("STR_LEFT", "STR_LEFT(value, 1)");
        m.put("STR_RIGHT", "STR_RIGHT(value, 1)");
        m.put("STR_SUBSTRING", "STR_SUBSTRING(value, 0, 1)");
        m.put("STR_CONTAINS", "STR_CONTAINS(value, \"a\")");
        m.put("STR_STARTS_WITH", "STR_STARTS_WITH(value, \"a\")");
        m.put("STR_ENDS_WITH", "STR_ENDS_WITH(value, \"a\")");
        m.put("STR_MATCHES", "STR_MATCHES(value, \"^[A-Z]{2}$\")");
        m.put("INSTR", "INSTR(value, \"a\")");
        m.put("MASTER", "MASTER(\"A\", \"BASE\", value)");
        m.put("MASTER_AT", "MASTER_AT(\"A\", \"BASE\", value, \"20260101\")");
        return m;
    }

    @Test
    void STANDARD_함수는_여섯_칸_모두에서_통과한다() {
        Map<String, String> samples = standardSamples();
        assertEquals(new TreeSet<>(FunctionSets.STANDARD), samples.keySet());
        List<String> failures = new ArrayList<>();
        for (Slot slot : Slot.values()) {
            samples.values().forEach(text -> {
                List<Problem> problems = checker.check(text, slot);
                if (!problems.isEmpty()) {
                    failures.add(slot + " " + text + " → " + problems);
                }
            });
        }
        assertEquals(List.of(), failures);
    }
}
