package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.parFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 4단계 spec §2.2 — 고친 값을 k 번째 노드 직전에 그 범위 ctx 에 넣고 처음부터 다시 실행한다(퍼짐 규칙·안전장치). */
class RuleSetTraceEditTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"), calc("R_C", "C", "X + 3", "X"),
            calc("R_AB", "AB", "A + 1", "A"), calc("R_DIV", "D", "10 / X", "X"), calc("R_Y", "YY", "Y + 1", "Y"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RunTrace trace(FlowDefinition f, Map<String, Object> record, TraceEdit... edits) {
        return engine.traceSet(new RuleSetDefinition("DRAFT", null, null, null, List.of(), SetStatus.INUSE, f), record, SampleRules.EVAL_TS, List.of(edits));
    }

    private static TraceEdit edit(int beforeSeq, String nodeId, Object... kv) {
        return new TraceEdit(beforeSeq, nodeId, rec(kv));
    }

    private static List<String> kinds(RunTrace t) {
        return t.nodes().stream().map(n -> n.seq() + ":" + n.nodeId() + ":" + n.kind() + ":" + n.status()).toList();
    }

    private static List<String> v(List<Violation> vs) {
        return vs.stream().map(x -> x.stage() + "/" + x.code() + "/" + x.ruleId() + "/" + x.rowId() + "/" + x.name()).toList();
    }

    /** start → a(R_A) → ab(R_AB: A + 1) → end. 순번 1 start, 2 a, 3 ab, 4 end. */
    private static FlowDefinition chain() {
        return flow(List.of(start(), rule("a", "R_A"), rule("ab", "R_AB"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "ab"), e("e3", "ab", "end")));
    }

    /** start → p1 [p1a → a(R_A) → ab(R_AB)] [p1b → b(R_B)] → pm → end. 순번 1 start, 2 p1, 3 a, 4 ab, 5 b, 6 pm, 7 end. */
    private static FlowDefinition parChain() {
        return flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("ab", "R_AB"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), e("e1", "a", "ab"), e("e2", "ab", "pm"),
                        pe("p1b", "p1", "b", 2), e("e3", "b", "pm"), e("ee", "pm", "end")));
    }

    @Test
    void 최상위에서_앞_룰_결과를_고치면_뒤_룰이_읽고_finalValues_도_바뀌며_받은_edits_를_되돌려_준다() {
        TraceEdit ed = edit(3, "ab", "A", new BigDecimal("10"));
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), ed);
        assertNull(t.violations());
        assertNum("10", t.nodes().get(2).reads().get("A"));
        assertNum("10", t.finalValues().get("A"));
        assertNum("11", t.finalValues().get("AB"));
        assertEquals(List.of(ed), t.edits());
    }

    @Test
    void 입력_변수를_고치면_뒤_룰이_새_값을_읽고_입력은_finalValues_에_들지_않는다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(2, "a", "X", new BigDecimal("5")));
        assertNum("6", t.finalValues().get("A"));
        assertNum("7", t.finalValues().get("AB"));
        assertFalse(t.finalValues().containsKey("X"));
        assertEquals(Map.of("X", BigDecimal.ONE), t.input());
    }

    @Test
    void IF_직전에_고치면_고른_갈래가_바뀐다() {
        // ifFlow: b1 "X > 10" → a, b2 "X > 0" → b, 그 외 → c. X=20 이면 b1 인데 -1 로 고치면 그 외.
        RunTrace t = trace(ifFlow(), rec("X", new BigDecimal("20")), edit(2, "if1", "X", new BigDecimal("-1")));
        assertEquals(List.of("1:start:START:OK", "2:if1:IF:OK", "3:c:RULE:OK", "4:m1:MERGE:OK", "5:end:END:OK"), kinds(t));
        assertEquals("bo", t.nodes().get(1).chosenEdgeId());
        assertNum("2", t.finalValues().get("C"));
    }

    @Test
    void 병렬_갈래_안에서_입력을_고치면_그_갈래_안에서만_보이고_합류_뒤에는_원래_값이다() {
        // parFlow: start → p1 [a(R_A)] [b(R_B)] → pm → c(R_C) → end. 순번 1 start, 2 p1, 3 a, 4 b, 5 pm, 6 c, 7 end.
        RunTrace t = trace(parFlow(), rec("X", BigDecimal.ONE), edit(4, "b", "X", new BigDecimal("100")));
        assertNum("2", t.finalValues().get("A"));
        assertNum("102", t.finalValues().get("B"));
        assertNum("1", t.nodes().get(5).reads().get("X"));
        assertNum("4", t.finalValues().get("C"));
    }

    @Test
    void 병렬_갈래_안에서_그_갈래가_만든_결과를_고치면_합류까지_간다() {
        RunTrace t = trace(parChain(), rec("X", BigDecimal.ONE), edit(4, "ab", "A", new BigDecimal("50")));
        assertNull(t.violations());
        assertEquals(List.of("A", "AB", "B"), t.nodes().get(5).merged());
        assertNum("50", t.finalValues().get("A"));
        assertNum("51", t.finalValues().get("AB"));
        assertNum("3", t.finalValues().get("B"));
    }

    @Test
    void 합류_자리에서_고치면_갈래를_합친_값을_덮는다() {
        RunTrace t = trace(parChain(), rec("X", BigDecimal.ONE), edit(6, "pm", "A", new BigDecimal("7")));
        assertNum("7", t.finalValues().get("A"));
        assertNum("3", t.finalValues().get("AB"));
        assertNum("3", t.finalValues().get("B"));
    }

    @Test
    void ERROR_노드_직전에_고치면_오류를_비켜_간다() {
        FlowDefinition f = flow(List.of(start(), rule("d", "R_DIV"), end()), List.of(e("e1", "start", "d"), e("e2", "d", "end")));
        assertEquals(List.of("1:start:START:OK", "2:d:RULE:ERROR"), kinds(trace(f, rec("X", BigDecimal.ZERO))));
        RunTrace t = trace(f, rec("X", BigDecimal.ZERO), edit(2, "d", "X", new BigDecimal("2")));
        assertNull(t.violations());
        assertNum("5", t.finalValues().get("D"));
    }

    @Test
    void 자리의_노드_ID_가_다르면_EDIT_POINT_MISMATCH_로_그_노드에서_멈춘다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(2, "zzz", "A", new BigDecimal("10")));
        assertEquals(List.of("1:start:START:OK", "2:a:RULE:ERROR"), kinds(t));
        assertEquals(List.of("INPUT_CHECK/EDIT_POINT_MISMATCH/null/null/zzz"), v(t.violations()));
        assertEquals("R_A", t.nodes().get(1).ruleId());
        assertEquals(t.nodes().get(1).violations(), t.violations());
        assertEquals(Map.of(), t.finalValues());
    }

    @Test
    void 정상_완료인데_안_쓰인_고친_값이_남으면_ERROR_노드_없이_EDIT_POINT_MISMATCH() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(9, "end", "A", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:a:RULE:OK", "3:ab:RULE:OK", "4:end:END:OK"), kinds(t));
        assertEquals(List.of("INPUT_CHECK/EDIT_POINT_MISMATCH/null/null/end"), v(t.violations()));
        assertNum("2", t.finalValues().get("A"));
        assertNum("3", t.finalValues().get("AB"));
    }

    @Test
    void 실행_오류로_멈추면_안_쓰인_고친_값은_보지_않는다() {
        FlowDefinition f = flow(List.of(start(), rule("d", "R_DIV"), end()), List.of(e("e1", "start", "d"), e("e2", "d", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ZERO), edit(3, "end", "X", BigDecimal.ONE));
        assertEquals(List.of("1:start:START:OK", "2:d:RULE:ERROR"), kinds(t));
        assertTrue(t.violations().stream().noneMatch(x -> x.code() == Code.EDIT_POINT_MISMATCH), v(t.violations()).toString());
    }

    @Test
    void null_은_비우기이고_키는_남는다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(4, "end", "A", null));
        assertTrue(t.finalValues().containsKey("A"));
        assertNull(t.finalValues().get("A"));
        assertNum("3", t.finalValues().get("AB"));
    }

    @Test
    void 없던_이름을_더하면_뒤쪽_갈래_진입_키_검사가_고친_ctx_로_통과한다() {
        // start → if1 [b1 "X > 0" → y(R_Y: Y + 1)] [그 외 → c] → m1 → end. Y 가 없으면 IF 진입 키 검사로 멈춘다(RuleSetTraceTest).
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("y", "R_Y"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "y", 1, "X > 0"), other("bo", "if1", "c"),
                        e("ey", "y", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE), edit(2, "if1", "Y", new BigDecimal("4")));
        assertNull(t.violations());
        assertNum("5", t.finalValues().get("YY"));
    }

    @Test
    void made_는_대소문자를_무시해_찾고_키_표기는_고친_값_표기로_바뀐다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(4, "end", "a", new BigDecimal("10")));
        assertNum("10", t.finalValues().get("a"));
        assertFalse(t.finalValues().containsKey("A"));
    }

    @Test
    void 빈_단계_자리에서도_고친다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE), edit(2, "t1", "X", new BigDecimal("5")));
        assertNull(t.violations());
        assertNum("6", t.finalValues().get("A"));
    }

    @Test
    void 구조_오류로_실행_전에_멈춘_기록에도_받은_edits_를_되돌려_준다() {
        FlowDefinition noEnd = flow(List.of(start(), rule("a", "R_A")), List.of(e("e1", "start", "a")));
        TraceEdit ed = edit(2, "a", "X", BigDecimal.ONE);
        RunTrace t = trace(noEnd, rec("X", BigDecimal.ONE), ed);
        assertEquals(List.of(), t.nodes());
        assertEquals(Code.FLOW_INVALID, t.violations().get(0).code());
        assertEquals(List.of(ed), t.edits());
    }

    @Test
    void 고친_값이_없으면_edits_는_null_이다() {
        assertNull(trace(chain(), rec("X", BigDecimal.ONE)).edits());
    }

    @Test
    void 고친_값의_목록_자체가_null_이면_거부한다() {
        RuleSetDefinition set = new RuleSetDefinition("DRAFT", null, null, null, List.of(), SetStatus.INUSE, chain());
        assertThrows(NullPointerException.class, () -> engine.traceSet(set, rec("X", BigDecimal.ONE), SampleRules.EVAL_TS, null));
    }

    // ── 리뷰 보완: PARALLEL 자리·made 대소문자·같은 순번·START·IF 갈래 ──

    @Test
    void 병렬_노드_직전에_고치면_모든_갈래가_고친_값을_보고_합류_뒤에도_이어진다() {
        // parFlow 순번: 1 start, 2 p1, 3 a, 4 b, 5 pm, 6 c, 7 end.
        RunTrace t = trace(parFlow(), rec("X", BigDecimal.ONE), edit(2, "p1", "X", new BigDecimal("100")));
        assertNull(t.violations());
        assertNum("101", t.finalValues().get("A"));
        assertNum("102", t.finalValues().get("B"));
        assertNum("103", t.finalValues().get("C"));
        assertNum("100", t.nodes().get(5).reads().get("X"));
        assertFalse(t.finalValues().containsKey("X"));
    }

    @Test
    void 고친_표기_a_뒤에_같은_이름_A_를_룰이_만들어도_finalValues_에는_키가_하나다() {
        FlowDefinition f = flow(List.of(start(), rule("a", "R_A"), rule("a2", "R_A"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "a2"), e("e3", "a2", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE), edit(3, "a2", "a", new BigDecimal("10")));
        assertEquals(1, t.finalValues().size(), t.finalValues().toString());
        assertNum("2", t.finalValues().get("A"));
    }

    @Test
    void 병렬_합류에서도_고친_표기와_갈래가_만든_같은_이름이_키_하나로_합쳐진다() {
        // 순번: 1 start, 2 a, 3 p1, 4 a2, 5 b, 6 pm, 7 end.
        FlowDefinition f = flow(List.of(start(), rule("a", "R_A"), par("p1"), rule("a2", "R_A"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "a"), e("e1", "a", "p1"), pe("p1a", "p1", "a2", 1), pe("p1b", "p1", "b", 2),
                        e("ea", "a2", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE), edit(3, "p1", "a", new BigDecimal("10")));
        assertNull(t.violations());
        assertEquals(2, t.finalValues().size(), t.finalValues().toString());
        assertNum("2", t.finalValues().get("A"));
        assertNum("3", t.finalValues().get("B"));
    }

    @Test
    void 같은_순번의_고친_값이_여럿이면_목록_순서로_적용되어_이름마다_뒤가_이긴다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE),
                edit(2, "a", "X", new BigDecimal("5"), "Y", BigDecimal.ONE),
                edit(2, "a", "X", new BigDecimal("7")));
        assertNull(t.violations());
        assertNum("8", t.finalValues().get("A"));
        assertNum("9", t.finalValues().get("AB"));
        assertFalse(t.finalValues().containsKey("Y"));
    }

    @Test
    void START_자리_순번_1_에서도_고친다() {
        RunTrace t = trace(chain(), rec("X", BigDecimal.ONE), edit(1, "start", "X", new BigDecimal("5")));
        assertNull(t.violations());
        assertNum("6", t.finalValues().get("A"));
    }

    @Test
    void IF_갈래_안_노드에서_고친_결과는_최상위_finalValues_에_반영된다() {
        // 순번: 1 start, 2 a, 3 if1, 4 t1, 5 m1, 6 end.
        FlowDefinition f = flow(List.of(start(), rule("a", "R_A"), ifNode("if1"), task("t1"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "a"), e("e1", "a", "if1"), br("b1", "if1", "t1", 1, "X > 0"), other("bo", "if1", "c"),
                        e("et", "t1", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE), edit(4, "t1", "A", new BigDecimal("50")));
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:a:RULE:OK", "3:if1:IF:OK", "4:t1:TASK:OK", "5:m1:MERGE:OK", "6:end:END:OK"), kinds(t));
        assertNum("50", t.finalValues().get("A"));
    }
}
