package com.dongkuk.dmes.mdm.common.rule.check;

import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.CHECKER;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.EVALUATOR;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cell;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.codes;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cond;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.expr;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.exprColumn;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.result;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCellRules.Result;
import com.dongkuk.dmes.mdm.common.rule.check.RuleExpressionChecks.Scope;
import com.ezylang.evalex.parser.ParseException;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** TSK-08-04 design §3.1 「RuleExpressionChecksTest」 — I11(식 자리)·I12. */
class RuleExpressionChecksTest {

    private static final RuleExpressionChecks CHECKS = new RuleExpressionChecks(CHECKER, EVALUATOR);
    private static final ResolvedVar THK = cond(1, "2", "COIL_THK", "NUMBER");
    private static final ResolvedVar WID = cond(2, "1", "COIL_WID", "NUMBER");
    private static final ResolvedVar EX = exprColumn(3, "두께 조건");
    private static final ResolvedVar A = result(4, 1, "Expression", "WGT_A", "NUMBER");
    private static final ResolvedVar B = result(5, 2, "Expression", "WGT_B", "NUMBER");
    private static final ResolvedVar C = result(6, 3, "Expression", "WGT_C", "NUMBER");
    private static final List<ResolvedVar> VARS = List.of(THK, WID, EX, A, B, C);
    private static final Set<String> COLUMNS = Set.of("PROD_LEN");

    private static Scope scope(String ruleKind) {
        return RuleExpressionChecks.scope(VARS, ruleKind, COLUMNS::contains);
    }

    private static Map<String, Object> ast(String text) throws ParseException {
        return AstExporter.export(text, EVALUATOR.configuration());
    }

    @Test
    void AST_의_비교_노드는_INFIX_OPERATOR_이고_변수는_VARIABLE_OR_CONSTANT_다() throws ParseException {
        Map<String, Object> root = ast("COIL_THK > 1");
        assertEquals("INFIX_OPERATOR", root.get("type"));
        assertEquals(">", root.get("value"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> params = (List<Map<String, Object>>) root.get("params");
        assertEquals("VARIABLE_OR_CONSTANT", params.get(0).get("type"));
    }

    @Test
    void 통과하는_식은_이슈가_없다() {
        assertEquals(List.of(), CHECKS.condition(scope("DECISION"), expr("COIL_THK > 1 && COIL_WID < 3")).problems());
        // 컬럼 사전·다른 룰 결과(외부 판정)와 이 룰의 COND 변수는 대소문자를 가리지 않는다.
        assertEquals(List.of(), CHECKS.condition(scope("DECISION"), expr("coil_thk > PROD_LEN")).problems());
    }

    @Test
    void 파싱_실패는_EXPR_PARSE_다() {
        assertEquals(List.of("EXPR_PARSE"), codes(CHECKS.condition(scope("DECISION"), expr("COIL_THK >")).problems()));
    }

    @Test
    void 표준_칸_밖_함수는_EXPR_PROBLEM_이다() {
        Result r = CHECKS.condition(scope("DECISION"), expr("THK_OK(COIL_THK)"));
        assertEquals(List.of("EXPR_PROBLEM"), codes(r.problems()));
        assertTrue(r.problems().get(0).message().startsWith("FUNCTION"), r.problems().get(0).message());
    }

    @Test
    void STR_MATCHES_의_Java_전용_문법은_거부한다() {
        Result r = CHECKS.condition(scope("DECISION"), expr("STR_MATCHES(PROD_LEN, \"(?i)abc\")"));
        assertEquals(List.of("EXPR_PROBLEM"), codes(r.problems()));
        assertTrue(r.problems().get(0).message().startsWith("REGEX"), r.problems().get(0).message());
    }

    @Test
    void MASTER_인자_모양이_틀리면_거부한다() {
        Result r = CHECKS.condition(scope("DECISION"), expr("MASTER(\"A\", \"B\", COIL_THK, \"attr11\")"));
        assertEquals(List.of("EXPR_PROBLEM"), codes(r.problems()));
        assertTrue(r.problems().get(0).message().startsWith("MDM_ARGUMENT"), r.problems().get(0).message());
    }

    @Test
    void 모르는_변수는_거부한다() {
        Result r = CHECKS.condition(scope("DECISION"), expr("COIL_THK > 1 && UNKNOWN_X == 2"));
        assertEquals(List.of("EXPR_UNKNOWN_VAR"), codes(r.problems()));
        assertTrue(r.problems().get(0).message().contains("UNKNOWN_X"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"COIL_THK > 1 && COIL_THK < 3", "1 < COIL_THK && COIL_THK <= 3", "COIL_THK >= 1 || coil_thk <= 0",
        "IF(COIL_THK > 1, COIL_THK < 3, FALSE)"})
    void 같은_변수를_대소_비교로_두_번_이상_견주면_거부한다(String text) {
        assertEquals(List.of("RANGE_IN_EXPR"), codes(CHECKS.condition(scope("DECISION"), expr(text)).problems()));
    }

    @ParameterizedTest
    @ValueSource(strings = {"COIL_THK > 1 && COIL_WID < 3", "COIL_THK > 1 && COIL_THK != 2", "COIL_THK > COIL_WID"})
    void 대소_비교가_한_번이면_통과한다(String text) {
        assertEquals(List.of(), CHECKS.condition(scope("DECISION"), expr(text)).problems());
    }

    @Test
    void 결과_식은_범위_자리_검사를_하지_않는다() {
        assertEquals(List.of(), CHECKS.result(scope("DECISION"), A, expr("IF(COIL_THK > 1 && COIL_THK < 3, 1, 2)")).problems());
    }

    @Test
    void 화면이_보낸_ast_를_서버_AST_로_덮어쓴다() throws ParseException {
        Map<String, Object> in = cell("expr", "COIL_THK > 1", "ast", Map.of("type", "NUMBER_LITERAL", "value", "999"));
        Result r = CHECKS.condition(scope("DECISION"), in);
        assertEquals(List.of(), r.problems());
        assertEquals(ast("COIL_THK > 1"), r.cell().get("ast"));
        assertEquals("999", ((Map<?, ?>) in.get("ast")).get("value"), "입력 셀은 바꾸지 않는다");
        Result res = CHECKS.result(scope("DECISION"), A, cell("expr", "COIL_THK * 2"));
        assertEquals(ast("COIL_THK * 2"), res.cell().get("ast"));
    }

    @Test
    void 산출_룰_결과_식은_앞_seq_결과만_읽는다() {
        assertEquals(List.of(), CHECKS.result(scope("DERIVE"), B, expr("WGT_A * 2")).problems());
        assertEquals(List.of("EXPR_DERIVE_ORDER"), codes(CHECKS.result(scope("DERIVE"), B, expr("WGT_B + 1")).problems()));
        assertEquals(List.of("EXPR_DERIVE_ORDER"), codes(CHECKS.result(scope("DERIVE"), B, expr("wgt_c + 1")).problems()));
    }

    @Test
    void 산출_룰이_아니면_이_룰의_결과_변수를_읽지_못한다() {
        assertEquals(List.of("EXPR_UNKNOWN_VAR"), codes(CHECKS.result(scope("DECISION"), B, expr("WGT_A * 2")).problems()));
    }

    @Test
    void 조건_식은_이_룰의_결과_변수를_읽지_못한다() {
        assertEquals(List.of("EXPR_UNKNOWN_VAR"), codes(CHECKS.condition(scope("DERIVE"), expr("WGT_A > 1")).problems()));
    }

    @Test
    void 식_길이_상한과_같으면_통과하고_넘으면_거부한다() {
        String atLimit = "COIL_THK > 1" + " ".repeat(RuleLimits.MAX_EXPR_CHARS - "COIL_THK > 1".length());
        assertEquals(List.of(), CHECKS.condition(scope("DECISION"), expr(atLimit)).problems());
        assertEquals(List.of("LIMIT_EXCEEDED"), codes(CHECKS.condition(scope("DECISION"), expr(atLimit + " ")).problems()));
    }
}
