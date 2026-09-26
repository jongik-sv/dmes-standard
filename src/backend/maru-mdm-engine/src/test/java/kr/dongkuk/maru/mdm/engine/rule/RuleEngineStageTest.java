package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.hitRows;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.trace;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.defaultRow;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprCondVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.na;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rowContract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withText;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.BOOLEAN;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.NUMBER;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.STRING;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.ezylang.evalex.data.EvaluationValue;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.Test;

/**
 * 4단계 판정·예약 키·EVAL_TS·타입 변환·오류 매핑·경고·trace(design §6.2·§6.8·§6.9, I17-I19·I26-I29·I38).
 */
class RuleEngineStageTest {

    static final LocalDateTime FROM = LocalDateTime.of(2026, 1, 1, 0, 0);
    static final Instant TS = Instant.parse("2026-09-30T15:00:00Z");
    /** 평가하면 예외가 나는 식(정의되지 않은 변수, E9). */
    static final String BOOM = "UNDEFINED_Q > 1";

    private final TestFunctions functions = new TestFunctions().code("C", "K", "A");
    private final InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
    private final MdmRuleEngine engine =
            new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create(functions)), lookup);

    private static RuleDefinition gen(RuleDefinition d) {
        return CellTextGenerator.withTexts(d, x -> null);
    }

    private RuleResult run(RuleDefinition d, Map<String, Object> record) {
        lookup.add(d);
        return engine.evaluate(d.ruleId(), record, TS);
    }

    private EngineEvaluationException fail(RuleDefinition d, Map<String, Object> record) {
        lookup.add(d);
        return assertThrows(EngineEvaluationException.class, () -> engine.evaluate(d.ruleId(), record, TS));
    }

    /** 조건 A(NUMBER, ONE)·B(STRING, ONE), 결과 R(STRING). 1행 A > 1 → "X", 2행 B == "b" → "Y". */
    private static RuleDefinition simple(String id) {
        return gen(decision(id, 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), condVar(2, DispType.ONE, "B", STRING, 2),
                        resultVar(3, DispType.VALUE, "R", STRING, 1)),
                contract(vts("A", NUMBER, "B", STRING)),
                row(1, 1, 1, op("GT", "1"), 2, na(), 3, val("X")),
                row(2, 2, 1, na(), 2, op("EQ", "b"), 3, val("Y"))));
    }

    // ------------------------------------------------------------------ 1단계 INPUT_CHECK

    @Test
    void 조건_변수_키가_여럿_없으면_한_예외에_모두_담는다() {
        EngineEvaluationException e = fail(simple("T"), rec("C", 1));
        assertEquals(List.of("INPUT_CHECK/MISSING_KEY/T/null/A", "INPUT_CHECK/MISSING_KEY/T/null/B"), violations(e));
    }

    @Test
    void 입력_계약_키는_대소문자까지_정확히_맞아야_한다() {
        EngineEvaluationException e = fail(simple("T"), rec("a", BigDecimal.ONE, "B", "b"));
        assertEquals(List.of("INPUT_CHECK/MISSING_KEY/T/null/A"), violations(e));
    }

    @Test
    void 조건_변수_타입_변환_실패는_INPUT_CHECK_TYPE_CONVERSION() {
        EngineEvaluationException e = fail(simple("T"), rec("A", "abc", "B", Boolean.TRUE));
        assertEquals(List.of("INPUT_CHECK/TYPE_CONVERSION/T/null/A", "INPUT_CHECK/TYPE_CONVERSION/T/null/B"),
                violations(e));
    }

    @Test
    void 앞_단계_위반이_있으면_뒤_단계를_돌지_않는다() {
        RuleDefinition d = RuleFixtures.replaceCell(simple("T"), 1, 1, withText(op("GT", "1"), BOOM));
        EngineEvaluationException e = fail(d, rec("B", "b"));
        assertEquals(List.of("INPUT_CHECK/MISSING_KEY/T/null/A"), violations(e));
    }

    @Test
    void 예약_키는_INPUT_CHECK_로_거부한다() {
        EngineEvaluationException e = fail(simple("T"), rec("A", BigDecimal.ONE, "B", "b", "pi", 1, "Null", 1,
                "eval_ts", 1, "_X", 1, "_v1", 1));
        assertEquals(List.of("INPUT_CHECK/CONSTANT_KEY/T/null/pi", "INPUT_CHECK/CONSTANT_KEY/T/null/Null",
                "INPUT_CHECK/EVAL_TS_KEY/T/null/eval_ts", "INPUT_CHECK/RESERVED_KEY/T/null/_X",
                "INPUT_CHECK/RESERVED_KEY/T/null/_v1"), violations(e));
    }

    @Test
    void 대소문자만_다른_키_둘은_RESERVED_KEY_하나() {
        EngineEvaluationException e = fail(simple("T"), rec("A", BigDecimal.ONE, "B", "b", "COIL_THK", 1, "coil_thk", 2,
                "Coil_Thk", 3));
        assertEquals(List.of("INPUT_CHECK/RESERVED_KEY/T/null/COIL_THK,Coil_Thk,coil_thk"), violations(e));
    }

    @Test
    void 룰이_없으면_INPUT_CHECK_RULE_NOT_FOUND() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("NOPE", rec(), TS));
        assertEquals(List.of("INPUT_CHECK/RULE_NOT_FOUND/NOPE/null/null"), violations(e));
    }

    @Test
    void 필수_인자가_null_이면_NPE() {
        assertThrows(NullPointerException.class, () -> engine.evaluate(null, rec(), TS));
        assertThrows(NullPointerException.class, () -> engine.evaluate("T", null, TS));
        assertThrows(NullPointerException.class, () -> engine.evaluate("T", rec(), null));
    }

    // ------------------------------------------------------------------ EVAL_TS(I28)

    @Test
    void EVAL_TS_는_초_미만을_자른다() {
        RuleDefinition d = gen(decision("TS", 1, HitPolicy.FIRST, FROM,
                List.of(exprCondVar(1, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("K", STRING)),
                row(1, 1, 1, expr("MASTER(\"C\", \"K\", K)"), 2, val("hit"))));
        lookup.add(d);
        Instant raw = Instant.parse("2026-09-30T15:00:07.987654321Z");
        Instant cut = Instant.parse("2026-09-30T15:00:07Z");
        RuleResult r = engine.evaluate("TS", rec("K", "A"), raw);
        assertEquals("hit", r.results().get("R"));
        assertEquals(cut, r.evalTs());
        assertEquals(List.of(cut), lookup.ruleEvalTs());
        assertEquals(1, functions.seenEvalTs().size());
        EvaluationValue seen = functions.seenEvalTs().get(0);
        assertTrue(seen.isDateTimeValue(), seen.toString());
        assertEquals(cut, seen.getDateTimeValue());
    }

    @Test
    void EVAL_TS_는_설정_시간대와_무관하게_Instant_로_넣는다() {
        // KST 벽시계 LocalDateTime 으로 넣으면 설정 시간대가 KST 일 때만 같은 순간이 된다. UTC 설정에서 차이가 드러난다.
        TestFunctions utcFunctions = new TestFunctions().code("C", "K", "A");
        MdmRuleEngine utc = new MdmRuleEngine(
                MdmEvaluatorFixtures.of(TestExpressionConfig.create(utcFunctions, Map.of(), java.time.ZoneOffset.UTC)), lookup);
        lookup.add(gen(decision("TZ", 1, HitPolicy.FIRST, FROM,
                List.of(exprCondVar(1, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("K", STRING)),
                row(1, 1, 1, expr("MASTER(\"C\", \"K\", K)"), 2, val("hit")))));
        Instant raw = Instant.parse("2026-09-30T15:00:07.5Z");
        utc.evaluate("TZ", rec("K", "A"), raw);
        EvaluationValue seen = utcFunctions.seenEvalTs().get(0);
        assertTrue(seen.isDateTimeValue(), seen.toString());
        assertEquals(Instant.parse("2026-09-30T15:00:07Z"), seen.getDateTimeValue());
    }

    // ------------------------------------------------------------------ 2단계 ROW_SELECT(I18·I19)

    @Test
    void NA_셀은_평가하지_않는다() {
        RuleDefinition d = RuleFixtures.replaceCell(simple("T"), 1, 2, withText(na(), BOOM));
        RuleResult r = run(d, rec("A", new BigDecimal("5"), "B", "z"));
        assertEquals("X", r.results().get("R"));
        assertEquals(List.of("1:T/T/-"), trace(r).subList(0, 1));
    }

    private static RuleDefinition exprRule(String id, String cond1, String cond2) {
        return decision(id, 1, HitPolicy.FIRST, FROM,
                List.of(exprCondVar(1, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("X", BOOLEAN)),
                row(1, 1, 1, expr(cond1), 2, val("first")),
                row(2, 2, 1, expr(cond2), 2, val("second")));
    }

    @Test
    void Expression_셀_NULL_은_거짓과_경고() {
        RuleResult r = run(gen(exprRule("N", "X", "TRUE")), rec("X", null));
        assertEquals("second", r.results().get("R"));
        assertEquals(List.of("1:T/F/1", "2:T/T/-"), trace(r));
        assertEquals(List.of(new EngineWarning(EngineWarning.Code.EXPR_CELL_NULL, "N", 1, 1,
                r.warnings().get(0).message())), r.warnings());
    }

    @Test
    void 조건_셀_결과가_불린이_아니면_평가_오류() {
        EngineEvaluationException e = fail(gen(exprRule("NB", "1 + 1", "TRUE")), rec("X", null));
        assertEquals(List.of("ROW_SELECT/EVALUATION_ERROR/NB/1/null"), violations(e));
    }

    @Test
    void 조건_셀_평가_예외는_ROW_SELECT_EVALUATION_ERROR_이고_행마다_모은다() {
        RuleDefinition d = gen(decision("EX", 1, HitPolicy.UNIQUE, FROM,
                List.of(exprCondVar(1, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("X", BOOLEAN)),
                row(1, 1, 1, expr(BOOM), 2, val("a")),
                row(2, 2, 1, expr("TRUE"), 2, val("b")),
                row(3, 3, 1, expr("X > 1"), 2, val("c"))));
        EngineEvaluationException e = fail(d, rec("X", null));
        assertEquals(List.of("ROW_SELECT/EVALUATION_ERROR/EX/1/null", "ROW_SELECT/EVALUATION_ERROR/EX/3/null"),
                violations(e));
        assertTrue(e.violations().get(0).message().contains("var 1"), e.violations().get(0).message());
    }

    // ------------------------------------------------------------------ 3단계 RESULT_CHECK(I26)

    @Test
    void 결과_검사는_결과를_낼_행의_계약만_보고_위반을_모은다() {
        RuleDefinition d = gen(decision("RC", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.EXPRESSION, "R", NUMBER, 1)),
                contract(vts("A", NUMBER), rowContract(1, vts("P", NUMBER, "Q", NUMBER, "S", NUMBER), vts("O", NUMBER)),
                        rowContract(2, vts("Z", NUMBER))),
                row(1, 1, 1, op("GT", "1"), 2, expr("P + Q")),
                row(2, 2, 1, op("LE", "1"), 2, expr("Z"))));
        EngineEvaluationException e = fail(d, rec("A", new BigDecimal("5"), "Q", null, "S", "abc"));
        assertEquals(List.of("RESULT_CHECK/MISSING_KEY/RC/1/P", "RESULT_CHECK/REQUIRED_NULL/RC/1/Q",
                "RESULT_CHECK/TYPE_CONVERSION/RC/1/S"), violations(e));
    }

    @Test
    void 결과_검사는_행_변수를_선언_타입으로_바꾼다() {
        RuleDefinition d = gen(decision("RV", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.EXPRESSION, "R", NUMBER, 1)),
                contract(vts("A", NUMBER), rowContract(1, vts("P", NUMBER), vts("O", NUMBER))),
                row(1, 1, 1, op("GT", "1"), 2, expr("P * 2"))));
        RuleResult r = run(d, rec("A", 5, "P", "1.5"));
        assertNum("3", r.results().get("R"));
    }

    // ------------------------------------------------------------------ 4단계 RESULT_EVAL(I27·I38)

    @Test
    void 결과_식_예외는_RESULT_EVAL_EVALUATION_ERROR() {
        RuleDefinition d = gen(decision("RE", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.EXPRESSION, "R", NUMBER, 1),
                        resultVar(3, DispType.EXPRESSION, "S", NUMBER, 2)),
                contract(vts("A", NUMBER)),
                row(1, 1, 1, op("GT", "1"), 2, expr(BOOM), 3, expr("1 / 0"))));
        EngineEvaluationException e = fail(d, rec("A", 5));
        assertEquals(List.of("RESULT_EVAL/EVALUATION_ERROR/RE/1/null", "RESULT_EVAL/EVALUATION_ERROR/RE/1/null"),
                violations(e));
    }

    @Test
    void 결과_값의_선언_타입_변환_실패는_RESULT_EVAL_TYPE_CONVERSION() {
        RuleDefinition d = gen(decision("RT", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.EXPRESSION, "R", NUMBER, 1)),
                contract(vts("A", NUMBER)),
                row(1, 1, 1, op("GT", "1"), 2, expr("\"abc\""))));
        EngineEvaluationException e = fail(d, rec("A", 5));
        assertEquals(List.of("RESULT_EVAL/TYPE_CONVERSION/RT/1/R"), violations(e));
    }

    @Test
    void 적중하지_않은_행의_결과_식은_평가하지_않는다() {
        RuleDefinition d = gen(decision("NH", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.EXPRESSION, "R", NUMBER, 1)),
                contract(vts("A", NUMBER)),
                row(1, 1, 1, op("GT", "100"), 2, expr(BOOM)),
                row(2, 2, 1, op("GT", "1"), 2, expr("7")),
                defaultRow(3, 2, expr(BOOM))));
        RuleResult r = run(d, rec("A", 5));
        assertNum("7", r.results().get("R"));
        assertEquals(List.of(2), hitRows(r));
    }

    @Test
    void 결과_맵은_결과_열_seq_순이고_null_값을_담는_불변_맵이다() {
        RuleDefinition d = gen(decision("RM", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1),
                        resultVar(9, DispType.VALUE, "ZZ", STRING, 1),
                        resultVar(3, DispType.VALUE, "AA", STRING, 3),
                        resultVar(5, DispType.EXPRESSION, "MM", NUMBER, 2)),
                contract(vts("A", NUMBER)),
                row(1, 1, 1, op("GT", "1"), 9, val("z"), 5, expr("NULL"))));
        RuleResult r = run(d, rec("A", 5));
        assertEquals(List.of("ZZ", "MM", "AA"), List.copyOf(r.results().keySet()));
        assertEquals("z", r.results().get("ZZ"));
        assertTrue(r.results().containsKey("MM"));
        assertNull(r.results().get("MM"));
        assertNull(r.results().get("AA"));
        assertThrows(UnsupportedOperationException.class, () -> r.results().put("X", 1));
        assertThrows(UnsupportedOperationException.class, () -> r.hits().clear());
        assertThrows(UnsupportedOperationException.class, () -> r.trace().clear());
        assertThrows(UnsupportedOperationException.class, () -> r.warnings().clear());
    }

    @Test
    void 결과_숫자는_EvalEx_가_낸_BigDecimal_그대로다() {
        RuleDefinition d = gen(decision("BD", 1, HitPolicy.FIRST, FROM,
                List.of(condVar(1, DispType.ONE, "A", NUMBER, 1), resultVar(2, DispType.EXPRESSION, "R", NUMBER, 1)),
                contract(vts("A", NUMBER)),
                row(1, 1, 1, op("GT", "1"), 2, expr("100"))));
        RuleResult r = run(d, rec("A", 5));
        assertEquals(new BigDecimal("1E+2"), r.results().get("R"));
    }

    @Test
    void 입력_레코드는_바꾸지_않는다() {
        Map<String, Object> record = rec("A", "5", "B", "b");
        run(simple("T"), record);
        assertEquals("5", record.get("A"));
        assertFalse(record.containsKey("EVAL_TS"));
    }
}
