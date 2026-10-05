package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.deprecated;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.inuse;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
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
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
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
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §3·§3.1·§3.2 — SET 노드 실행·출력 넘기기·운영 결과·기록(하위 세트 계획 Task 4, Review Focus 2·6). */
class SubsetCallTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("C_A", "A", "Y + 1", "Y"), calc("C_B", "Y", "A + 1", "A"),
            calc("K_X", "X", "Y * 10", "Y"), calc("K_Z", "Z", "X + 1", "X"), calc("P_W", "W", "X + Z", "X", "Z"),
            calc("R_P", "P", "Y + 100", "Y"), calc("R_PP", "PP", "P + 1", "P"), calc("R_Q", "Q2", "Q + 1", "Q"),
            calc("R_ERR", "E", "X / 0", "X"), calc("R_K", "K", "1"), calc("R_9", "NINE", "9"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(String setId, Map<String, Object> record) {
        return engine.evaluateSet(setId, record, SampleRules.EVAL_TS);
    }

    private EngineEvaluationException fail(String setId, Map<String, Object> record) {
        return assertThrows(EngineEvaluationException.class, () -> run(setId, record));
    }

    @Test
    void 앞에서_읽고_뒤에서_만든_이름은_최종_결과로_넘기고_중간_결과는_넘기지_않는다() {
        lookup.addSet(inuse("C", line(rule("a", "C_A"), rule("b", "C_B"))));      // A = Y+1(중간), Y = A+1(최종)
        lookup.addSet(inuse("P", line(set("s1", "C"))));

        RuleSetResult r = run("P", rec("Y", "1"));

        assertEquals(List.of("Y"), List.copyOf(r.finalValues().keySet()));
        assertNum("3", r.finalValues().get("Y"));
        assertEquals(1, r.calls().size());
        assertEquals("s1", r.calls().get(0).nodeId());
        assertEquals("C", r.calls().get(0).setId());
        assertNum("2", r.calls().get(0).result().finalValues().get("A"));
        assertEquals(List.of(), r.steps(), "steps 는 이 세트의 RULE 결과만");
        assertEquals(List.of("start:START:null", "s1:SET:0", "end:END:null"),
                r.path().stream().map(p -> p.nodeId() + ":" + p.kind() + ":" + p.callIndex()).toList());
    }

    @Test
    void 하위_세트는_부모_값을_바꾸지_못한다() {
        lookup.addSet(inuse("K", line(rule("x", "K_X"), rule("z", "K_Z"))));     // X = Y*10(중간), Z = X+1(최종)
        lookup.addSet(inuse("P", line(set("s1", "K"), rule("w", "P_W"))));        // W = X + Z

        RuleSetResult r = run("P", rec("X", "5", "Y", "1"));

        assertNum("11", r.finalValues().get("Z"));
        assertNum("16", r.finalValues().get("W")); // 부모 X 는 5 그대로다
        assertFalse(r.finalValues().containsKey("X"));
    }

    @Test
    void 안_만든_출력은_부모_값을_남긴다() {
        // IFP: start → if1 [Y > 0 → rp(R_P)] [그 외 → 빈 갈래] → m1 → end. P 는 always=false 출력이다.
        FlowDefinition ifp = flow(List.of(start(), ifNode("if1"), rule("rp", "R_P"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "rp", 1, "Y > 0"), other("bo", "if1", "m1"), e("ep", "rp", "m1"),
                        e("ee", "m1", "end")));
        lookup.addSet(inuse("IFP", ifp));
        lookup.addSet(inuse("P", line(set("s1", "IFP"), rule("pp", "R_PP"))));

        assertNum("8", run("P", rec("Y", "-1", "P", "7")).finalValues().get("PP"));
        assertNum("102", run("P", rec("Y", "1", "P", "7")).finalValues().get("PP"));
    }

    @Test
    void 없는_세트_빈_세트_ID_폐기_세트는_준비_단계에서_멈춘다() {
        lookup.addSet(inuse("P1", line(set("s1", "NOPE"))));
        Violation v = fail("P1", rec()).violations().get(0);
        assertEquals(List.of(Stage.SET_CHECK, Code.SET_NOT_FOUND, "NOPE", List.of()), List.of(v.stage(), v.code(), v.name(), v.setPath()));
        assertEquals("세트가 없다: NOPE (SET 노드 s1)", v.message());

        lookup.addSet(inuse("P2", line(set("s1", null))));
        assertEquals("세트 노드 s1에 세트 ID가 없다", fail("P2", rec()).violations().get(0).message());

        lookup.addSet(deprecated("OLD", line(rule("k", "R_K"))));
        lookup.addSet(inuse("P3", line(set("s1", "OLD"))));
        Violation d = fail("P3", rec()).violations().get(0);
        assertEquals(Code.SET_DEPRECATED, d.code());
        assertEquals("폐기된 세트는 부르지 않는다: OLD (SET 노드 s1)", d.message());
    }

    @Test
    void 하위_세트_안의_룰_없음과_구조_오류는_하위_세트까지의_setPath_로_준비_단계에서_멈춘다() {
        lookup.addSet(inuse("NR", line(rule("r1", "R_NONE"))));
        lookup.addSet(inuse("P", line(rule("k", "R_K"), set("s1", "NR"))));
        Violation v = fail("P", rec()).violations().get(0);
        assertEquals(List.of(Stage.SET_CHECK, Code.RULE_NOT_FOUND, "R_NONE", List.of("s1")), List.of(v.stage(), v.code(), v.ruleId(), v.setPath()));

        lookup.addSet(inuse("BAD", flow(List.of(start(), rule("a", "R_K"), end()), List.of(e("e0", "start", "a")))));
        lookup.addSet(inuse("P2", line(set("s7", "BAD"))));
        Violation b = fail("P2", rec()).violations().get(0);
        assertEquals(List.of(Code.FLOW_INVALID, List.of("s7")), List.of(b.code(), b.setPath()));
    }

    @Test
    void 하위_세트의_처리되지_않은_위반은_setPath_를_붙여_올라온다() {
        lookup.addSet(inuse("E", line(rule("r1", "R_ERR"))));
        lookup.addSet(inuse("P", line(set("s1", "E"))));
        lookup.addSet(inuse("G", line(set("s9", "P"))));

        Violation v = fail("P", rec("X", "1")).violations().get(0);
        assertEquals(List.of(Code.EVALUATION_ERROR, "R_ERR", List.of("s1")), List.of(v.code(), v.ruleId(), v.setPath()));
        assertEquals(List.of("s9", "s1"), fail("G", rec("X", "1")).violations().get(0).setPath());
    }

    @Test
    void 부모_사전_검사에_하위_세트의_반드시_읽는_입력이_든다() {
        lookup.addSet(inuse("SQ", line(rule("q", "R_Q"))));
        lookup.addSet(inuse("P", line(set("s1", "SQ"))));

        Violation v = fail("P", rec()).violations().get(0);
        assertEquals(List.of(Stage.SET_CHECK, Code.MISSING_KEY, "Q"), List.of(v.stage(), v.code(), v.name()));
        assertEquals("세트 입력 키가 레코드에 없다: Q (세트 SQ)", v.message());
        RunTrace t = engine.traceSet(inuse("P", line(set("s1", "SQ"))), rec(), SampleRules.EVAL_TS);
        assertEquals(List.of(), t.nodes(), "실행 전에 멈춘다");
    }

    @Test
    void 하위_세트_출력은_뒤_노드의_입력으로_센다() {
        // 하위 세트의 always 출력은 부모 사전 검사에서 반드시 만드는 이름이고, 만들지 않는 이름은 그대로 모자란 입력이다.
        lookup.addSet(inuse("K9", line(rule("n", "R_9"))));                       // NINE = 9(always)
        lookup.addSet(inuse("P", line(set("s1", "K9"), rule("w", "P_W"))));       // W = X + Z — X·Z 는 레코드에 없으면 사전 검사에 걸린다
        Violation v = fail("P", rec()).violations().get(0);
        assertEquals(List.of(Code.MISSING_KEY, "X"), List.of(v.code(), v.name()));

        lookup.addSet(inuse("KZ", line(rule("x", "K_X"), rule("z", "K_Z"))));     // Z 는 always 출력
        lookup.addSet(inuse("P2", line(set("s1", "KZ"), rule("w", "P_W"))));
        RuleSetResult r = run("P2", rec("X", "5", "Y", "1"));
        assertNum("16", r.finalValues().get("W"));
        EngineEvaluationException noZ = fail("P2", rec("X", "5"));
        assertEquals("Y", noZ.violations().get(0).name(), "Z 는 하위 세트가 반드시 만들므로 모자란 입력은 하위의 Y 뿐이다");
        assertEquals(1, noZ.violations().size());
    }

    @Test
    void SET_노드는_IF_갈래가_모이는_자리와_병렬_갈래가_될_수_있다() {
        lookup.addSet(inuse("C", line(rule("a", "C_A"), rule("b", "C_B"))));
        // 새 형식 IF — 두 갈래가 SET 노드 s1 에서 모인다.
        lookup.addSet(inuse("P", flow(List.of(start(), ifNode("if1"), rule("k", "R_K"), rule("n", "R_9"), set("s1", "C"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "k", 1, "Y > 0"), other("bo", "if1", "n"), e("ek", "k", "s1"),
                        e("en", "n", "s1"), e("es", "s1", "end")))));
        RuleSetResult r = run("P", rec("Y", "1"));
        assertNum("3", r.finalValues().get("Y"));
        assertNum("1", r.finalValues().get("K"));
        assertEquals(List.of("start", "if1", "k", "s1", "end"), r.path().stream().map(RuleSetResult.PathStep::nodeId).toList());

        // 병렬 갈래 안 SET — 분기 직전 값 사본으로 돌고 갈래 결과를 합친다.
        lookup.addSet(inuse("PP", flow(List.of(start(), par("p1"), set("s1", "C"), rule("k", "R_K"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("pa", "p1", "s1", 1), pe("pb", "p1", "k", 2), e("es", "s1", "pm"), e("ek", "k", "pm"),
                        e("ee", "pm", "end")))));
        RuleSetResult q = run("PP", rec("Y", "1"));
        assertNum("3", q.finalValues().get("Y"));
        assertNum("1", q.finalValues().get("K"));
        assertEquals(0, q.path().stream().filter(p -> "s1".equals(p.nodeId())).findFirst().orElseThrow().callIndex());
    }

    @Test
    void 기록_실행은_SET_노드에_reads_outputs_sub_를_남기고_운영_경로와_노드_순서가_같다() {
        lookup.addSet(inuse("C", line(rule("a", "C_A"), rule("b", "C_B"))));
        RuleSetDefinition p = inuse("P", line(rule("k", "R_K"), set("s1", "C")));
        lookup.addSet(p);

        RunTrace t = engine.traceSet(p, rec("Y", new BigDecimal("1")), SampleRules.EVAL_TS);
        RuleSetResult r = run("P", rec("Y", new BigDecimal("1")));

        assertNull(t.violations());
        assertEquals(r.path().stream().map(RuleSetResult.PathStep::nodeId).toList(), t.nodes().stream().map(RunTrace.NodeTrace::nodeId).toList());
        RunTrace.NodeTrace s = t.nodes().get(2);
        assertEquals(List.of(NodeKind.SET, RunTrace.NodeStatus.OK), List.of(s.kind(), s.status()));
        assertNum("1", s.reads().get("Y"));
        assertEquals(List.of("Y"), List.copyOf(s.outputs().keySet()));
        assertNum("3", s.outputs().get("Y"));
        assertEquals("C", s.sub().setId());
        assertEquals(List.of(NodeKind.START, NodeKind.RULE, NodeKind.RULE, NodeKind.END), s.sub().nodes().stream().map(RunTrace.NodeTrace::kind).toList());
        assertNull(s.sub().violations());
        assertNum("3", t.finalValues().get("Y"));
    }

    @Test
    void 기록_실행에서_하위_세트가_멈추면_SET_노드가_ERROR_이고_sub_에_멈춘_룰이_있다() {
        lookup.addSet(inuse("E", line(rule("r1", "R_ERR"))));
        RuleSetDefinition p = inuse("P", line(set("s1", "E")));
        lookup.addSet(p);

        RunTrace t = engine.traceSet(p, rec("X", "1"), SampleRules.EVAL_TS);

        RunTrace.NodeTrace s = t.nodes().get(t.nodes().size() - 1);
        assertEquals(List.of("s1", RunTrace.NodeStatus.ERROR), List.of(s.nodeId(), s.status()));
        assertEquals(List.of("s1"), t.violations().get(0).setPath());
        RunTrace.NodeTrace last = s.sub().nodes().get(s.sub().nodes().size() - 1);
        assertEquals(List.of("r1", RunTrace.NodeStatus.ERROR), List.of(last.nodeId(), last.status()));
        assertEquals(List.of(), s.sub().violations().get(0).setPath(), "하위 기록 안의 위반은 하위 세트 기준 경로");
    }
}
