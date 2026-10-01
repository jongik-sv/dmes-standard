package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Predicate;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/**
 * implicit-join spec §5 결과 불변·§14.1 쌍둥이 — 옛 형식 흐름과 편집기 변환(§12.2) 결과 모양의 새 형식 짝을 같은 입력으로 돌려
 * steps·finalValues·caught·endedBy·warnings 가 같고, path·기록은 MERGE 항목(과 J-D10 의 빈 단계 항목)만 다름을 본다.
 */
class RuleSetLegacyMergeTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            RuleSetCatchTest.grade("R_G", HitPolicy.FIRST), calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"),
            calc("R_C", "C", "X + 3", "X"), calc("R_FILL", "G", "0"), calc("R_AFTER", "Z", "X * 2", "X"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private record Run(RuleSetResult result, RunTrace trace) {}

    private Run both(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", List.of(), SetStatus.INUSE, f));
        return new Run(engine.evaluateSet("S", record, SampleRules.EVAL_TS),
                engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS));
    }

    private static List<String> path(RuleSetResult r, Predicate<RuleSetResult.PathStep> keep) {
        return r.path().stream().filter(keep).map(p -> p.nodeId() + ":" + p.kind() + ":" + p.chosenEdgeId() + ":" + p.stepIndex()).toList();
    }

    private static List<String> nodes(RunTrace t, Predicate<NodeTrace> keep) {
        return t.nodes().stream().filter(keep).map(n -> n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    /** 결과 다섯 칸이 같고, 옛 형식은 MERGE 를, 새 형식은 taskIds 빈 단계를 빼면 path·기록 노드가 같다. 옛 형식에는 MERGE 기록이 있어야 한다. */
    private void same(FlowDefinition legacy, FlowDefinition fresh, Set<String> taskIds, Map<String, Object> record) {
        Run a = both(legacy, record);
        Run b = both(fresh, record);
        assertEquals(a.result().steps(), b.result().steps());
        assertEquals(a.result().finalValues(), b.result().finalValues());
        assertEquals(a.result().caught(), b.result().caught());
        assertEquals(a.result().endedBy(), b.result().endedBy());
        assertEquals(a.result().warnings(), b.result().warnings());
        assertTrue(a.result().path().stream().anyMatch(p -> p.kind() == NodeKind.MERGE), "옛 형식은 MERGE 를 기록한다");
        assertTrue(b.result().path().stream().noneMatch(p -> p.kind() == NodeKind.MERGE), "새 형식은 MERGE 기록이 없다");
        assertEquals(path(a.result(), p -> p.kind() != NodeKind.MERGE),
                path(b.result(), p -> !(p.kind() == NodeKind.TASK && taskIds.contains(p.nodeId()))));
        assertEquals(nodes(a.trace(), n -> n.kind() != NodeKind.MERGE), nodes(b.trace(), n -> !(n.kind() == NodeKind.TASK && taskIds.contains(n.nodeId()))));
        assertEquals(a.trace().finalValues(), b.trace().finalValues());
        assertEquals(a.trace().endedBy(), b.trace().endedBy());
    }

    @Test
    void IF_합류가_룰_앞에_있던_흐름은_합류만_빠진다() {
        FlowDefinition legacy = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"),
                        rule("n", "R_AFTER"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("em", "m1", "n"), e("en", "n", "end")));
        FlowDefinition fresh = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), rule("n", "R_AFTER"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "n"), e("eb", "b", "n"), e("ec", "c", "n"), e("en", "n", "end")));
        for (String x : List.of("20", "5", "-5")) {
            same(legacy, fresh, Set.of(), rec("X", new BigDecimal(x)));
        }
    }

    @Test
    void END_앞_IF_합류를_빈_단계로_바꾼_짝은_끝내는_갈래가_생기지_않는다() {
        FlowDefinition fresh = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), task("m1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        Split s = (Split) FlowParser.parse(fresh).tree().root().items().get(0);
        assertEquals("m1", s.joinId());
        assertTrue(s.branches().stream().noneMatch(Branch::ends));
        for (String x : List.of("20", "5", "-5")) {
            same(ifFlow(), fresh, Set.of("m1"), rec("X", new BigDecimal(x)));
        }
    }

    @Test
    void 돌아오는_합류가_룰_앞에_있던_흐름은_합류만_빠진다() {
        FlowDefinition fresh = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "after"), e("e3", "c1", "h"), e("e4", "h", "after"), e("e6", "after", "end")));
        for (String x : List.of("5", "50")) {
            same(RuleSetCatchTest.returning("R_G", "R_FILL", "NO_RESULT"), fresh, Set.of(), rec("X", new BigDecimal(x)));
        }
    }

    @Test
    void END_앞_돌아오는_합류를_빈_단계로_바꾼_짝은_끝냄이_되지_않는다() {
        FlowDefinition legacy = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        FlowDefinition fresh = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), task("mr"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        same(legacy, fresh, Set.of("mr"), rec("X", new BigDecimal("5")));
        assertNull(both(fresh, rec("X", new BigDecimal("5"))).result().endedBy());
    }
}
