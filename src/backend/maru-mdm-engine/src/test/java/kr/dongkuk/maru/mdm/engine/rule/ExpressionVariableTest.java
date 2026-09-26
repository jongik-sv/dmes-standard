package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.BOOM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.FROM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.TS;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.hitRows;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.range;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.BOOLEAN;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.NUMBER;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.STRING;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.Test;

/**
 * 식 변수 {@code _V<var_id>} 사전 계산(design §6.5, 06:119-122·424, I14·I30).
 */
class ExpressionVariableTest {

    private final TestFunctions.CountingFn counter = new TestFunctions.CountingFn();
    private final InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
    private final MdmRuleEngine engine = new MdmRuleEngine(
            MdmEvaluatorFixtures.of(TestExpressionConfig.create(new TestFunctions(), Map.of("COUNT_CALL", counter))), lookup);

    private RuleDefinition add(RuleDefinition d) {
        RuleDefinition filled = CellTextGenerator.withTexts(d, x -> null);
        lookup.add(filled);
        return filled;
    }

    /** 식 변수 7(EQUAL) + 결과 R. 1행 {@code _V7 == "A"}, 2행 IS NULL, 3행 NOT NULL. */
    private RuleDefinition rule(String id, String exprText, DataType type) {
        return add(decision(id, 1, HitPolicy.FIRST, FROM,
                List.of(exprVar(7, DispType.EQUAL, exprText, List.of("SPEC_NM"), type, 1),
                        resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("SPEC_NM", STRING)),
                row(1, 1, 7, op("EQ", "A"), 2, val("isA")),
                row(2, 2, 7, op("IS_NULL"), 2, val("null")),
                row(3, 3, 7, op("NOT_NULL"), 2, val("other"))));
    }

    @Test
    void 식_변수를_계산해_셀_텍스트의_V_varId_로_읽는다() {
        RuleDefinition d = rule("E1", "STR_LEFT(COUNT_CALL(SPEC_NM), 1)", STRING);
        assertEquals("_V7 != NULL && _V7 == \"A\"", d.rows().get(0).cells().get(7).text());
        RuleResult r = engine.evaluate("E1", rec("SPEC_NM", "XBC"), TS);
        assertEquals("other", r.results().get("R"));
        assertEquals(List.of(3), hitRows(r));
        assertEquals(1, counter.calls(), "행 셋을 평가해도 레코드마다 한 번");
        assertEquals("isA", engine.evaluate("E1", rec("SPEC_NM", "ABC"), TS).results().get("R"));
        assertEquals(2, counter.calls());
    }

    @Test
    void 참조_변수가_NULL_이면_식을_평가하지_않고_NULL() {
        rule("E2", "COUNT_CALL(SPEC_NM)", STRING);
        RuleResult r = engine.evaluate("E2", rec("SPEC_NM", null), TS);
        assertEquals("null", r.results().get("R"));
        assertEquals(List.of(2), hitRows(r));
        assertEquals(0, counter.calls());
    }

    @Test
    void 식_변수_결과는_선언_타입으로_바꾼다() {
        add(decision("E3", 1, HitPolicy.FIRST, FROM,
                List.of(exprVar(8, DispType.TWO, "SPEC_NM", List.of("SPEC_NM"), NUMBER, 1),
                        resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("SPEC_NM", STRING)),
                row(1, 1, 8, range("<= 변수 <", "1", "2"), 2, val("in"))));
        // 문자열 "10" 이 그대로면 "10" >= 1 && "10" < 2 가 문자열 비교로 참이 된다(E20).
        RuleResult r = engine.evaluate("E3", rec("SPEC_NM", "10"), TS);
        assertNull(r.results().get("R"));
        assertEquals("in", engine.evaluate("E3", rec("SPEC_NM", "1.5"), TS).results().get("R"));
    }

    @Test
    void 식_변수_변환_실패는_ROW_SELECT_TYPE_CONVERSION() {
        add(decision("E4", 1, HitPolicy.FIRST, FROM,
                List.of(exprVar(7, DispType.ONE, "SPEC_NM", List.of("SPEC_NM"), NUMBER, 1),
                        resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("SPEC_NM", STRING)),
                row(1, 1, 7, op("GT", "1"), 2, val("gt"))));
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("E4", rec("SPEC_NM", "abc"), TS));
        assertEquals(List.of("ROW_SELECT/TYPE_CONVERSION/E4/null/_V7"), violations(e));
    }

    @Test
    void 식_변수_평가_예외는_ROW_SELECT_EVALUATION_ERROR() {
        rule("E5", BOOM, STRING);
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("E5", rec("SPEC_NM", "abc"), TS));
        assertEquals(List.of("ROW_SELECT/EVALUATION_ERROR/E5/null/_V7"), violations(e));
    }

    @Test
    void 식_변수_값은_결과와_세트_ctx_에_새지_않는다() {
        rule("E6", "STR_LEFT(SPEC_NM, 1)", STRING);
        RuleResult r = engine.evaluate("E6", rec("SPEC_NM", "ABC"), TS);
        assertEquals(List.of("R"), List.copyOf(r.results().keySet()));
    }

    /**
     * 값 맵의 {@code EVAL_TS}(D23)는 참조 변수 NULL 검사가 읽는 같은 맵에 있다(F13j) — 식 변수가 EVAL_TS 를 참조 변수로
     * 둬도 NULL 로 건너뛰지 않고 평가한다(I46).
     */
    @Test
    void 참조_변수에_EVAL_TS_가_있어도_식_변수를_평가한다() {
        add(decision("E7", 1, HitPolicy.FIRST, FROM,
                List.of(exprVar(9, DispType.ONE, "EVAL_TS != NULL", List.of("EVAL_TS"), BOOLEAN, 1),
                        resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(List.of()),
                row(1, 1, 9, op("EQ", "TRUE"), 2, val("hit"))));
        RuleResult r = engine.evaluate("E7", rec(), TS);
        assertEquals("hit", r.results().get("R"));
        assertEquals(List.of(1), hitRows(r));
    }
}
