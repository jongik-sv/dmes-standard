package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker.Problem;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.testsupport.InMemoryLookups;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * TSK-03-02 design.md §3.1·§6.4 — 저장 시 검사(06:446, 06:339·346·347·348). 파싱 → 칸별 함수 화이트리스트 →
 * {@code DOMAIN_STD} 의 {@code value} 전용 → 예약 변수 → {@code MASTER} 인자 모양 → {@code STR_MATCHES} 정규식.
 */
class ExpressionCheckerTest {

    private static final ExpressionChecker CHECKER = new ExpressionChecker(new MdmEvaluator(InMemoryLookups.create().build()));

    private static List<String> kinds(List<Problem> problems) {
        return problems.stream().map(Problem::kind).toList();
    }

    @Test
    void DOMAIN_STD_는_value_외_변수를_거부한다() {
        List<Problem> problems = CHECKER.check("value >= COIL_NET_WGT", Slot.DOMAIN_STD);
        assertAll(
                () -> assertEquals(List.of(ExpressionChecker.VARIABLE), kinds(problems)),
                () -> assertTrue(problems.get(0).detail().contains("COIL_NET_WGT"), problems.toString()));
    }

    @Test
    void DOMAIN_BIZ_는_다른_컬럼_변수를_받는다() {
        assertEquals(List.of(), CHECKER.check("value >= COIL_NET_WGT", Slot.DOMAIN_BIZ));
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"EVAL_TS > 0", "eval_ts > 0", "_V1 > 0", "_x == 1"})
    void 식_안의_예약_변수를_거부한다(String text) {
        assertEquals(List.of(ExpressionChecker.RESERVED), kinds(CHECKER.check(text, Slot.RULE_COND_EXPR)));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
            "NULL, true", "null, true", "TRUE, true", "Pi, true", "e, true", "DT_FORMAT_LOCAL_DATE, true",
            "_V1, true", "EVAL_TS, true",
            "COIL_THK, false"})
    void 선언_변수명_검사(String name, boolean rejected) {
        List<Problem> problems = ExpressionChecker.checkVariableName(name);
        assertEquals(rejected ? List.of(ExpressionChecker.RESERVED) : List.of(), kinds(problems));
    }

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource(delimiter = '|', value = {
            "MASTER(\"A\", \"B\", value, \"attr01\", \"x\")|true",
            "MASTER_AT(\"A\", \"B\", value, D, \"attr01\", \"x\")|true",
            "MASTER(X, \"B\", value)|true",
            "MASTER(\"A\", C, value)|true",
            "MASTER(\"A\", \"B\", value, \"attr11\")|true",
            "MASTER(\"A\", \"B\", value, \"ATTR01\")|true",
            "MASTER(\"A\", \"B\", value, A1)|true",
            "MASTER(\"A\", \"B\", value)|false",
            "MASTER(\"A\", \"B\", value, \"attr10\")|false",
            "MASTER_AT(\"A\", \"B\", value, ORDER_DT)|false",
            "MASTER_AT(\"A\", \"B\", value, ORDER_DT, \"attr01\")|false"})
    void MDM_인자_모양(String text, boolean rejected) {
        List<String> kinds = kinds(CHECKER.check(text, Slot.RULE_COND_EXPR));
        assertEquals(rejected ? List.of(ExpressionChecker.MDM_ARGUMENT) : List.of(), kinds, text);
    }
}
