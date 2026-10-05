package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
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
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.ColumnDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/**
 * 엔진 안 세트 판정 준비 기억(항목5)의 적중·무효화와 경계 — 같은 정의면 같은 준비 객체를 다시 쓰고 정의 객체가 바뀌면 새로 만든다, 크기 상한, 파싱 실패는 기억하지 않음, 검사기 사본의 지연 목록 분리.
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
        engine.evaluateSet("S1", rec("X", BigDecimal.ZERO), TS);
        engine.evaluateSet("S2", rec("X", BigDecimal.ZERO), TS);
        FlowTree tree1 = engine.cachedTree("S1");
        FlowKeys keys1 = engine.cachedKeys("S1");
        FlowTree tree2 = engine.cachedTree("S2");
        FlowKeys keys2 = engine.cachedKeys("S2");
        assertNotNull(tree1);
        assertNotNull(keys1);
        assertNotSame(tree1, tree2);
        for (int i = 1; i < 5; i++) {
            engine.evaluateSet("S1", rec("X", new BigDecimal(i)), TS);
            engine.evaluateSet("S2", rec("X", new BigDecimal(i)), TS);
            // 적중 — 앞에서 만든 흐름 트리·검사기 원본을 그대로 다시 쓴다.
            assertSame(tree1, engine.cachedTree("S1"));
            assertSame(keys1, engine.cachedKeys("S1"));
            assertSame(tree2, engine.cachedTree("S2"));
            assertSame(keys2, engine.cachedKeys("S2"));
        }
        assertEquals(2, engine.cachedPlans());
    }

    @Test
    void 룰_정의_객체가_바뀌면_검사기를_새로_만들고_세트_정의가_바뀌면_흐름도_새로_만든다() {
        SwappableLookup l = new SwappableLookup(FlowRules.lookup(calc("R_A", "A", "X + 1", "X")));
        l.delegate.addSet(linearSet("S1", List.of("R_A")));
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, l);
        RuleSetResult r = engine.evaluateSet("S1", rec("X", BigDecimal.ONE), TS);
        assertEquals(0, new BigDecimal("2").compareTo((BigDecimal) r.finalValues().get("A")));
        FlowTree tree1 = engine.cachedTree("S1");
        FlowKeys keys1 = engine.cachedKeys("S1");

        // 룰 재등록(새 정의 객체) — 세트 정의는 같으므로 흐름 트리는 다시 쓰고, 검사기 원본은 새로 만든다.
        l.rule = calc("R_A", "A", "X + 10", "X");
        r = engine.evaluateSet("S1", rec("X", BigDecimal.ONE), TS);
        assertEquals(0, new BigDecimal("11").compareTo((BigDecimal) r.finalValues().get("A")));
        assertSame(tree1, engine.cachedTree("S1"));
        FlowKeys keys2 = engine.cachedKeys("S1");
        assertNotSame(keys1, keys2);
        engine.evaluateSet("S1", rec("X", BigDecimal.ONE), TS);
        assertSame(keys2, engine.cachedKeys("S1"));

        // 세트 재등록(내용이 같아도 새 정의 객체) — 흐름 트리와 검사기 원본을 모두 새로 만든다.
        l.set = linearSet("S1", List.of("R_A"));
        r = engine.evaluateSet("S1", rec("X", BigDecimal.ONE), TS);
        assertEquals(0, new BigDecimal("11").compareTo((BigDecimal) r.finalValues().get("A")));
        assertNotSame(tree1, engine.cachedTree("S1"));
        assertNotSame(keys2, engine.cachedKeys("S1"));
        assertEquals(1, engine.cachedPlans());
    }

    /** 룰·세트 정의를 새 객체로 바꿔 끼울 수 있는 조회기 — 재등록·RELOAD 로 새 정의 객체가 오는 상황을 흉내 낸다. */
    private static final class SwappableLookup implements DefinitionLookup {
        final InMemoryDefinitionLookup delegate;
        RuleDefinition rule;
        RuleSetDefinition set;

        SwappableLookup(InMemoryDefinitionLookup delegate) {
            this.delegate = delegate;
        }

        @Override
        public Optional<ColumnDefinition> column(String table, String column) {
            return delegate.column(table, column);
        }

        @Override
        public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
            return rule != null && rule.ruleId().equals(ruleId) ? Optional.of(rule) : delegate.rule(ruleId, evalTs);
        }

        @Override
        public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
            return set != null && set.setId().equals(setId) ? Optional.of(set) : delegate.ruleSet(setId, evalTs);
        }
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
        // start → if1 [X > 0 → a(R_A: A 생성)] [그 외 → b(R_B: B 생성)] → m1 → d(R_D: A 를 읽는다) → end.
        // A 는 IF 일부 갈래에서만 만들어지므로, 레코드에 A 가 없으면 d 의 지연 목록에 들어가 실행 직전에 본다.
        RuleDefinition ra = calc("R_A", "A", "X + 1", "X");
        RuleDefinition rb = calc("R_B", "B", "X + 2", "X");
        RuleDefinition rd = calc("R_D", "D", "A * 2", "A");
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        defs.put("R_A", ra);
        defs.put("R_B", rb);
        defs.put("R_D", rd);
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), rule("d", "R_D"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"), e("ea", "a", "m1"),
                        e("eb", "b", "m1"), e("em", "m1", "d"), e("ed", "d", "end")));
        var tree = FlowParser.parse(f).tree();
        FlowKeys template = new FlowKeys(defs, evaluator);
        FlowKeys first = template.forRun();
        FlowKeys second = template.forRun();
        assertNotSame(first, second);
        // 정의에만 의존하는 선언 타입은 나눠 쓴다.
        assertSame(first.condTypes("A > 0").get("A"), second.condTypes("A > 0").get("A"));
        // A 가 없는 레코드 — 사전 검사는 통과하고 d 의 지연 목록에 A 가 들어간다. 다른 사본과 원본에는 새지 않는다.
        assertEquals(0, first.check(tree.root(), Set.of("X")).size());
        assertEquals(List.of("A"), first.deferred("d"));
        assertEquals(List.of(), second.deferred("d"));
        assertEquals(List.of(), template.deferred("d"));
        // A 가 있는 레코드 — 지연할 이름이 없다. 앞 사본의 지연 목록은 그대로다.
        assertEquals(0, second.check(tree.root(), Set.of("X", "A")).size());
        assertEquals(List.of(), second.deferred("d"));
        assertEquals(List.of("A"), first.deferred("d"));
        assertEquals(List.of(), template.deferred("d"));
    }

    @Test
    void 하위_세트나_손주_세트_정의가_바뀌면_부모_준비를_다시_만들고_결과도_바뀐다() {
        // P: s1(C) / C: s2(G) / G: g(R_G: G = X + 1) — 부모 준비는 손주 세트 정의·손주 룰 정의의 동일성까지 본다(하위 세트 계획 Task 4).
        MapLookup l = new MapLookup();
        l.rules.put("R_G", calc("R_G", "G", "X + 1", "X"));
        l.sets.put("G", subset("G", line(rule("g", "R_G"))));
        l.sets.put("C", subset("C", line(set("s2", "G"))));
        l.sets.put("P", subset("P", line(set("s1", "C"))));
        MdmRuleEngine engine = new MdmRuleEngine(evaluator, l);
        assertEquals(0, new BigDecimal("2").compareTo((BigDecimal) engine.evaluateSet("P", rec("X", BigDecimal.ONE), TS).finalValues().get("G")));
        FlowTree tree1 = engine.cachedTree("P");
        FlowKeys keys1 = engine.cachedKeys("P");
        engine.evaluateSet("P", rec("X", BigDecimal.ONE), TS);
        assertSame(keys1, engine.cachedKeys("P"), "하위 정의가 그대로면 적중");

        // 손주 세트 재등록(새 정의 객체, 다른 룰) — 부모 흐름 트리는 그대로, 준비는 새로.
        l.rules.put("R_G2", calc("R_G2", "G", "X + 100", "X"));
        l.sets.put("G", subset("G", line(rule("g", "R_G2"))));
        RuleSetResult r = engine.evaluateSet("P", rec("X", BigDecimal.ONE), TS);
        assertEquals(0, new BigDecimal("101").compareTo((BigDecimal) r.finalValues().get("G")));
        assertSame(tree1, engine.cachedTree("P"));
        FlowKeys keys2 = engine.cachedKeys("P");
        assertNotSame(keys1, keys2);

        // 손주 세트의 룰만 재등록 — 역시 새로 준비한다.
        l.rules.put("R_G2", calc("R_G2", "G", "X + 1000", "X"));
        r = engine.evaluateSet("P", rec("X", BigDecimal.ONE), TS);
        assertEquals(0, new BigDecimal("1001").compareTo((BigDecimal) r.finalValues().get("G")));
        assertNotSame(keys2, engine.cachedKeys("P"));
        assertSame(tree1, engine.cachedTree("P"));

        // 손주 세트를 폐기하면 다음 판정이 준비 단계에서 멈추고, 되살리면 다시 돈다.
        RuleSetDefinition live = l.sets.get("G");
        l.sets.put("G", new RuleSetDefinition("G", live.ver(), live.applyFrom(), live.applyTo(), live.ruleIds(), SetStatus.DEPRECATED, live.flow()));
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class, () -> engine.evaluateSet("P", rec("X", BigDecimal.ONE), TS));
        assertEquals(List.of(Code.SET_DEPRECATED, List.of("s1")), List.of(ex.violations().get(0).code(), ex.violations().get(0).setPath()));
        l.sets.put("G", live);
        assertEquals(0, new BigDecimal("1001").compareTo((BigDecimal) engine.evaluateSet("P", rec("X", BigDecimal.ONE), TS).finalValues().get("G")));
        assertEquals(1, engine.cachedPlans(), "기억은 최상위 세트 ID 마다 하나다");
    }

    private static RuleSetDefinition subset(String id, FlowDefinition f) {
        return new RuleSetDefinition(id, BigDecimal.ONE.setScale(3), FlowRules.FROM, FOREVER, List.of(), SetStatus.INUSE, f);
    }

    /** 룰·세트 정의를 ID 마다 새 객체로 바꿔 끼울 수 있는 조회기(평가 시각은 보지 않는다). */
    private static final class MapLookup implements DefinitionLookup {
        final Map<String, RuleDefinition> rules = new LinkedHashMap<>();
        final Map<String, RuleSetDefinition> sets = new LinkedHashMap<>();

        @Override
        public Optional<ColumnDefinition> column(String table, String column) {
            return Optional.empty();
        }

        @Override
        public Optional<RuleDefinition> rule(String ruleId, Instant evalTs) {
            return Optional.ofNullable(rules.get(ruleId));
        }

        @Override
        public Optional<RuleSetDefinition> ruleSet(String setId, Instant evalTs) {
            return Optional.ofNullable(sets.get(setId));
        }
    }
}
