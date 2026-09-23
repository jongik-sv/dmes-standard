package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprCondVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.List;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 셀 요약 규칙(design §6.12, 06:315·1320, I37). 값은 저장 문자열 그대로다.
 */
class CellSummaryTest {

    private static final RuleVar EQUAL = condVar(1, DispType.EQUAL, "PROD_TYPE", DataType.STRING, 1);
    private static final RuleVar ONE = condVar(2, DispType.ONE, "COIL_WID", DataType.NUMBER, 2);
    private static final RuleVar TWO = condVar(3, DispType.TWO, "COIL_THK", DataType.NUMBER, 3);
    private static final RuleVar EXPR_COL = exprCondVar(4, 4);
    private static final RuleVar RESULT_VAL = resultVar(5, DispType.VALUE, "QLTY_GRD", DataType.STRING, 1);
    private static final RuleVar RESULT_EXPR = resultVar(6, DispType.EXPRESSION, "PRC_FCT", DataType.NUMBER, 2);

    private static RuleCell cell(String op, String left, String right, List<String> list) {
        return new RuleCell(op, left, right, list, null, null, null, "무시되는 텍스트");
    }

    static Stream<Arguments> cases() {
        return Stream.of(
                Arguments.of("NA", ONE, cell("NA", null, null, null), "-"),
                Arguments.of("Equal 열 EQ", EQUAL, cell("EQ", "COIL", null, null), "COIL"),
                Arguments.of("Equal 열 EQ 패턴", EQUAL, cell("EQ", "SGC%", null, null), "SGC%"),
                Arguments.of("Equal 열 NA", EQUAL, cell("NA", null, null, null), "-"),
                Arguments.of("1 열 EQ", ONE, cell("EQ", "SGC%", null, null), "= SGC%"),
                Arguments.of("NE", ONE, cell("NE", "C", null, null), "<> C"),
                Arguments.of("LT", ONE, cell("LT", "2.5", null, null), "< 2.5"),
                Arguments.of("LE", ONE, cell("LE", "2.50", null, null), "<= 2.50"),
                Arguments.of("GT", ONE, cell("GT", "1000", null, null), "> 1000"),
                Arguments.of("GE", TWO, cell("GE", "2.5", null, null), ">= 2.5"),
                Arguments.of("IN 하나", ONE, cell("IN", null, null, List.of("A")), "IN (A)"),
                Arguments.of("IN 둘", ONE, cell("IN", null, null, List.of("A", "B")), "IN (A, B)"),
                Arguments.of("NOT_IN", ONE, cell("NOT_IN", null, null, List.of("C")), "NOT IN (C)"),
                Arguments.of("NOT_IN 둘", ONE, cell("NOT_IN", null, null, List.of("C", "D")), "NOT IN (C, D)"),
                Arguments.of("CODE_IN", ONE, cell("CODE_IN", "PLATING", null, null), "IN 카테고리 PLATING"),
                Arguments.of("CONTAINS", ONE, cell("CONTAINS", "CC", null, null), "CONTAINS CC"),
                Arguments.of("INSTR", ONE, cell("INSTR", "SGCC,SGHC", null, null), "INSTR SGCC,SGHC"),
                Arguments.of("IS_NULL", ONE, cell("IS_NULL", null, null, null), "IS NULL"),
                Arguments.of("NOT_NULL", ONE, cell("NOT_NULL", null, null, null), "IS NOT NULL"),
                Arguments.of("구간 <= <", TWO, cell("<= 변수 <", "1.6", "2.5", null), "1.6 <= 변수 < 2.5"),
                Arguments.of("구간 <= <=", TWO, cell("<= 변수 <=", "1", "1.2", null), "1 <= 변수 <= 1.2"),
                Arguments.of("구간 < <=", TWO, cell("< 변수 <=", "0", "0.5", null), "0 < 변수 <= 0.5"),
                Arguments.of("구간 < <", TWO, cell("< 변수 <", "0.5", "0.6", null), "0.5 < 변수 < 0.6"),
                Arguments.of("Expression 셀", EXPR_COL,
                        new RuleCell(null, null, null, null, "COIL_THK * COIL_WID > 3000", null, null, "x"),
                        "COIL_THK * COIL_WID > 3000"),
                Arguments.of("결과 Value", RESULT_VAL, new RuleCell(null, null, null, null, null, null, "A", "\"A\""), "A"),
                Arguments.of("결과 Value 숫자", RESULT_VAL, new RuleCell(null, null, null, null, null, null, "1.050", "1.05"),
                        "1.050"),
                Arguments.of("결과 Expression", RESULT_EXPR,
                        new RuleCell(null, null, null, null, "ROUND(BASE_FCT * 0.98, 2)", null, null, "x"),
                        "ROUND(BASE_FCT * 0.98, 2)"),
                Arguments.of("모르는 op", ONE, cell("LIKE", "A", null, null), "LIKE"),
                Arguments.of("변수 없음 EQ", null, cell("EQ", "COIL", null, null), "= COIL"),
                Arguments.of("변수 없음 NA", null, cell("NA", null, null, null), "-"),
                Arguments.of("null 값", ONE, cell("GT", null, null, null), "> "),
                Arguments.of("따옴표 그대로", ONE, cell("EQ", "a\"b", null, null), "= a\"b"));
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("cases")
    void 셀_요약(String name, RuleVar var, RuleCell cell, String expected) {
        assertEquals(expected, CellSummary.of(var, cell));
    }
}
