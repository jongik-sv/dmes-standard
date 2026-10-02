package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.hitRows;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/**
 * 수용 기준 4·5 — 세트 LS_A3 실행, 입력 키 일괄 확인, 폐기·없는 세트(design §6.13·§6.15.5, I34·I35).
 * LS_A3 의 1단계 기대값은 원천(H:530), 2·3단계(SPD_EXC·SPD_JOIN)의 정의와 기대값은 설계 정의(D10)다.
 */
class RuleSetEvaluationTest {

    private final InMemoryDefinitionLookup lookup = SampleRules.lookup()
            .addSet(new RuleSetDefinition("NO_RULE", List.of("BASE_SPD_LKP", "NOPE"), SetStatus.INUSE, null),
                    new RuleSetDefinition("CREATED_SET", List.of("SPD_JOIN"), SetStatus.CREATED, null),
                    new RuleSetDefinition("EMPTY", List.of(), SetStatus.INUSE, null));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private static Map<String, Object> ls(String wid) {
        return rec("COIL_THK", new BigDecimal("0.65"), "TOP_RESIN_CD", "2A", "COAT_SIDE", "1", "COIL_WID", new BigDecimal(wid));
    }

    @Test
    void LS_A3_S1_예외_두_행이_모두_적중하면_최소값() {
        RuleSetResult r = engine.evaluateSet("LS_A3", ls("1250"), SampleRules.EVAL_TS);
        assertEquals("LS_A3", r.setId());
        assertEquals(SampleRules.EVAL_TS, r.evalTs());
        assertEquals(List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN"), r.steps().stream().map(RuleResult::ruleId).toList());
        // 1단계 원천 H:530 → 90
        assertNum("90", r.steps().get(0).results().get("BASE_SPD"));
        assertEquals(List.of(3), hitRows(r.steps().get(0)));
        // 2단계 설계 정의(D10) → [70, 85]
        List<?> exc = (List<?>) r.steps().get(1).results().get("EXC_SPD");
        assertEquals(2, exc.size());
        assertNum("70", exc.get(0));
        assertNum("85", exc.get(1));
        assertEquals(List.of(1, 2), hitRows(r.steps().get(1)));
        // 3단계 → MIN(90, [70, 85]) = 70
        assertNum("70", r.steps().get(2).results().get("LINE_SPD"));
        assertEquals(List.of("BASE_SPD", "EXC_SPD", "LINE_SPD"), List.copyOf(r.finalValues().keySet()));
        assertNum("90", r.finalValues().get("BASE_SPD"));
        assertNum("70", r.finalValues().get("LINE_SPD"));
        assertEquals(exc, r.finalValues().get("EXC_SPD"));
    }

    @Test
    void LS_A3_S2_예외_무적중이면_기본_속도() {
        RuleSetResult r = engine.evaluateSet("LS_A3", ls("1000"), SampleRules.EVAL_TS);
        assertNull(r.steps().get(1).results().get("EXC_SPD"));
        assertTrue(r.steps().get(1).results().containsKey("EXC_SPD"));
        assertEquals(List.of(), r.steps().get(1).hits());
        assertNum("90", r.steps().get(2).results().get("LINE_SPD"));
        assertTrue(r.finalValues().containsKey("EXC_SPD"));
        assertNull(r.finalValues().get("EXC_SPD"));
        assertNum("90", r.finalValues().get("LINE_SPD"));
    }

    @Test
    void finalValues_에는_입력_키_EVAL_TS_식_변수가_없다() {
        RuleSetResult r = engine.evaluateSet("LS_A3", ls("1250"), SampleRules.EVAL_TS);
        for (String k : List.of("COIL_THK", "TOP_RESIN_CD", "COAT_SIDE", "COIL_WID", "EVAL_TS")) {
            assertTrue(!r.finalValues().containsKey(k), k);
        }
        assertThrows(UnsupportedOperationException.class, () -> r.finalValues().put("X", 1));
        assertThrows(UnsupportedOperationException.class, () -> r.steps().add(null));
    }

    @Test
    void S3_세트_입력_키_누락_둘을_한_예외에_담고_앞_룰_결과_이름은_요구하지_않는다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class, () -> engine.evaluateSet("LS_A3",
                rec("COIL_THK", new BigDecimal("0.65"), "TOP_RESIN_CD", "2A"), SampleRules.EVAL_TS));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/BASE_SPD_LKP/null/COAT_SIDE",
                "SET_CHECK/MISSING_KEY/SPD_EXC/null/COIL_WID"), violations(e));
    }

    @Test
    void S4_폐기된_세트는_SET_DEPRECATED_로_거부하고_룰을_조회하지_않는다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("WID_OLD", rec("COIL_WID", BigDecimal.ONE), SampleRules.EVAL_TS));
        assertEquals(List.of("SET_CHECK/SET_DEPRECATED/null/null/null"), violations(e));
        assertEquals(List.of(), lookup.ruleCalls());
    }

    @Test
    void 없는_세트는_SET_NOT_FOUND() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("NONE", rec(), SampleRules.EVAL_TS));
        assertEquals(List.of("SET_CHECK/SET_NOT_FOUND/null/null/null"), violations(e));
        assertEquals(List.of(), lookup.ruleCalls());
    }

    @Test
    void 세트_안_룰이_없으면_SET_CHECK_RULE_NOT_FOUND_이고_어느_룰도_돌리지_않는다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("NO_RULE", ls("1000"), SampleRules.EVAL_TS));
        assertEquals(List.of("SET_CHECK/RULE_NOT_FOUND/NOPE/null/null"), violations(e));
    }

    @Test
    void 세트_레코드의_예약_키는_SET_CHECK() {
        Map<String, Object> record = ls("1000");
        record.put("pi", BigDecimal.ONE);
        record.put("Eval_Ts", BigDecimal.ONE);
        record.put("_X", BigDecimal.ONE);
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("LS_A3", record, SampleRules.EVAL_TS));
        assertEquals(List.of("SET_CHECK/CONSTANT_KEY/null/null/pi", "SET_CHECK/EVAL_TS_KEY/null/null/Eval_Ts",
                "SET_CHECK/RESERVED_KEY/null/null/_X"), violations(e));
    }

    @Test
    void CREATED_세트는_실행하고_빈_세트는_빈_결과() {
        RuleSetResult r = engine.evaluateSet("CREATED_SET", rec("BASE_SPD", new BigDecimal("80"), "EXC_SPD", null),
                SampleRules.EVAL_TS);
        assertNum("80", r.finalValues().get("LINE_SPD"));
        RuleSetResult empty = engine.evaluateSet("EMPTY", rec("A", 1), SampleRules.EVAL_TS);
        assertEquals(List.of(), empty.steps());
        assertEquals(Map.of(), empty.finalValues());
    }

    @Test
    void 세트는_초_미만을_자른_시각으로_룰을_조회한다() {
        Instant ts = SampleRules.EVAL_TS.plusMillis(789);
        RuleSetResult r = engine.evaluateSet("LS_A3", ls("1250"), ts);
        assertEquals(SampleRules.EVAL_TS, r.evalTs());
        assertEquals(List.of(SampleRules.EVAL_TS, SampleRules.EVAL_TS, SampleRules.EVAL_TS), lookup.ruleEvalTs());
        for (RuleResult step : r.steps()) {
            assertEquals(SampleRules.EVAL_TS, step.evalTs());
        }
    }

    @Test
    void 세트_룰_판정_오류는_그대로_올린다() {
        // SPD_EXC 의 BASE_SPD 는 앞 룰이 채우므로 세트 검사는 통과하고, COIL_WID 가 숫자가 아니면 2단계 INPUT_CHECK 다.
        Map<String, Object> record = rec("COIL_THK", new BigDecimal("0.65"), "TOP_RESIN_CD", "2A", "COAT_SIDE", "1",
                "COIL_WID", "abc");
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("LS_A3", record, SampleRules.EVAL_TS));
        assertEquals(List.of("INPUT_CHECK/TYPE_CONVERSION/SPD_EXC/null/COIL_WID"), violations(e));
    }

    @Test
    void 세트_조회에_초_단위로_자른_판정_시각을_넘긴다() {
        engine.evaluateSet("LS_A3", ls("1250"), SampleRules.EVAL_TS.plusMillis(700));
        assertEquals(List.of(SampleRules.EVAL_TS), lookup.ruleSetEvalTs());
    }

    @Test
    void 없는_세트_문구에_세트_ID_와_판정_시각이_있다() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("NONE", rec(), SampleRules.EVAL_TS));
        assertEquals("세트가 없다: NONE @ " + SampleRules.EVAL_TS, e.violations().get(0).message());
    }
}
