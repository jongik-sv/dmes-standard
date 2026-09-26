package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.BOOM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.FROM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.TS;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.trace;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.derive;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rowContract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.NUMBER;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.Test;

/**
 * 산출 룰(DERIVE) 순차 평가(design §6.6, 06:975, WR:49, I32).
 */
class DeriveRuleTest {

    private final InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleResult run(RuleDefinition d, Map<String, Object> record) {
        lookup.add(CellTextGenerator.withTexts(d, x -> null));
        return engine.evaluate(d.ruleId(), record, TS);
    }

    /** var_id 는 seq 와 거꾸로 둔다: X(var 9, seq 1) → Y(var 5, seq 2) → Z(var 2, seq 3). */
    private static RuleDefinition chain() {
        return derive("DV", 1, FROM,
                List.of(resultVar(2, DispType.EXPRESSION, "Z", NUMBER, 3),
                        resultVar(5, DispType.EXPRESSION, "Y", NUMBER, 2),
                        resultVar(9, DispType.EXPRESSION, "X", NUMBER, 1)),
                contract(List.of(), rowContract(1, vts("A", NUMBER))),
                row(1, 1, 2, expr("Y * 10"), 5, expr("X + 1"), 9, expr("A * 2")));
    }

    @Test
    void 뒤_식이_앞_결과를_읽는다() {
        RuleResult r = run(chain(), rec("A", 5));
        assertNum("10", r.results().get("X"));
        assertNum("11", r.results().get("Y"));
        assertNum("110", r.results().get("Z"));
        assertEquals(List.of("X", "Y", "Z"), List.copyOf(r.results().keySet()));
    }

    @Test
    void hits_는_행_하나이고_trace_는_한_줄() {
        RuleResult r = run(chain(), rec("A", "5"));
        assertEquals(List.of(new RuleResult.Hit(1, 1, Map.of())), r.hits());
        assertEquals(List.of("1:T/T/-"), trace(r));
        assertFalse(r.defaultApplied());
    }

    @Test
    void 행_계약을_검사한다() {
        lookup.add(CellTextGenerator.withTexts(chain(), x -> null));
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("DV", rec("B", 1), TS));
        assertEquals(List.of("RESULT_CHECK/MISSING_KEY/DV/1/A"), violations(e));
    }

    @Test
    void 결과_식_예외는_RESULT_EVAL() {
        RuleDefinition d = derive("DE", 1, FROM,
                List.of(resultVar(1, DispType.EXPRESSION, "X", NUMBER, 1)),
                contract(List.of()),
                row(1, 1, 1, expr(BOOM)));
        lookup.add(CellTextGenerator.withTexts(d, x -> null));
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("DE", rec(), TS));
        assertEquals(List.of("RESULT_EVAL/EVALUATION_ERROR/DE/1/null"), violations(e));
    }

    @Test
    void NORMAL_행이_없으면_hits_trace_가_비고_결과는_null() {
        RuleDefinition d = derive("D0", 1, FROM,
                List.of(resultVar(1, DispType.EXPRESSION, "X", NUMBER, 1)),
                contract(List.of()));
        RuleResult r = run(d, rec());
        assertEquals(List.of(), r.hits());
        assertEquals(List.of(), r.trace());
        assertNull(r.results().get("X"));
        assertEquals(List.of("X"), List.copyOf(r.results().keySet()));
    }
}
