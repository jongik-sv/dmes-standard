package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotSame;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/**
 * 엔진 안 세트 판정 준비 기억(항목5)의 경계 — 크기 상한, 파싱 실패는 기억하지 않음, 검사기 사본의 지연 목록 분리.
 * 결과 동일성은 {@link RuleSetPrepareCharacterizationTest} 가 지킨다.
 */
class RuleSetPreparePlanCacheTest {

    private static final LocalDateTime FOREVER = LocalDateTime.of(9999, 12, 31, 0, 0);
    private static final Instant TS = LocalDateTime.of(2026, 9, 20, 9, 0).atZone(ZoneId.of("Asia/Seoul")).toInstant();

    private final MdmEvaluator evaluator = MdmEvaluatorFixtures.of(TestExpressionConfig.create());

    private static RuleSetDefinition linearSet(String id, List<String> ruleIds) {
        return new RuleSetDefinition(id, BigDecimal.ONE.setScale(3), FlowRules.FROM, FOREVER, ruleIds, SetStatus.INUSE, null);
    }

    private static RuleSetDefinition flowSet(String id, FlowDefinition f) {
        return new RuleSetDefinition(id, BigDecimal.ONE.setScale(3), FlowRules.FROM, FOREVER, List.of("R_A"), SetStatus.INUSE, f);
    }

    @Test
    void 같은_정의를_여러_번_판정해도_세트당_준비는_하나다() {
        InMemoryDefinitionLookup l = FlowRules.lookup(calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "A * 2", "A"));
        l.addSet(linearSet("S1", List.of("R_A", "R_B")), linearSet("S2", List.of("R_A")));
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, l);
        for (int i = 0; i < 5; i++) {
            engine.evaluateSet("S1", rec("X", new BigDecimal(i)), TS);
            engine.evaluateSet("S2", rec("X", new BigDecimal(i)), TS);
        }
        assertEquals(2, engine.cachedPlans());
    }

    @Test
    void 기억하는_세트_준비_수는_상한을_넘지_않는다() {
        InMemoryDefinitionLookup l = FlowRules.lookup(calc("R_A", "A", "X + 1", "X"));
        int n = MdmRuleEngine.MAX_PLANS + 40;
        for (int i = 0; i < n; i++) {
            l.addSet(linearSet("S" + i, List.of("R_A")));
        }
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, l);
        for (int i = 0; i < n; i++) {
            RuleSetResult r = engine.evaluateSet("S" + i, rec("X", BigDecimal.ONE), TS);
            assertEquals(0, new BigDecimal("2").compareTo((BigDecimal) r.finalValues().get("A")));
            assertTrue(engine.cachedPlans() <= MdmRuleEngine.MAX_PLANS, "상한 초과: " + engine.cachedPlans());
        }
    }

    @Test
    void 흐름_파싱에_실패한_정의는_기억하지_않는다() {
        FlowDefinition broken = flow(List.of(start(), rule("a", "R_A"), end()), List.of(e("e0", "start", "a")));
        InMemoryDefinitionLookup l = FlowRules.lookup(calc("R_A", "A", "X + 1", "X"));
        l.addSet(flowSet("BROKEN", broken));
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, l);
        for (int i = 0; i < 3; i++) {
            EngineEvaluationException ex = assertThrows(EngineEvaluationException.class,
                    () -> engine.evaluateSet("BROKEN", rec("X", BigDecimal.ONE), TS));
            assertEquals(Code.FLOW_INVALID, ex.violations().get(0).code());
        }
        assertEquals(0, engine.cachedPlans());
    }

    @Test
    void 검사기_사본은_정의_부분을_나눠_쓰고_지연_목록은_따로_가진다() {
        // start → a(R_A: A 생성) → d(R_D: A·Z 를 읽는다) → end. A 는 레코드에 없어도 R_A 가 만든다.
        RuleDefinition ra = calc("R_A", "A", "X + 1", "X");
        RuleDefinition rd = calc("R_D", "D", "A + Z", "A", "Z");
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        defs.put("R_A", ra);
        defs.put("R_D", rd);
        FlowDefinition f = flow(List.of(start(), rule("a", "R_A"), rule("d", "R_D"), end()),
                List.of(e("e0", "start", "a"), e("e1", "a", "d"), e("e2", "d", "end")));
        var tree = FlowParser.parse(f).tree();
        FlowKeys template = new FlowKeys(defs, evaluator);
        FlowKeys first = template.forRun();
        FlowKeys second = template.forRun();
        assertNotSame(first, second);
        assertSame(first.condTypes("A > 0").get("A"), second.condTypes("A > 0").get("A"));
        // 레코드마다 검사 결과가 따로 나온다 — Z 가 없는 레코드만 MISSING_KEY.
        assertEquals(1, first.check(tree.root(), Set.of("X")).size());
        assertEquals(0, second.check(tree.root(), Set.of("X", "Z")).size());
        assertEquals(List.of(), template.deferred("d"));
    }
}
