package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.trace;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.exprCondVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
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
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import org.junit.jupiter.api.Test;

/**
 * 조건 셀 판정 재사용 — 레코드 한 건 안에서 같은 식 텍스트는 한 번만 평가한다. 행 결과·trace·경고·위반은 재사용 전과 같다.
 * 평가 횟수는 테스트 MASTER 가 부를 때마다 남기는 EVAL_TS 기록 수로 센다.
 */
class ConditionResultCacheTest {

    static final LocalDateTime FROM = LocalDateTime.of(2026, 1, 1, 0, 0);
    static final Instant TS = Instant.parse("2026-09-30T15:00:00Z");
    static final String IN_CODE = "MASTER(\"C\", \"K\", K)";

    private final TestFunctions functions = new TestFunctions().code("C", "K", "A");
    private final InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
    private final MdmRuleEngine engine =
            new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create(functions)), lookup);

    /** 조건 1열 = 같은 MASTER 식, 2열 = A 문턱값(행마다 다름). 1·2행은 2열에서 떨어지고 3행이 맞는다. */
    private void addSameMasterRule() {
        lookup.add(CellTextGenerator.withTexts(decision("M", 1, HitPolicy.FIRST, FROM,
                List.of(exprCondVar(1, 1), condVar(2, DispType.ONE, "A", NUMBER, 2),
                        resultVar(3, DispType.VALUE, "R", STRING, 1)),
                contract(vts("K", STRING, "A", NUMBER)),
                row(1, 1, 1, expr(IN_CODE), 2, op("GT", "10"), 3, val("r1")),
                row(2, 2, 1, expr(IN_CODE), 2, op("GT", "5"), 3, val("r2")),
                row(3, 3, 1, expr(IN_CODE), 2, op("GT", "1"), 3, val("r3"))), x -> null));
    }

    /** 조건 1열만. 1·2행은 같은 식, 3행은 TRUE. */
    private static RuleDefinition twoSameThenTrue(String id, String cond) {
        return CellTextGenerator.withTexts(decision(id, 1, HitPolicy.FIRST, FROM,
                List.of(exprCondVar(1, 1), resultVar(2, DispType.VALUE, "R", STRING, 1)),
                contract(vts("X", BOOLEAN)),
                row(1, 1, 1, expr(cond), 2, val("r1")),
                row(2, 2, 1, expr(cond), 2, val("r2")),
                row(3, 3, 1, expr("TRUE"), 2, val("r3"))), x -> null);
    }

    @Test
    void 같은_조건_식은_레코드_한_건에서_한_번만_평가한다() {
        addSameMasterRule();
        RuleResult r = engine.evaluate("M", rec("K", "A", "A", new BigDecimal("3")), TS);
        assertEquals("r3", r.results().get("R"));
        assertEquals(List.of("1:T/F/2", "2:T/F/2", "3:T/T/-"), trace(r));
        assertEquals(1, functions.seenEvalTs().size());
    }

    @Test
    void 레코드가_바뀌면_다시_평가한다() {
        addSameMasterRule();
        engine.evaluate("M", rec("K", "A", "A", new BigDecimal("3")), TS);
        RuleResult r = engine.evaluate("M", rec("K", "B", "A", new BigDecimal("3")), TS);
        assertEquals(2, functions.seenEvalTs().size());
        assertEquals(List.of("1:T/F/1", "2:T/F/1", "3:T/F/1"), trace(r));
    }

    @Test
    void NULL_결과는_재사용하지_않고_행마다_경고한다() {
        lookup.add(twoSameThenTrue("N", "X"));
        RuleResult r = engine.evaluate("N", rec("X", null), TS);
        assertEquals("r3", r.results().get("R"));
        assertEquals(List.of("1:T/F/1", "2:T/F/1", "3:T/T/-"), trace(r));
        assertEquals(List.of(1, 2), r.warnings().stream().map(EngineWarning::rowId).toList());
        assertEquals(List.of(EngineWarning.Code.EXPR_CELL_NULL, EngineWarning.Code.EXPR_CELL_NULL),
                r.warnings().stream().map(EngineWarning::code).toList());
    }

    @Test
    void 평가_오류는_재사용하지_않고_행마다_위반한다() {
        lookup.add(twoSameThenTrue("E", "1 + 1"));
        EngineEvaluationException e =
                assertThrows(EngineEvaluationException.class, () -> engine.evaluate("E", rec("X", null), TS));
        assertEquals(List.of("ROW_SELECT/EVALUATION_ERROR/E/1/null", "ROW_SELECT/EVALUATION_ERROR/E/2/null"),
                violations(e));
    }
}
