package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * TSK-03-02 design.md §3.1·§6.2 — {@code INSTR(s, sub)}: 대소문자 구분, 1부터, 없으면 0, 인자가 NULL 이면 NULL(06:443, EG:215).
 */
class InstrFunctionTest {

    private static final MdmEvaluator EVALUATOR = new MdmEvaluator(InMemoryLookups.create().build());

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource(delimiter = '|', nullValues = "NULL", value = {
            "INSTR(\"ABCDE\", \"CD\")|3",
            "INSTR(\"ABCDE\", \"cd\")|0",
            "INSTR(\"ABC\", \"\")|1",
            "INSTR(\"A\", NULL)|NULL",
            "INSTR(NULL, \"A\")|NULL",
            "INSTR(\"가나다\", \"다\")|3"})
    void INSTR_결과(String text, BigDecimal expected) {
        EvaluationValue r = EVALUATOR.evaluate(text, Map.of(), Instant.parse("2026-09-06T00:00:00Z"));
        if (expected == null) {
            assertTrue(r.isNullValue(), text + " = " + r);
        } else {
            assertEquals(0, expected.compareTo(r.getNumberValue()), text + " = " + r);
        }
    }
}
