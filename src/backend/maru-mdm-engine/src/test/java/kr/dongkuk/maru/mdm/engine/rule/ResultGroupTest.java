package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.BOOM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.FROM;
import static kr.dongkuk.maru.mdm.engine.rule.RuleEngineStageTest.TS;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.withGroup;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.NUMBER;
import static kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType.STRING;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import org.junit.jupiter.api.Test;

/**
 * 결과 열 그룹 res_grp·grp_cond(design §6.4, 06:69·425, I31).
 */
class ResultGroupTest {

    private final TestFunctions.CountingFn counter = new TestFunctions.CountingFn();
    private final InMemoryDefinitionLookup lookup = new InMemoryDefinitionLookup();
    private final MdmRuleEngine engine = new MdmRuleEngine(
            MdmEvaluatorFixtures.of(TestExpressionConfig.create(new TestFunctions(), Map.of("COUNT_CALL", counter))), lookup);

    private RuleResult run(RuleDefinition d, Map<String, Object> record) {
        lookup.add(CellTextGenerator.withTexts(d, x -> null));
        return engine.evaluate(d.ruleId(), record, TS);
    }

    private static RuleVar g(int varId, DispType disp, String name, kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType t,
            int seq, String grpCond) {
        return withGroup(resultVar(varId, disp, name, t, seq), "G", grpCond);
    }

    private static RuleDefinition rule(String id, HitPolicy p, List<RuleVar> results, RuleRow... rows) {
        List<RuleVar> vars = new ArrayList<>();
        vars.add(condVar(1, DispType.ONE, "A", NUMBER, 1));
        vars.addAll(results);
        return decision(id, 1, p, FROM, vars, contract(vts("A", NUMBER)), rows);
    }

    private static Map<String, Integer> choice(Integer varId) {
        Map<String, Integer> m = new HashMap<>();
        m.put("G", varId);
        return Collections.unmodifiableMap(m);
    }

    @Test
    void 열_seq_순으로_첫_참_열을_고르고_결과_키는_res_grp() {
        RuleDefinition d = rule("G1", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "S == \"a\""),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, "S == \"b\""),
                        g(4, DispType.VALUE, "COL_C", NUMBER, 3, "TRUE")),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("20"), 4, val("30")));
        RuleResult r = run(d, rec("A", 5, "S", "b"));
        assertNum("20", r.results().get("G"));
        assertEquals(List.of("G"), List.copyOf(r.results().keySet()));
        assertEquals(choice(3), r.hits().get(0).groupChoices());
    }

    @Test
    void 빈_열_조건은_기본_열() {
        RuleDefinition d = rule("G2", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "S == \"a\""),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, ""),
                        g(4, DispType.VALUE, "COL_C", NUMBER, 3, "TRUE")),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("20"), 4, val("30")));
        RuleResult r = run(d, rec("A", 5, "S", "z"));
        assertNum("20", r.results().get("G"));
        assertEquals(choice(3), r.hits().get(0).groupChoices());
    }

    @Test
    void 참도_기본_열도_없으면_결과와_groupChoices_값이_null() {
        RuleDefinition d = rule("G3", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "S == \"a\""),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, "S == \"b\"")),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("20")));
        RuleResult r = run(d, rec("A", 5, "S", "z"));
        assertTrue(r.results().containsKey("G"));
        assertNull(r.results().get("G"));
        assertEquals(choice(null), r.hits().get(0).groupChoices());
    }

    @Test
    void 열_조건_NULL_은_거짓과_GRP_COND_NULL_경고() {
        RuleDefinition d = rule("G4", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "N"),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, null)),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("20")));
        RuleResult r = run(d, rec("A", 5, "N", null));
        assertNum("20", r.results().get("G"));
        assertEquals(1, r.warnings().size());
        EngineWarning w = r.warnings().get(0);
        assertEquals(EngineWarning.Code.GRP_COND_NULL, w.code());
        assertEquals("G4", w.ruleId());
        assertNull(w.rowId());
        assertEquals(Integer.valueOf(2), w.varId());
    }

    @Test
    void 열_조건_예외와_불린_아님은_ROW_SELECT_EVALUATION_ERROR() {
        RuleDefinition d = rule("G5", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, BOOM),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, null)),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("20")));
        lookup.add(CellTextGenerator.withTexts(d, x -> null));
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("G5", rec("A", 5), TS));
        assertEquals(List.of("ROW_SELECT/EVALUATION_ERROR/G5/null/null"), violations(e));

        RuleDefinition d2 = rule("G6", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "1 + 1"),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, null)),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("20")));
        lookup.add(CellTextGenerator.withTexts(d2, x -> null));
        EngineEvaluationException e2 = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluate("G6", rec("A", 5), TS));
        assertEquals(List.of("ROW_SELECT/EVALUATION_ERROR/G6/null/null"), violations(e2));
    }

    @Test
    void 고르지_않은_열_셀은_평가하지_않는다() {
        RuleDefinition d = rule("G7", HitPolicy.FIRST,
                List.of(g(2, DispType.EXPRESSION, "COL_A", NUMBER, 1, "S == \"a\""),
                        g(3, DispType.EXPRESSION, "COL_B", NUMBER, 2, "S == \"b\""),
                        g(4, DispType.EXPRESSION, "COL_C", NUMBER, 3, null)),
                row(1, 1, 1, op("GT", "0"), 2, expr(BOOM), 3, expr("20"), 4, expr(BOOM)));
        RuleResult r = run(d, rec("A", 5, "S", "b"));
        assertNum("20", r.results().get("G"));
    }

    @Test
    void 고른_열의_셀이_없으면_null_이고_다음_열로_넘어가지_않는다() {
        RuleDefinition d = rule("G8", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "TRUE"),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, null)),
                row(1, 1, 1, op("GT", "0"), 3, val("20")));
        RuleResult r = run(d, rec("A", 5));
        assertTrue(r.results().containsKey("G"));
        assertNull(r.results().get("G"));
        assertEquals(choice(2), r.hits().get(0).groupChoices());
    }

    @Test
    void 선언_타입은_고른_열의_dataType() {
        RuleDefinition d = rule("G9", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "S == \"a\""),
                        g(3, DispType.VALUE, "COL_B", STRING, 2, null)),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("abc")));
        RuleResult r = run(d, rec("A", 5, "S", "z"));
        assertEquals("abc", r.results().get("G"));
    }

    @Test
    void 그룹_자리는_첫_열_자리이고_일반_열과_섞인다() {
        RuleDefinition d = rule("G10", HitPolicy.FIRST,
                List.of(resultVar(2, DispType.VALUE, "X", STRING, 1),
                        g(3, DispType.VALUE, "COL_A", STRING, 2, "S == \"a\""),
                        resultVar(4, DispType.VALUE, "Y", STRING, 3),
                        g(5, DispType.VALUE, "COL_B", STRING, 4, null)),
                row(1, 1, 1, op("GT", "0"), 2, val("x"), 3, val("ga"), 4, val("y"), 5, val("gb")));
        RuleResult r = run(d, rec("A", 5, "S", "z"));
        assertEquals(List.of("X", "G", "Y"), List.copyOf(r.results().keySet()));
        assertEquals("gb", r.results().get("G"));
        assertEquals("x", r.results().get("X"));
        assertEquals("y", r.results().get("Y"));
    }

    @Test
    void 열_조건은_레코드마다_한_번_평가한다() {
        RuleDefinition d = rule("G11", HitPolicy.COLLECT,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "COUNT_CALL(S) == \"a\""),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, null)),
                row(1, 1, 1, op("GT", "0"), 2, val("10"), 3, val("20")),
                row(2, 2, 1, op("GT", "0"), 2, val("11"), 3, val("21")),
                row(3, 3, 1, op("GT", "0"), 2, val("12"), 3, val("22")));
        RuleResult r = run(d, rec("A", 5, "S", "a"));
        assertEquals(1, counter.calls());
        assertEquals(3, ((List<?>) r.results().get("G")).size());
        for (RuleResult.Hit h : r.hits()) {
            assertEquals(choice(2), h.groupChoices());
        }
    }

    @Test
    void 결과를_낼_행이_없으면_열_조건을_평가하지_않는다() {
        RuleDefinition d = rule("G12", HitPolicy.FIRST,
                List.of(g(2, DispType.VALUE, "COL_A", NUMBER, 1, "COUNT_CALL(S) == \"a\""),
                        g(3, DispType.VALUE, "COL_B", NUMBER, 2, null)),
                row(1, 1, 1, op("GT", "10"), 2, val("10"), 3, val("20")));
        RuleResult r = run(d, rec("A", 5, "S", "a"));
        assertEquals(0, counter.calls());
        assertNull(r.results().get("G"));
    }
}
