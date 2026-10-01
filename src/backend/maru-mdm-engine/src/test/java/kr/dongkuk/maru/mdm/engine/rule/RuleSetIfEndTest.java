package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.CaughtException;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** implicit-join spec §5·§14.1 — 끝내는 IF 갈래(B1): 루트·병렬 갈래 안·처리 갈래 안·정상 갈래 안 끝냄, 입력 키 검사, evaluateSet·traceSet 일치. */
class RuleSetIfEndTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            RuleSetCatchTest.grade("R_G", HitPolicy.FIRST), calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"),
            calc("R_ERR", "E", "X / 0", "X"), calc("R_FILL", "G", "0"), calc("R_AFTER", "Z", "X * 2", "X"), calc("R_W", "Q", "W + 1", "W"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", List.of(), SetStatus.INUSE, f));
        return engine.evaluateSet("S", record, SampleRules.EVAL_TS);
    }

    private RunTrace trace(FlowDefinition f, Map<String, Object> record) {
        return engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS);
    }

    private static List<String> path(RuleSetResult r) {
        return r.path().stream().map(p -> p.nodeId() + ":" + p.kind() + ":" + p.stepIndex()).toList();
    }

    private static List<String> kinds(RunTrace t) {
        return t.nodes().stream().map(n -> n.seq() + ":" + n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    /** start → r0(R_A) → if1 [b1 "X > 10" → k(R_B) → end](끝내는 갈래) [그 외 → n] → n(R_AFTER) → end. */
    static FlowDefinition rootEnding() {
        return flow(List.of(start(), rule("r0", "R_A"), ifNode("if1"), rule("k", "R_B"), rule("n", "R_AFTER"), end()),
                List.of(e("e1", "start", "r0"), e("e2", "r0", "if1"), br("b1", "if1", "k", 1, "X > 10"), e("ek", "k", "end"),
                        other("bo", "if1", "n"), e("en", "n", "end")));
    }

    @Test
    void 루트_IF_의_끝내는_갈래를_타면_정상_완료이고_endedBy_가_없다() {
        RuleSetResult r = run(rootEnding(), rec("X", new BigDecimal("20")));
        assertNull(r.endedBy());
        assertEquals(List.of(), r.caught());
        assertEquals(List.of("start:START:null", "r0:RULE:0", "if1:IF:null", "k:RULE:1", "end:END:null"), path(r));
        assertEquals("b1", r.path().get(2).chosenEdgeId());
        assertNum("21", r.finalValues().get("A"));
        assertNum("22", r.finalValues().get("B"));
        assertFalse(r.finalValues().containsKey("Z"));
        RunTrace t = trace(rootEnding(), rec("X", new BigDecimal("20")));
        assertNull(t.endedBy());
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:r0:RULE:OK", "3:if1:IF:OK", "4:k:RULE:OK", "5:end:END:OK"), kinds(t));
    }

    @Test
    void 끝내는_갈래를_타지_않으면_모이는_자리로_이어지고_합류_기록이_없다() {
        RuleSetResult r = run(rootEnding(), rec("X", new BigDecimal("5")));
        assertEquals(List.of("start:START:null", "r0:RULE:0", "if1:IF:null", "n:RULE:1", "end:END:null"), path(r));
        assertNum("10", r.finalValues().get("Z"));
    }

    @Test
    void 병렬_갈래_안_IF_끝냄은_남은_형제를_돌리지_않고_끝난_형제와_지금_갈래까지_합친다() {
        // start → p1 [1 → a(R_A) → pm] [2 → if1 [b1 "X > 0" → k(R_AFTER) → end] [그 외 → pm]] [3 → b(R_B) → pm] → pm → end
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), ifNode("if1"), rule("k", "R_AFTER"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1i", "p1", "if1", 2), pe("p1b", "p1", "b", 3), e("ea", "a", "pm"),
                        br("b1", "if1", "k", 1, "X > 0"), e("ek", "k", "end"), other("bo", "if1", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertNull(r.endedBy());
        assertEquals(List.of("A", "Z"), List.copyOf(r.finalValues().keySet()));
        assertNum("6", r.finalValues().get("A"));
        assertNum("10", r.finalValues().get("Z"));
        assertEquals(List.of("R_A", "R_AFTER"), r.steps().stream().map(RuleResult::ruleId).toList());
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        assertEquals(r.path().stream().map(RuleSetResult.PathStep::nodeId).toList(), t.nodes().stream().map(NodeTrace::nodeId).toList());
        assertEquals(r.finalValues().keySet(), t.finalValues().keySet());
    }

    /** start → r1(R_G) → n(R_AFTER) → end. c1(NO_RESULT) → if1 [b1 "X > 0" → f(R_FILL) → end] [그 외 → h(R_A)] → h → n. */
    static FlowDefinition handlerEnding() {
        return flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), ifNode("if1"), rule("f", "R_FILL"), rule("h", "R_A"),
                        rule("n", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n"), e("e3", "c1", "if1"), br("b1", "if1", "f", 1, "X > 0"), e("ef", "f", "end"),
                        other("bo", "if1", "h"), e("eh", "h", "n"), e("en", "n", "end")));
    }

    @Test
    void 처리_갈래_안_IF_끝냄은_그_받는_노드가_endedBy_다() {
        RuleSetResult r = run(handlerEnding(), rec("X", new BigDecimal("5")));
        assertEquals("c1", r.endedBy());
        assertEquals(List.of("c1"), r.caught().stream().map(CaughtException::catchNodeId).toList());
        assertNum("0", r.finalValues().get("G"));
        assertFalse(r.finalValues().containsKey("Z"));
        for (String k : r.finalValues().keySet()) {
            assertFalse(k.startsWith("CATCH_"), k);
        }
        RunTrace t = trace(handlerEnding(), rec("X", new BigDecimal("5")));
        assertEquals("c1", t.endedBy());
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:CAUGHT", "3:c1:CATCH:OK", "4:if1:IF:OK", "5:f:RULE:OK", "6:end:END:OK"), kinds(t));
        // 끝내는 갈래를 타지 않으면 돌아오는 처리 갈래다.
        RuleSetResult back = run(handlerEnding(), rec("X", new BigDecimal("-5")));
        assertNull(back.endedBy());
        assertNum("-4", back.finalValues().get("A"));
        assertNum("-10", back.finalValues().get("Z"));
    }

    @Test
    void 중첩_처리_갈래_안_IF_끝냄은_가장_안쪽_받는_노드가_endedBy_다() {
        // r1(R_ERR) → end, c1 EVAL_ERROR → h1(R_G) → end, c9(h1) NO_RESULT → if9 [b "X > 0" → f(R_FILL) → end] [그 외 → q(R_A) → end]
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h1", "R_G"), catchNode("c9", "h1", "NO_RESULT"),
                        ifNode("if9"), rule("f", "R_FILL"), rule("q", "R_A"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "h1"), e("e4", "h1", "end"), e("e5", "c9", "if9"),
                        br("b", "if9", "f", 1, "X > 0"), e("ef", "f", "end"), other("bo", "if9", "q"), e("eq", "q", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("c9", r.endedBy());
        assertEquals(List.of("c1", "c9"), r.caught().stream().map(CaughtException::catchNodeId).toList());
    }

    @Test
    void 받는_노드_정상_갈래_안_IF_끝냄은_endedBy_가_없다() {
        // r1(R_G) → if1 [b "X > 10" → k(R_B) → end] [그 외 → n(R_AFTER)] → n → j(R_A) → end. c1(NO_RESULT) → h(R_FILL) → j.
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), ifNode("if1"), rule("k", "R_B"), rule("n", "R_AFTER"), rule("j", "R_A"),
                        catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "if1"), br("b", "if1", "k", 1, "X > 10"), e("ek", "k", "end"), other("bo", "if1", "n"),
                        e("en", "n", "j"), e("ej", "j", "end"), e("ec", "c1", "h"), e("eh", "h", "j")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("50")));
        assertNull(r.endedBy());
        assertEquals(List.of(), r.caught());
        assertEquals("HI", r.finalValues().get("G"));
        assertNum("52", r.finalValues().get("B"));
        assertFalse(r.finalValues().containsKey("A"));
    }

    @Test
    void 끝내는_갈래로_들어갈_때도_입력_키를_본다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("k", "R_W"), rule("n", "R_AFTER"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "k", 1, "X > 0"), e("ek", "k", "end"), other("bo", "if1", "n"), e("en", "n", "end")));
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class, () -> run(f, rec("X", new BigDecimal("5"))));
        assertEquals(Code.MISSING_KEY, ex.violations().get(0).code());
        assertEquals("W", ex.violations().get(0).name());
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        NodeTrace last = t.nodes().get(t.nodes().size() - 1);
        assertEquals("if1", last.nodeId());
        assertEquals(NodeStatus.ERROR, last.status());
    }
}
