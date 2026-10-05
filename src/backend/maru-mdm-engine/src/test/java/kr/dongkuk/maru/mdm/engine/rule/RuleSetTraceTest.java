package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
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
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.BranchOutcome;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** traceSet — 노드 단위 실행 기록(spec §4.2, plan C5). 저장하지 않은 흐름을 직접 받고 판정 오류를 던지지 않는다. */
class RuleSetTraceTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"), calc("R_C", "C", "X + 3", "X"),
            calc("R_A10", "A", "X + 10", "X"), calc("R_ERR", "E", "X / 0", "X"), calc("R_Y", "YY", "Y + 1", "Y"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RunTrace trace(FlowDefinition f, Map<String, Object> record) {
        return engine.traceSet(new RuleSetDefinition("DRAFT", null, null, null, List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS);
    }

    private static List<String> kinds(RunTrace t) {
        return t.nodes().stream().map(n -> n.seq() + ":" + n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    private static List<String> v(List<Violation> vs) {
        return vs.stream().map(x -> x.stage() + "/" + x.code() + "/" + x.ruleId() + "/" + x.rowId() + "/" + x.name()).toList();
    }

    private static FlowDefinition ifFlow(String cond1) {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, cond1), br("b2", "if1", "b", 2, "X > 0"),
                        other("bo", "if1", "c"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
    }

    @Test
    void IF_흐름의_노드별_기록() {
        RunTrace t = trace(ifFlow("X > 10"), rec("X", new BigDecimal("20")));
        assertNull(t.violations());
        assertEquals("DRAFT", t.setId());
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:OK", "3:a:RULE:OK", "4:m1:MERGE:OK", "5:end:END:OK"), kinds(t));
        NodeTrace ifNode = t.nodes().get(1);
        assertEquals("b1", ifNode.chosenEdgeId());
        assertEquals(List.of("b1:TRUE", "b2:NOT_EVALUATED", "bo:NOT_EVALUATED"),
                ifNode.branches().stream().map(b -> b.edgeId() + ":" + b.outcome()).toList());
        NodeTrace a = t.nodes().get(2);
        assertEquals("R_A", a.ruleId());
        assertEquals(new java.math.BigDecimal("1.000"), a.ver());
        assertEquals(List.of("X"), List.copyOf(a.reads().keySet()));
        assertNum("21", a.result().results().get("A"));
        assertEquals("if1", t.nodes().get(3).splitId());
        assertNum("21", t.finalValues().get("A"));
        assertEquals(rec("X", new BigDecimal("20")), t.input());
    }

    @Test
    void 그_외를_타면_앞_갈래는_FALSE_그_외는_TRUE() {
        RunTrace t = trace(ifFlow("X > 10"), rec("X", new BigDecimal("-1")));
        assertEquals(List.of("b1:FALSE", "b2:FALSE", "bo:TRUE"),
                t.nodes().get(1).branches().stream().map(b -> b.edgeId() + ":" + b.outcome()).toList());
    }

    @Test
    void 조건식_NULL_은_NULL_로_남는다() {
        RunTrace t = trace(ifFlow("FLAG"), rec("X", new BigDecimal("5"), "FLAG", null));
        assertEquals(BranchOutcome.NULL, t.nodes().get(1).branches().get(0).outcome());
        assertEquals("b2", t.nodes().get(1).chosenEdgeId());
    }

    @Test
    void 조건식_오류는_IF_노드를_ERROR_로_남기고_멈춘다() {
        RunTrace t = trace(ifFlow("X + 1"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:ERROR"), kinds(t));
        NodeTrace ifNode = t.nodes().get(1);
        assertEquals(BranchOutcome.ERROR, ifNode.branches().get(0).outcome());
        assertEquals(List.of("BRANCH_SELECT/BRANCH_EVAL_ERROR/null/null/b1"), v(ifNode.violations()));
        assertEquals(ifNode.violations(), t.violations());
    }

    @Test
    void 조건식_오류_뒤_선과_그_외_선은_NOT_EVALUATED() {
        // IF 의 branches 는 늘 나가는 선마다 하나씩, 실행 순서대로 있다(오류로 멈춰도).
        RunTrace t = trace(ifFlow("X + 1"), rec("X", new BigDecimal("5")));
        NodeTrace ifNode = t.nodes().get(1);
        assertEquals(NodeStatus.ERROR, ifNode.status());
        assertEquals(List.of("b1:ERROR", "b2:NOT_EVALUATED", "bo:NOT_EVALUATED"),
                ifNode.branches().stream().map(b -> b.edgeId() + ":" + b.outcome()).toList());
        assertNull(ifNode.chosenEdgeId());
    }

    @Test
    void 병렬_갈래_안_룰이_ERROR_면_PARALLEL_은_OK_이고_형제_결과는_finalValues_에_없다() {
        // start → p1 [a(R_A)] [x(R_ERR)] → pm → end. 합치기 전에 멈추므로 먼저 끝난 a 의 A 는 최상위 결과가 아니다.
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("x", "R_ERR"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1x", "p1", "x", 2),
                        e("ea", "a", "pm"), e("ex", "x", "pm"), e("ee", "pm", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:p1:PARALLEL:OK", "3:a:RULE:OK", "4:x:RULE:ERROR"), kinds(t));
        assertEquals(Map.of(), t.finalValues());
        assertEquals(t.nodes().get(3).violations(), t.violations());
    }

    @Test
    void 룰_오류는_그_룰_노드를_ERROR_로_남기고_앞_결과는_남는다() {
        FlowDefinition f = flow(List.of(start(), rule("a", "R_A"), rule("x", "R_ERR"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "x"), e("e3", "x", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:a:RULE:OK", "3:x:RULE:ERROR"), kinds(t));
        NodeTrace x = t.nodes().get(2);
        assertEquals("R_ERR", x.ruleId());
        assertNull(x.result());
        assertEquals(List.of("X"), List.copyOf(x.reads().keySet()));
        assertNum("2", t.finalValues().get("A"));
        assertEquals(x.violations(), t.violations());
    }

    @Test
    void 갈래_진입_키_검사가_실패하면_IF_노드를_ERROR_로_남긴다() {
        // 분기 노드 기록은 갈래 선택·진입 키 검사 뒤, 갈래 몸체 실행 전에 남는다. 진입 키 검사가 실패하면 그 IF 가 ERROR 다.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("y", "R_Y"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "y", 1, "X > 0"), other("bo", "if1", "c"),
                        e("ey", "y", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:ERROR"), kinds(t));
        NodeTrace ifNode = t.nodes().get(1);
        assertEquals("b1", ifNode.chosenEdgeId());
        assertEquals(List.of("b1:TRUE", "bo:NOT_EVALUATED"),
                ifNode.branches().stream().map(b -> b.edgeId() + ":" + b.outcome()).toList());
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_Y/null/Y"), v(ifNode.violations()));
        assertEquals(ifNode.violations(), t.violations());
    }

    @Test
    void 끝까지_가면_노드_기록_순서가_evaluateSet_path_와_같다() {
        // start → if1 [X > 10 → a][그 외 → c] → m1 → p1 [pb(R_B)][pc(R_C)] → pm → end
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("c", "R_C"), merge("m1", "if1"),
                        par("p1"), rule("pb", "R_B"), rule("pc", "R_C"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("ec", "c", "m1"), e("em", "m1", "p1"), pe("p1b", "p1", "pb", 1), pe("p1c", "p1", "pc", 2),
                        e("eb", "pb", "pm"), e("ep", "pc", "pm"), e("ee", "pm", "end")));
        lookup.addSet(new RuleSetDefinition("DRAFT", null, null, null, List.of(), SetStatus.INUSE, f));
        RuleSetResult r = engine.evaluateSet("DRAFT", rec("X", new BigDecimal("20")), SampleRules.EVAL_TS);
        RunTrace t = trace(f, rec("X", new BigDecimal("20")));
        assertEquals(r.path().stream().map(p -> p.nodeId() + ":" + p.kind()).toList(),
                t.nodes().stream().map(n -> n.nodeId() + ":" + n.kind()).toList());
        assertEquals(r.finalValues(), t.finalValues());
        assertEquals(r.steps(), t.nodes().stream().filter(n -> n.kind() == NodeKind.RULE).map(NodeTrace::result).toList());
    }

    @Test
    void 저장_전_구조_오류_흐름은_던지지_않고_FLOW_INVALID_와_빈_노드() {
        // Review Focus 4
        FlowDefinition noElse = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X < 0"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(noElse, rec("X", BigDecimal.ONE));
        assertEquals(List.of(), t.nodes());
        assertEquals(List.of("SET_CHECK/FLOW_INVALID/null/null/if1"), v(t.violations()));
        assertEquals(Map.of(), t.finalValues());
    }

    @Test
    void 입력_키가_없으면_빈_노드와_MISSING_KEY() {
        RunTrace t = trace(ifFlow("Z > 0"), rec("X", BigDecimal.ONE));
        assertEquals(List.of(), t.nodes());
        assertEquals(List.of("SET_CHECK/MISSING_KEY/null/null/Z"), v(t.violations()));
    }

    @Test
    void 병렬_기록은_실행_순서와_합친_변수이고_같은_이름은_뒤_갈래가_이긴다() {
        // Review Focus 5 — 형제가 같은 이름(A)을 쓰는 흐름을 검사 없이 두 번 돌려도 같다.
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_A10"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2),
                        e("ea", "a", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RunTrace first = trace(f, rec("X", BigDecimal.ONE));
        RunTrace second = trace(f, rec("X", BigDecimal.ONE));
        NodeTrace p = first.nodes().get(1);
        assertEquals(NodeKind.PARALLEL, p.kind());
        assertEquals(List.of("p1a", "p1b"), p.order());
        NodeTrace pm = first.nodes().get(4);
        assertEquals(NodeKind.MERGE, pm.kind());
        assertEquals(List.of("A"), pm.merged());
        assertNum("11", first.finalValues().get("A"));
        assertEquals(first, second);
    }

    @Test
    void 받은_레코드를_바꾸지_않는다() {
        Map<String, Object> record = rec("X", new BigDecimal("20"));
        trace(ifFlow("X > 10"), record);
        assertEquals(rec("X", new BigDecimal("20")), record);
    }

    @Test
    void 성공_노드는_모두_OK() {
        RunTrace t = trace(ifFlow("X > 10"), rec("X", new BigDecimal("20")));
        assertEquals(List.of(), t.nodes().stream().filter(n -> n.status() != NodeStatus.OK).toList());
    }

    @Test
    void 고친_값이_없는_4인자_기록은_3인자와_같고_edits_는_null() {
        RuleSetDefinition set = new RuleSetDefinition("DRAFT", null, null, null, List.of(), SetStatus.INUSE, ifFlow("X > 10"));
        RunTrace three = engine.traceSet(set, rec("X", new BigDecimal("20")), SampleRules.EVAL_TS);
        RunTrace four = engine.traceSet(set, rec("X", new BigDecimal("20")), SampleRules.EVAL_TS, List.of());
        assertEquals(three, four);
        assertNull(four.edits());
    }

    @Test
    void 빈_단계는_칸_없는_OK_노드로_남고_결과를_바꾸지_않는다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:t1:TASK:OK", "3:a:RULE:OK", "4:end:END:OK"), kinds(t));
        NodeTrace tn = t.nodes().get(1);
        assertEquals(new NodeTrace(2, "t1", NodeKind.TASK, NodeStatus.OK, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null), tn);
        assertNum("2", t.finalValues().get("A"));
    }

    @Test
    void 룰_없이_빈_단계만_있는_흐름도_실행된다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), end()), List.of(e("e1", "start", "t1"), e("e2", "t1", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:t1:TASK:OK", "3:end:END:OK"), kinds(t));
        assertEquals(Map.of(), t.finalValues());
    }

    @Test
    void IF_갈래_안의_빈_단계를_타면_결과가_없다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), task("t1"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "t1", 1, "X > 10"), other("bo", "if1", "c"),
                        e("et", "t1", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(f, rec("X", new BigDecimal("20")));
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:OK", "3:t1:TASK:OK", "4:m1:MERGE:OK", "5:end:END:OK"), kinds(t));
        assertEquals(Map.of(), t.finalValues());
    }

    @Test
    void 병렬_갈래_안의_빈_단계는_합칠_이름이_없다() {
        FlowDefinition f = flow(List.of(start(), par("p1"), task("t1"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "t1", 1), pe("p1b", "p1", "b", 2),
                        e("et", "t1", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:p1:PARALLEL:OK", "3:t1:TASK:OK", "4:b:RULE:OK", "5:pm:MERGE:OK", "6:end:END:OK"), kinds(t));
        assertEquals(List.of("B"), t.nodes().get(4).merged());
    }
}
