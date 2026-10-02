package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import org.junit.jupiter.api.Test;

/**
 * 수용 기준 1 — 06 샘플 룰 넷의 값 테스트(design §6.15). 원천 케이스는 줄 번호를 적고, 그 밖 케이스의 기대값은 원천 표에서
 * 손으로 계산한 값이다. 숫자는 compareTo 로 본다(E6).
 */
class SampleRuleValueTest {

    private final MdmRuleEngine engine =
            new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), SampleRules.lookup());

    static void assertNum(String expected, Object actual) {
        assertInstanceOf(BigDecimal.class, actual, String.valueOf(actual));
        assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) actual), expected + " ≠ " + actual);
    }

    /** trace 를 {@code rowId:T/F/firstFalse} 로. */
    static List<String> trace(RuleResult r) {
        List<String> out = new ArrayList<>();
        for (RuleResult.RowTrace t : r.trace()) {
            out.add(t.rowId() + ":" + (t.evaluated() ? "T" : "F") + "/" + (t.hit() ? "T" : "F") + "/"
                    + (t.firstFalseVarId() == null ? "-" : t.firstFalseVarId()));
        }
        return out;
    }

    static List<Integer> hitRows(RuleResult r) {
        return r.hits().stream().map(RuleResult.Hit::rowId).toList();
    }

    // ------------------------------------------------------------------ QLTY_GRD_JDG(06:1295-1329)

    private RuleResult qlty(Map<String, Object> record) {
        return engine.evaluate("QLTY_GRD_JDG", record, SampleRules.EVAL_TS);
    }

    @Test
    void QLTY_Q1_원천_06_1322_두께_1_8_폭_1200_표면_A() {
        RuleResult r = qlty(rec("COIL_THK", new BigDecimal("1.8"), "COIL_WID", new BigDecimal("1200"),
                "SURF_GRD", "A", "BASE_FCT", new BigDecimal("1.0")));
        assertEquals("A", r.results().get("QLTY_GRD"));
        assertNum("1.05", r.results().get("PRC_FCT"));
        assertEquals(List.of(1), hitRows(r));
        assertFalse(r.defaultApplied());
        assertEquals(List.of("1:T/T/-", "2:F/F/-", "3:F/F/-"), trace(r));
        assertEquals("QLTY_GRD_JDG", r.ruleId());
        assertEquals(new java.math.BigDecimal("1.000"), r.ver());
        assertEquals(SampleRules.EVAL_TS, r.evalTs());
        assertEquals(List.of("QLTY_GRD", "PRC_FCT"), List.copyOf(r.results().keySet()));
        assertEquals(Map.of(), r.hits().get(0).groupChoices());
        assertEquals(1, r.hits().get(0).seq());
        assertEquals(List.of(), r.warnings());
    }

    @Test
    void QLTY_Q2_표면_B_는_2행() {
        RuleResult r = qlty(rec("COIL_THK", new BigDecimal("1.8"), "COIL_WID", new BigDecimal("1200"),
                "SURF_GRD", "B", "BASE_FCT", new BigDecimal("1.0")));
        assertEquals("B", r.results().get("QLTY_GRD"));
        assertNum("1", r.results().get("PRC_FCT"));
        assertEquals(List.of(2), hitRows(r));
        assertEquals(List.of("1:T/F/3", "2:T/T/-", "3:F/F/-"), trace(r));
    }

    @Test
    void QLTY_Q3_두께_2_5_는_3행과_BASE_FCT_식() {
        RuleResult r = qlty(rec("COIL_THK", new BigDecimal("2.5"), "COIL_WID", new BigDecimal("900"),
                "SURF_GRD", "A", "BASE_FCT", new BigDecimal("1.0")));
        assertEquals("B", r.results().get("QLTY_GRD"));
        assertNum("0.98", r.results().get("PRC_FCT"));
        assertEquals(List.of(3), hitRows(r));
        assertEquals(List.of("1:T/F/1", "2:T/F/1", "3:T/T/-"), trace(r));
    }

    @Test
    void QLTY_Q4_무적중은_기본_행() {
        RuleResult r = qlty(rec("COIL_THK", new BigDecimal("2.0"), "COIL_WID", new BigDecimal("900"),
                "SURF_GRD", "A", "BASE_FCT", new BigDecimal("1.0")));
        assertEquals("C", r.results().get("QLTY_GRD"));
        assertNum("0.9", r.results().get("PRC_FCT"));
        assertEquals(List.of(), hitRows(r));
        assertTrue(r.defaultApplied());
        assertEquals(List.of("1:T/F/2", "2:T/F/2", "3:T/F/1"), trace(r));
    }

    @Test
    void QLTY_Q5_표면_NULL_은_가드로_거짓이고_기본_행() {
        RuleResult r = qlty(rec("COIL_THK", new BigDecimal("3.0"), "COIL_WID", new BigDecimal("900"), "SURF_GRD", null));
        assertEquals("C", r.results().get("QLTY_GRD"));
        assertNum("0.9", r.results().get("PRC_FCT"));
        assertEquals(List.of(), hitRows(r));
        assertTrue(r.defaultApplied());
        assertEquals(List.of("1:T/F/1", "2:T/F/1", "3:T/F/3"), trace(r));
    }

    @Test
    void QLTY_Q6_3행_적중에_BASE_FCT_가_없으면_결과_검사_오류() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> qlty(rec("COIL_THK", new BigDecimal("2.5"), "COIL_WID", new BigDecimal("900"), "SURF_GRD", "A")));
        assertEquals(List.of("RESULT_CHECK/MISSING_KEY/QLTY_GRD_JDG/3/BASE_FCT"), violations(e));
    }

    @Test
    void QLTY_Q7_문자열_정수_입력은_선언_타입으로_바꾼다() {
        RuleResult r = qlty(rec("COIL_THK", "1.8", "COIL_WID", 1200, "SURF_GRD", "A", "BASE_FCT", "1.0"));
        assertEquals("A", r.results().get("QLTY_GRD"));
        assertNum("1.05", r.results().get("PRC_FCT"));
        assertEquals(List.of(1), hitRows(r));
        assertFalse(r.defaultApplied());
    }

    // ------------------------------------------------------------------ COIL_WGT_CALC(H:520-521)

    @Test
    void COIL_원천_H_521_코일_중량() {
        RuleResult r = engine.evaluate("COIL_WGT_CALC", rec("COIL_THK", new BigDecimal("1.8"), "COIL_WID",
                new BigDecimal("1200"), "COIL_LEN", new BigDecimal("1500"), "SPEC_GRAV", new BigDecimal("7.85")),
                SampleRules.EVAL_TS);
        assertNum("25434.0", r.results().get("COIL_WGT"));
        assertEquals(List.of(new RuleResult.Hit(1, 1, Map.of())), r.hits());
        assertEquals(List.of("1:T/T/-"), trace(r));
        assertFalse(r.defaultApplied());
    }

    // ------------------------------------------------------------------ PROD_WGT_CALC(H:522-527)

    private RuleResult prod(Map<String, Object> record) {
        return engine.evaluate("PROD_WGT_CALC", record, SampleRules.EVAL_TS);
    }

    @Test
    void PROD_P1_원천_코일_길이_기준() {
        RuleResult r = prod(rec("PROD_TYPE", "COIL", "CALC_BASIS", "LEN", "COIL_THK", new BigDecimal("1.8"),
                "COIL_WID", new BigDecimal("1200"), "COIL_LEN", new BigDecimal("1500"), "SPEC_GRAV", new BigDecimal("7.85")));
        assertNum("25434", r.results().get("PROD_WGT"));
        assertEquals(List.of(1), hitRows(r));
    }

    @Test
    void PROD_P2_원천_코일_외경_기준() {
        RuleResult r = prod(rec("PROD_TYPE", "COIL", "CALC_BASIS", "DIA", "COIL_WID", new BigDecimal("1200"),
                "COIL_OUT_DIA", new BigDecimal("1800"), "COIL_IN_DIA", new BigDecimal("610"),
                "COIL_VOID_RT", new BigDecimal("1.5"), "SPEC_GRAV", new BigDecimal("7.85")));
        assertNum("20899.7", r.results().get("PROD_WGT"));
        assertEquals(List.of(3), hitRows(r));
        // 1행: PROD_TYPE 참, CALC_BASIS(var 3, 열 seq 2) 거짓. 행 seq 순: 1(seq1) → 3(seq2) → 2(seq3).
        assertEquals(List.of("1:T/F/3", "3:T/T/-", "2:T/F/1"), trace(r));
    }

    @Test
    void PROD_P3_원천_시트() {
        RuleResult r = prod(rec("PROD_TYPE", "SHEET", "CALC_BASIS", null, "COIL_THK", new BigDecimal("0.8"),
                "COIL_WID", new BigDecimal("1219"), "SHEET_LEN", new BigDecimal("2438"), "SHEET_CNT", new BigDecimal("120"),
                "SPEC_GRAV", new BigDecimal("7.85")));
        assertNum("2239.6", r.results().get("PROD_WGT"));
        assertEquals(List.of(2), hitRows(r));
    }

    @Test
    void PROD_P4_결과_검사_위반_둘을_한_번에() {
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> prod(rec("PROD_TYPE", "SHEET", "CALC_BASIS", null, "COIL_THK", new BigDecimal("0.8"),
                        "COIL_WID", new BigDecimal("1219"), "SHEET_LEN", new BigDecimal("2438"), "SPEC_GRAV", null)));
        assertEquals(List.of("RESULT_CHECK/MISSING_KEY/PROD_WGT_CALC/2/SHEET_CNT",
                "RESULT_CHECK/REQUIRED_NULL/PROD_WGT_CALC/2/SPEC_GRAV"), violations(e));
    }

    // ------------------------------------------------------------------ BASE_SPD_LKP(H:528-531)

    private RuleResult baseSpd(String thk, String resin, String side) {
        return engine.evaluate("BASE_SPD_LKP", rec("COIL_THK", new BigDecimal(thk), "TOP_RESIN_CD", resin,
                "COAT_SIDE", side), SampleRules.EVAL_TS);
    }

    @Test
    void BASE_SPD_B1_원천_H_530_텍스처() {
        RuleResult r = baseSpd("0.65", "2A", "1");
        assertNum("90", r.results().get("BASE_SPD"));
        assertEquals(List.of(new RuleResult.Hit(3, 3, Map.of("BASE_SPD", 2))), r.hits());
        assertEquals(List.of("BASE_SPD"), List.copyOf(r.results().keySet()));
    }

    @Test
    void BASE_SPD_B2_원천_H_531_일반_열() {
        RuleResult r = baseSpd("1.1", "SF", "1");
        assertNum("60", r.results().get("BASE_SPD"));
        assertEquals(List.of(new RuleResult.Hit(7, 7, Map.of("BASE_SPD", 9))), r.hits());
    }

    @Test
    void BASE_SPD_B3_WXL_양면() {
        RuleResult r = baseSpd("0.3", "W1", "2");
        assertNum("110", r.results().get("BASE_SPD"));
        assertEquals(List.of(new RuleResult.Hit(1, 1, Map.of("BASE_SPD", 6))), r.hits());
    }
}
