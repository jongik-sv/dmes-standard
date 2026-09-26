package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Stream;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestFunctions;
import kr.dongkuk.maru.mdm.engine.spi.CodeEffLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeCateRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeHeader;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeItemRow;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeVersionRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.EngineLookups;
import kr.dongkuk.maru.mdm.engine.spi.FunctionProvider;
import kr.dongkuk.maru.mdm.engine.spi.MasterLookup;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 운영 설정(D22) 대조 — fixture 설정(D21, 캐시 경로는 같다)으로 확인한 판정이 {@code new MdmEvaluator(EngineLookups)} 로
 * 만든 운영 설정에서도 같은지 본다(TSK-03-03 design §3.6, 수용 기준 1·3·4).
 *
 * <p>①은 §6.15 값 테스트의 대표 사례(QLTY·COIL·PROD·BASE_SPD 각 1건)로 좁힌다 — 전 사례 대조는 이 재작업의 반려 사유
 * (캐시 연결)와 무관한 범위 확장이라 build-log 「설계 이탈」 에 적는다.
 */
class ProductionConfigParityTest {

    private static EngineLookups productionLookups() {
        BigDecimal v1 = new BigDecimal("1.000");
        BigDecimal open = new BigDecimal("9999.000");
        List<String> lvl = Arrays.asList(new String[5]);
        List<String> attrs = Arrays.asList(new String[10]);
        CodeRows procCd = new CodeRows(new CodeHeader("PROC_CD", "INUSE"),
                List.of(new CodeVersionRow(v1, "RELEASED", LocalDateTime.of(2020, 1, 1, 0, 0),
                        LocalDateTime.of(9999, 12, 31, 0, 0))),
                List.of(new CodeItemRow("P1", v1, open, "P1", null, 1, lvl, attrs),
                        new CodeItemRow("P2", v1, open, "P2", null, 2, lvl, attrs),
                        new CodeItemRow("P3", v1, open, "P3", null, 3, lvl, attrs)),
                List.of(new CodeCateRow("PLATING", v1, open, "TABLE", null, null)),
                List.of(new CodeCateItemRow("PLATING", "P1", v1, open), new CodeCateItemRow("PLATING", "P2", v1, open)));
        CodeLookup codes = id -> "PROC_CD".equals(id) ? Optional.of(procCd) : Optional.empty();
        return new EngineLookups(SampleRules.lookup(), codes, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE);
    }

    private static MdmEvaluator fixtureEvaluator() {
        return MdmEvaluatorFixtures.of(TestExpressionConfig.create(new TestFunctions().code("PROC_CD", "PLATING", "P1", "P2")));
    }

    private static MdmEvaluator productionEvaluator() {
        return new MdmEvaluator(productionLookups());
    }

    static Stream<Arguments> sampleCases() {
        return Stream.of(
                Arguments.of("QLTY_GRD_JDG", rec("COIL_THK", new BigDecimal("1.8"), "COIL_WID", new BigDecimal("1200"),
                        "SURF_GRD", "A", "BASE_FCT", new BigDecimal("1.0"))),
                Arguments.of("COIL_WGT_CALC", rec("COIL_THK", new BigDecimal("1.8"), "COIL_WID", new BigDecimal("1200"),
                        "COIL_LEN", new BigDecimal("1500"), "SPEC_GRAV", new BigDecimal("7.85"))),
                Arguments.of("PROD_WGT_CALC", rec("PROD_TYPE", "COIL", "CALC_BASIS", "LEN", "COIL_THK", new BigDecimal("1.8"),
                        "COIL_WID", new BigDecimal("1200"), "COIL_LEN", new BigDecimal("1500"),
                        "SPEC_GRAV", new BigDecimal("7.85"))),
                Arguments.of("BASE_SPD_LKP", rec("COIL_THK", new BigDecimal("0.65"), "TOP_RESIN_CD", "2A", "COAT_SIDE", "1")));
    }

    @ParameterizedTest(name = "{displayName} [{0}]")
    @MethodSource("sampleCases")
    void 샘플_룰_판정이_운영_설정과_fixture_설정에서_같다(String ruleId, Map<String, Object> record) {
        MdmRuleEngine fixture = new MdmRuleEngine(fixtureEvaluator(), SampleRules.lookup());
        MdmRuleEngine production = new MdmRuleEngine(productionEvaluator(), SampleRules.lookup());
        RuleResult a = fixture.evaluate(ruleId, record, SampleRules.EVAL_TS);
        RuleResult b = production.evaluate(ruleId, record, SampleRules.EVAL_TS);
        assertSameResults(a.results(), b.results());
        assertEquals(a.hits().stream().map(RuleResult.Hit::rowId).toList(), b.hits().stream().map(RuleResult.Hit::rowId).toList());
        assertEquals(a.defaultApplied(), b.defaultApplied());
        assertEquals(a.warnings().stream().map(w -> w.code()).toList(), b.warnings().stream().map(w -> w.code()).toList());
    }

    @Test
    void LS_A3_세트가_운영_설정에서_같은_값이다() {
        MdmRuleEngine fixture = new MdmRuleEngine(fixtureEvaluator(), SampleRules.lookup());
        MdmRuleEngine production = new MdmRuleEngine(productionEvaluator(), SampleRules.lookup());

        // S1(예외 없음): thk=1.1, resin=SF, side=1, COIL_WID=1000.
        Map<String, Object> s1 = rec("COIL_THK", new BigDecimal("1.1"), "TOP_RESIN_CD", "SF", "COAT_SIDE", "1",
                "COIL_WID", new BigDecimal("1000"));
        RuleSetResult a1 = fixture.evaluateSet("LS_A3", s1, SampleRules.EVAL_TS);
        RuleSetResult b1 = production.evaluateSet("LS_A3", s1, SampleRules.EVAL_TS);
        assertSameResults(a1.finalValues(), b1.finalValues());

        // S2(1행 예외만): thk=0.65, resin=F, side=1, COIL_WID=1300.
        Map<String, Object> s2 = rec("COIL_THK", new BigDecimal("0.65"), "TOP_RESIN_CD", "F", "COAT_SIDE", "1",
                "COIL_WID", new BigDecimal("1300"));
        RuleSetResult a2 = fixture.evaluateSet("LS_A3", s2, SampleRules.EVAL_TS);
        RuleSetResult b2 = production.evaluateSet("LS_A3", s2, SampleRules.EVAL_TS);
        assertSameResults(a2.finalValues(), b2.finalValues());

        // S4(폐기 세트): 두 설정 모두 SET_DEPRECATED, 룰 조회 0회(원 구현이 이미 보장 — 여기선 위반 코드만 대조).
        EngineEvaluationException ea = assertThrows(EngineEvaluationException.class,
                () -> fixture.evaluateSet("WID_OLD", rec(), SampleRules.EVAL_TS));
        EngineEvaluationException eb = assertThrows(EngineEvaluationException.class,
                () -> production.evaluateSet("WID_OLD", rec(), SampleRules.EVAL_TS));
        assertEquals(ea.violations().get(0).code(), eb.violations().get(0).code());
    }

    @Test
    void 스냅샷_텍스트는_운영_설정으로_파싱된다() {
        MdmEvaluator production = productionEvaluator();
        for (CellTextSnapshotTest.SnapshotCase c : CellTextSnapshotTest.cases()) {
            if (c.text() == null || c.text().isEmpty()) {
                continue;
            }
            assertDoesNotThrow(() -> production.compile(c.text()), c.id() + ": " + c.text());
        }
    }

    @Test
    void CODE_IN_생성_텍스트는_운영_MASTER_로도_같은_소속을_낸다() {
        RuleCell codeIn = new RuleCell("CODE_IN", "PLATING", null, null, null, null, null, null);
        String text = CellTextGenerator.conditionText(codeIn, "V", DataType.STRING, "PROC_CD");

        MdmEvaluator fixture = fixtureEvaluator();
        MdmEvaluator production = productionEvaluator();
        for (String key : new String[] {"P1", "P3"}) {
            boolean expected = "P1".equals(key);
            assertEquals(expected, fixture.evaluate(text, Map.of("V", key), SampleRules.EVAL_TS).getBooleanValue(), key);
            assertEquals(expected, production.evaluate(text, Map.of("V", key), SampleRules.EVAL_TS).getBooleanValue(), key);
        }
        Map<String, Object> nullKey = new HashMap<>();
        nullKey.put("V", null);
        assertFalse(fixture.evaluate(text, nullKey, SampleRules.EVAL_TS).getBooleanValue());
        assertFalse(production.evaluate(text, nullKey, SampleRules.EVAL_TS).getBooleanValue());
    }

    private static void assertSameResults(Map<String, Object> expected, Map<String, Object> actual) {
        assertEquals(expected.keySet(), actual.keySet());
        for (String key : expected.keySet()) {
            Object ev = expected.get(key);
            Object av = actual.get(key);
            if (ev instanceof BigDecimal evNum) {
                assertTrue(av instanceof BigDecimal, key + ": " + av);
                assertEquals(0, evNum.compareTo((BigDecimal) av), key + ": " + ev + " != " + av);
            } else if (ev instanceof List<?> evList) {
                assertTrue(av instanceof List, key + ": " + av);
                List<?> avList = (List<?>) av;
                assertEquals(evList.size(), avList.size(), key);
                for (int i = 0; i < evList.size(); i++) {
                    Object e1 = evList.get(i);
                    Object a1 = avList.get(i);
                    if (e1 instanceof BigDecimal e1Num) {
                        assertEquals(0, e1Num.compareTo((BigDecimal) a1), key + "[" + i + "]");
                    } else {
                        assertEquals(e1, a1, key + "[" + i + "]");
                    }
                }
            } else {
                assertEquals(ev, av, key);
            }
        }
    }
}
