package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.inuse;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.labeledCatch;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.junit.jupiter.api.Test;

/**
 * 하위 세트 spec §4 — 하위 세트의 처리되지 않은 위반·SUBSET_ENDED·caught 전달·처리 갈래 안 SET 노드(Review Focus 3·6). 흐름은 새 형식(D-136)이다 —
 * 처리 갈래는 돌아오는 MERGE 없이 정상 경로 위 노드로 바로 돌아온다.
 */
class SubsetCatchTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_Q", "Q2", "Q + 1", "Q"), calc("R_ERR", "E", "X / 0", "X"), calc("R_9", "NINE", "9"), calc("R_K", "K", "1"),
            calc("R_YES", "YES", "1"), calc("R_NO", "NO", "1"), calc("K_X", "X2", "Y * 10", "Y"), calc("K_Z", "Z", "X2 + 1", "X2"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(String setId, Map<String, Object> record) {
        return engine.evaluateSet(setId, record, SampleRules.EVAL_TS);
    }

    /** start → s1(setId) → j(빈 단계) → end, c1(s1, kind) → if9 [cond → ry(YES)] [그 외 → rn(NO)] → j. */
    private static FlowDefinition guardedCall(String setId, String kind, String cond) {
        return flow(List.of(start(), set("s1", setId), task("j"), catchNode("c1", "s1", kind), ifNode("if9"), rule("ry", "R_YES"),
                        rule("rn", "R_NO"), end()),
                List.of(e("e1", "start", "s1"), e("e2", "s1", "j"), e("e3", "j", "end"), e("e4", "c1", "if9"), br("b9", "if9", "ry", 1, cond),
                        other("o9", "if9", "rn"), e("e5", "ry", "j"), e("e6", "rn", "j")));
    }

    @Test
    void INPUT_ERROR_를_받는_SET_노드는_하위_입력을_사전_검사에서_빼고_하위_위반을_받는다() {
        lookup.addSet(inuse("SQ", line(rule("q", "R_Q"))));
        lookup.addSet(inuse("P", guardedCall("SQ", "INPUT_ERROR", "CATCH_SET == \"SQ\" && CATCH_RULE == \"R_Q\" && CATCH_CODE == \"MISSING_KEY\"")));

        RuleSetResult r = run("P", rec());

        assertTrue(r.finalValues().containsKey("YES"), "CATCH_SET·CATCH_RULE·CATCH_CODE 가 하위 세트 위반을 가리킨다: " + r.finalValues());
        var c = r.caught().get(0);
        assertEquals(List.of("s1", "R_Q", "c1", CatchKind.INPUT_ERROR, "MISSING_KEY", List.of()),
                List.of(c.ruleNodeId(), c.ruleId(), c.catchNodeId(), c.kind(), c.code(), c.setPath()));
        assertEquals(1, r.caught().size());
        assertEquals(List.of(), r.calls(), "하위 세트가 멈췄으면 calls 에 넣지 않는다");
        assertEquals(List.of("start:null", "s1:null", "c1:null", "if9:null", "ry:0", "j:null", "end:null"),
                r.path().stream().map(p -> p.nodeId() + ":" + (p.kind() == NodeKind.SET ? p.callIndex() : p.stepIndex())).toList());
    }

    @Test
    void 받지_않는_종류의_하위_위반은_setPath_를_붙여_다시_던진다() {
        lookup.addSet(inuse("E", line(rule("r1", "R_ERR"))));
        lookup.addSet(inuse("P", guardedCall("E", "HIT_CONFLICT", "1 == 1")));

        EngineEvaluationException e = assertThrows(EngineEvaluationException.class, () -> run("P", rec("X", "1")));
        assertEquals(List.of(Code.EVALUATION_ERROR, "R_ERR", List.of("s1")),
                List.of(e.violations().get(0).code(), e.violations().get(0).ruleId(), e.violations().get(0).setPath()));
    }

    @Test
    void 받은_하위_위반의_기록은_SET_노드_CAUGHT_와_CATCH_노드다() {
        lookup.addSet(inuse("E", line(rule("r1", "R_ERR"))));
        RuleSetDefinition p = inuse("P", guardedCall("E", "EVAL_ERROR", "CATCH_SET == \"E\" && CATCH_KIND == \"EVAL_ERROR\""));
        lookup.addSet(p);

        RunTrace t = engine.traceSet(p, rec("X", "1"), SampleRules.EVAL_TS);

        assertNull(t.violations());
        assertTrue(t.finalValues().containsKey("YES"));
        RunTrace.NodeTrace s1 = t.nodes().get(1);
        assertEquals(List.of("s1", NodeKind.SET, RunTrace.NodeStatus.CAUGHT, List.of("s1")),
                List.of(s1.nodeId(), s1.kind(), s1.status(), s1.violations().get(0).setPath()));
        assertNull(s1.outputs());
        assertEquals(RunTrace.NodeStatus.ERROR, s1.sub().nodes().get(s1.sub().nodes().size() - 1).status());
        RunTrace.NodeTrace c1 = t.nodes().get(2);
        assertEquals(List.of("c1", NodeKind.CATCH, "R_ERR", CatchKind.EVAL_ERROR), List.of(c1.nodeId(), c1.kind(), c1.ruleId(), c1.catchKind()));
    }

    /** 하위 세트 END1: start → r1(R_ERR) → end, c1(attachTo r1, EVAL_ERROR, "계산 불가") → end — X 가 있으면 늘 처리 갈래로 끝난다. */
    private void endingChild() {
        lookup.addSet(inuse("END1", flow(List.of(start(), rule("r1", "R_ERR"), labeledCatch("c1", "r1", "계산 불가", "EVAL_ERROR"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "end")))));
    }

    @Test
    void SUBSET_ENDED_를_받는_노드가_없으면_하위_세트의_끝냄은_정상_완료다() {
        endingChild();
        lookup.addSet(inuse("P", line(set("s1", "END1"), rule("k", "R_K"))));

        RuleSetResult r = run("P", rec("X", "1"));

        assertNum("1", r.finalValues().get("K"));
        assertEquals("c1", r.calls().get(0).result().endedBy());
        assertNull(r.endedBy(), "endedBy 는 그 세트 자신의 받는 노드만");
        assertEquals(List.of("c1", List.of("s1")), List.of(r.caught().get(0).catchNodeId(), r.caught().get(0).setPath()));
    }

    @Test
    void SUBSET_ENDED_를_받으면_출력을_넘기지_않고_처리_갈래로_간다() {
        endingChild();
        lookup.addSet(inuse("P", guardedCall("END1", "SUBSET_ENDED",
                "CATCH_CODE == \"SUBSET_ENDED\" && CATCH_RULE == \"R_ERR\" && CATCH_MSG == \"계산 불가\" && CATCH_SET == \"END1\"")));

        RuleSetResult r = run("P", rec("X", "1"));

        assertTrue(r.finalValues().containsKey("YES"), r.finalValues().toString());
        assertEquals(2, r.caught().size());
        assertEquals(List.of("c1", List.of("s1")), List.of(r.caught().get(0).catchNodeId(), r.caught().get(0).setPath()), "하위 caught 가 먼저");
        var mine = r.caught().get(1);
        assertEquals(List.of("s1", "R_ERR", "c1", CatchKind.SUBSET_ENDED, "SUBSET_ENDED", "계산 불가", List.of()),
                List.of(mine.ruleNodeId(), mine.ruleId(), mine.catchNodeId(), mine.kind(), mine.code(), mine.message(), mine.setPath()));
        assertEquals(0, r.path().stream().filter(p -> "s1".equals(p.nodeId())).findFirst().orElseThrow().callIndex(), "끝까지 간 하위 세트는 calls 에 남는다");
        assertEquals("c1", r.calls().get(0).result().endedBy());
        assertNull(r.endedBy(), "처리 갈래가 돌아왔으므로 부모는 끝내지 않았다");
    }

    @Test
    void 하위_세트가_끝내는_IF_갈래로_끝나면_SUBSET_ENDED_가_아니라_정상_완료다() {
        // IFE: start → if1 [X > 0 → k(K) → END] [그 외 → n(NINE) → END] — 끝내는 IF 갈래로 끝나 endedBy 가 없다(J-D17).
        lookup.addSet(inuse("IFE", flow(List.of(start(), ifNode("if1"), rule("k", "R_K"), rule("n", "R_9"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "k", 1, "X > 0"), e("ek", "k", "end"), other("bo", "if1", "n"), e("en", "n", "end")))));
        lookup.addSet(inuse("P", guardedCall("IFE", "SUBSET_ENDED", "1 == 1")));

        RuleSetResult r = run("P", rec("X", "1"));

        assertNum("1", r.finalValues().get("K"));
        assertFalse(r.finalValues().containsKey("YES"));
        assertFalse(r.finalValues().containsKey("NO"));
        assertEquals(List.of(), r.caught());
        assertNull(r.calls().get(0).result().endedBy());
    }

    @Test
    void 처리_갈래_안의_SET_노드는_CATCH_이름을_넘기지_않고_하위_받는_노드는_새_CATCH_를_쓰고_돌아오면_부모_CATCH_가_그대로다() {
        // K2: start → x(K_X) → z(K_Z) → q(R_Q) → end, cq(q, INPUT_ERROR) → if7 [CATCH_SET == "K2" && CATCH_CODE == "MISSING_KEY" → n9(NINE)]
        //     [그 외 → n0(NO)] → j7(빈 단계) → end — 처리 갈래로 끝난다.
        lookup.addSet(inuse("K2", flow(List.of(start(), rule("x", "K_X"), rule("z", "K_Z"), rule("q", "R_Q"), catchNode("cq", "q", "INPUT_ERROR"),
                        ifNode("if7"), rule("n9", "R_9"), rule("n0", "R_NO"), task("j7"), end()),
                List.of(e("e1", "start", "x"), e("e2", "x", "z"), e("e3", "z", "q"), e("e4", "q", "end"), e("e5", "cq", "if7"),
                        br("b7", "if7", "n9", 1, "CATCH_SET == \"K2\" && CATCH_CODE == \"MISSING_KEY\" && CATCH_KIND == \"INPUT_ERROR\""),
                        other("o7", "if7", "n0"), e("e6", "n9", "j7"), e("e7", "n0", "j7"), e("e8", "j7", "end")))));
        // P: start → r1(R_ERR) → j(R_K) → end, c1(r1, EVAL_ERROR) → s2(K2) → if8 [부모 CATCH_* 가 그대로 → ry(YES)] [그 외 → rn(NO)] → j
        RuleSetDefinition p = inuse("P", flow(List.of(start(), rule("r1", "R_ERR"), rule("j", "R_K"), catchNode("c1", "r1", "EVAL_ERROR"),
                        set("s2", "K2"), ifNode("if8"), rule("ry", "R_YES"), rule("rn", "R_NO"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "j"), e("e3", "j", "end"), e("e4", "c1", "s2"), e("e5", "s2", "if8"),
                        br("b8", "if8", "ry", 1, "CATCH_SET == \"P\" && CATCH_CODE == \"EVALUATION_ERROR\" && CATCH_RULE == \"R_ERR\""),
                        other("o8", "if8", "rn"), e("e6", "ry", "j"), e("e7", "rn", "j"))));
        lookup.addSet(p);

        RuleSetResult r = run("P", rec("X", "1", "Y", "1"));
        assertNum("11", r.finalValues().get("Z"));
        assertNum("9", r.finalValues().get("NINE")); // 하위 받는 노드의 CATCH_SET·CATCH_CODE 는 하위 세트 것이다
        assertTrue(r.finalValues().containsKey("YES"), "돌아온 뒤 부모 처리 갈래의 CATCH_* 는 그대로다: " + r.finalValues());
        assertNum("1", r.finalValues().get("K")); // 처리 갈래는 돌아오는 자리 j 로 돌아온다
        assertEquals("cq", r.calls().get(0).result().endedBy());

        RunTrace t = engine.traceSet(p, rec("X", "1", "Y", "1"), SampleRules.EVAL_TS);
        RunTrace.NodeTrace s2 = t.nodes().stream().filter(n -> "s2".equals(n.nodeId())).findFirst().orElseThrow();
        assertFalse(s2.sub().input().keySet().stream().anyMatch(k -> k.startsWith("CATCH_")), s2.sub().input().keySet().toString());
        assertFalse(s2.reads().keySet().stream().anyMatch(k -> k.startsWith("CATCH_")));
    }
}
