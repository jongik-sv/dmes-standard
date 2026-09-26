package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import org.junit.jupiter.api.Test;

/**
 * TSK-09-02 design.md §3(B3-1) — SPD_EXC·SPD_JOIN·세트 {@code LS_A3}({@code evaluateSet})의 값 테스트. {@code SampleRuleValueTest}는
 * 06 샘플 룰 넷만 다루고 이 셋(D10 — 원천에 행·셀이 없어 설계가 정의)은 한 번도 값으로 검증된 적이 없었다(0.3 절). 기대값은 SampleRules.java
 * 자신의 행·셀 정의({@link SampleRules#spdExc()}·{@link SampleRules#spdJoin()}·{@link SampleRules#baseSpdLkp()})에서 손으로 계산한다.
 * 숫자는 compareTo 로 본다({@link SampleRuleValueTest#assertNum}과 같은 이유, E6).
 */
class SampleRuleSetValueTest {

    private final MdmRuleEngine engine = new MdmRuleEngine(TestExpressionConfig.create(), SampleRules.lookup());

    private static void assertNum(String expected, Object actual) {
        SampleRuleValueTest.assertNum(expected, actual);
    }

    /** {@code actual}이 기대한 숫자 목록과 같은 길이·같은 값(compareTo)인 리스트인지. */
    @SuppressWarnings("unchecked")
    private static void assertNumList(List<String> expected, Object actual) {
        assertTrue(actual instanceof List, "리스트가 아니다: " + actual);
        List<Object> list = (List<Object>) actual;
        assertEquals(expected.size(), list.size(), String.valueOf(list));
        for (int i = 0; i < expected.size(); i++) {
            assertNum(expected.get(i), list.get(i));
        }
    }

    // ------------------------------------------------------------------ SPD_EXC(COLLECT, H:532, D10)

    private RuleResult spdExc(String baseSpd, String coilWid) {
        return engine.evaluate("SPD_EXC",
                rec("BASE_SPD", new BigDecimal(baseSpd), "COIL_WID", new BigDecimal(coilWid)), SampleRules.EVAL_TS);
    }

    @Test
    void EXC_행_둘_다_거짓이면_EXC_SPD_는_NULL_이고_적중이_없다() {
        RuleResult r = spdExc("50", "1000");
        assertNull(r.results().get("EXC_SPD"));
        assertEquals(List.of(), r.hits());
        assertTrue(r.warnings().isEmpty());
    }

    @Test
    void 폭_1250_이상만_참이면_1행만_적중해_EXC_SPD_는_70_하나다() {
        RuleResult r = spdExc("50", "1300");
        assertNumList(List.of("70"), r.results().get("EXC_SPD"));
        assertEquals(List.of(1), r.hits().stream().map(RuleResult.Hit::rowId).toList());
    }

    @Test
    void 기본_속도_80_초과_폭_1200_이상만_참이면_2행만_적중해_EXC_SPD_는_85_하나다() {
        RuleResult r = spdExc("90", "1200");
        assertNumList(List.of("85"), r.results().get("EXC_SPD"));
        assertEquals(List.of(2), r.hits().stream().map(RuleResult.Hit::rowId).toList());
    }

    @Test
    void 둘_다_참이면_EXC_SPD_는_행_순서대로_70_85_둘이다() {
        RuleResult r = spdExc("90", "1300");
        assertNumList(List.of("70", "85"), r.results().get("EXC_SPD"));
        assertEquals(List.of(1, 2), r.hits().stream().map(RuleResult.Hit::rowId).toList());
    }

    // ------------------------------------------------------------------ SPD_JOIN(DERIVE, H:533, D10, E8 IF 가드)

    private RuleResult spdJoin(Map<String, Object> record) {
        return engine.evaluate("SPD_JOIN", record, SampleRules.EVAL_TS);
    }

    @Test
    void EXC_SPD_가_없으면_LINE_SPD_는_BASE_SPD_그대로다() {
        // EvalEx 는 키 자체가 없으면 "변수 없음" 오류를 낸다 — NULL 가드(IF(EXC_SPD == NULL, ...))를 타려면 키는 두고 값만 NULL 이어야 한다
        // (evaluateSet 이 SPD_EXC 결과를 그대로 ctx 에 놓는 것과 같은 모양, MdmRuleEngine.evaluateSet의 putReplacing).
        RuleResult r = spdJoin(rec("BASE_SPD", new BigDecimal("60"), "EXC_SPD", null));
        assertNum("60", r.results().get("LINE_SPD"));
    }

    @Test
    void EXC_SPD_가_하나면_BASE_SPD_와의_MIN_이다() {
        RuleResult r = spdJoin(rec("BASE_SPD", new BigDecimal("90"), "EXC_SPD", List.of(new BigDecimal("70"))));
        assertNum("70", r.results().get("LINE_SPD"));
    }

    @Test
    void EXC_SPD_가_둘이면_BASE_SPD_와_둘_모두의_MIN_이다() {
        RuleResult r = spdJoin(rec("BASE_SPD", new BigDecimal("90"),
                "EXC_SPD", List.of(new BigDecimal("70"), new BigDecimal("85"))));
        assertNum("70", r.results().get("LINE_SPD"));
    }

    @Test
    void 예외_속도가_기본_속도보다_크면_MIN_은_기본_속도_그대로다() {
        RuleResult r = spdJoin(rec("BASE_SPD", new BigDecimal("80"), "EXC_SPD", List.of(new BigDecimal("85"))));
        assertNum("80", r.results().get("LINE_SPD"));
    }

    // ------------------------------------------------------------------ 세트 LS_A3 = BASE_SPD_LKP → SPD_EXC → SPD_JOIN(06:1087·1324)

    private RuleSetResult lsA3(String thk, String resin, String side, String coilWid) {
        return engine.evaluateSet("LS_A3", rec("COIL_THK", new BigDecimal(thk), "TOP_RESIN_CD", resin, "COAT_SIDE", side,
                "COIL_WID", new BigDecimal(coilWid)), SampleRules.EVAL_TS);
    }

    @Test
    void 예외_없음_이면_LINE_SPD_는_BASE_SPD_LKP_결과_그대로다() {
        // thk=1.1·resin=SF·side=1 → GENERAL 열(band 6) = 60(SampleRuleValueTest.BASE_SPD_B2 와 같은 입력). COIL_WID=1000 은
        // 두 SPD_EXC 행 모두 거짓이라(폭<1250, 기본 속도 60<=80) EXC_SPD 는 NULL.
        RuleSetResult r = lsA3("1.1", "SF", "1", "1000");
        assertNum("60", r.finalValues().get("BASE_SPD"));
        assertNull(r.finalValues().get("EXC_SPD"));
        assertNum("60", r.finalValues().get("LINE_SPD"));
        assertEquals(List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertEquals(List.of("BASE_SPD", "EXC_SPD", "LINE_SPD"), List.copyOf(r.finalValues().keySet()));
    }

    @Test
    void 행1_예외만_적용되면_기본_속도보다_낮은_LINE_SPD_로_줄어든다() {
        // thk=0.65·resin=F·side=1 → FLUORO 열(band 3, "<= 변수 <" 0.6~0.7) = 80. COIL_WID=1300 은 1행만 참(80 은 80 초과가 아니라
        // 2행은 거짓) → EXC_SPD=[70] → LINE_SPD = MIN(80, 70) = 70.
        RuleSetResult r = lsA3("0.65", "F", "1", "1300");
        assertNum("80", r.finalValues().get("BASE_SPD"));
        assertNumList(List.of("70"), r.finalValues().get("EXC_SPD"));
        assertNum("70", r.finalValues().get("LINE_SPD"));
    }

    @Test
    void 두_행_모두_예외면_LINE_SPD_는_셋_중_가장_작은_값이다() {
        // thk=0.65·resin=2A·side=1 → TEXTURE 열(band 3) = 90(SampleRuleValueTest.BASE_SPD_B1 과 같은 입력). COIL_WID=1300 은
        // 두 행 모두 참 → EXC_SPD=[70,85] → LINE_SPD = MIN(90,70,85) = 70.
        RuleSetResult r = lsA3("0.65", "2A", "1", "1300");
        assertNum("90", r.finalValues().get("BASE_SPD"));
        assertNumList(List.of("70", "85"), r.finalValues().get("EXC_SPD"));
        assertNum("70", r.finalValues().get("LINE_SPD"));
    }

    @Test
    void 행2_예외만_적용되면_LINE_SPD_는_85_다() {
        // 같은 두께·수지·면(BASE_SPD=90), COIL_WID=1220 은 1250 미만이라 1행은 거짓, 2행(90>80 && 1220>=1200)만 참.
        RuleSetResult r = lsA3("0.65", "2A", "1", "1220");
        assertNum("90", r.finalValues().get("BASE_SPD"));
        assertNumList(List.of("85"), r.finalValues().get("EXC_SPD"));
        assertNum("85", r.finalValues().get("LINE_SPD"));
    }
}
