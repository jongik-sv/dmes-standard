package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.condVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.contract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.decision;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.derive;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.expr;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.op;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.resultVar;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.row;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rowContract;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.val;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vt;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.vts;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.CaughtException;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.TraceEdit;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 받는 노드 spec §4·§10 — 받기·처리 갈래·돌아옴·끝냄·CATCH_*·caught·endedBy·입력 키 사전 검사. evaluateSet 과 traceSet 을 함께 본다. */
class RuleSetCatchTest {

    /** X(NUMBER) > 9 이면 G="HI", 아니면 맞는 행 없음(기본 행 없음 → 결과 없음). */
    static RuleDefinition grade(String id, HitPolicy policy) {
        return CellTextGenerator.withTexts(decision(id, 1, policy, FlowRules.FROM,
                List.of(condVar(1, DispType.ONE, "X", DataType.NUMBER, 1), resultVar(2, DispType.VALUE, "G", DataType.STRING, 2)),
                contract(vts("X", DataType.NUMBER)),
                row(1, 1, 1, op("GT", "9"), 2, val("HI")),
                row(2, 2, 1, op("GT", "99"), 2, val("TOP"))), d -> null);
    }

    /** {@code result = input}(STRING) — 처리 갈래가 CATCH_* 를 읽는지 본다. */
    static RuleDefinition echo(String id, String result, String input) {
        return CellTextGenerator.withTexts(derive(id, 1, FlowRules.FROM,
                List.of(resultVar(1, DispType.EXPRESSION, result, DataType.STRING, 1)),
                contract(List.of(), rowContract(1, List.of(vt(input, DataType.STRING)))),
                row(1, 1, 1, expr(input))), d -> null);
    }

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            grade("R_G", HitPolicy.FIRST), grade("R_U", HitPolicy.UNIQUE), calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"),
            calc("R_ERR", "E", "X / 0", "X"), calc("R_FILL", "G", "0"), calc("R_AFTER", "Z", "X * 2", "X"),
            echo("R_CODE", "CODE", "CATCH_CODE"), echo("R_KIND", "KIND", "CATCH_KIND"));
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

    /** start → r1(ruleId) → mr → after(R_AFTER) → end. c1(kinds) → h(handler) → mr. */
    static FlowDefinition returning(String ruleId, String handler, String... kinds) {
        return flow(List.of(start(), rule("r1", ruleId), catchNode("c1", "r1", kinds), rule("h", handler), guardMerge("mr", "r1"),
                        rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "after"),
                        e("e6", "after", "end")));
    }

    // ── 돌아옴 ──

    @Test
    void 결과_없음을_받아_처리_갈래가_기본값을_채우고_돌아온다() {
        RuleSetResult r = run(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("5")));
        assertNum("0", r.finalValues().get("G"));
        assertNum("10", r.finalValues().get("Z"));
        assertEquals(List.of(new CaughtException("r1", "R_G", "c1", CatchKind.NO_RESULT, "NO_RESULT", "맞는 행과 기본 행이 없다")), r.caught());
        assertNull(r.endedBy());
        assertEquals(List.of("start:START:null", "r1:RULE:null", "c1:CATCH:null", "h:RULE:0", "mr:MERGE:null", "after:RULE:1", "end:END:null"), path(r));
        assertEquals(List.of("R_FILL", "R_AFTER"), r.steps().stream().map(RuleResult::ruleId).toList());
    }

    @Test
    void 결과가_있으면_받는_노드_없는_룰과_같고_정상_갈래로_간다() {
        RuleSetResult r = run(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("50")));
        assertEquals("HI", r.finalValues().get("G"));
        assertEquals(List.of(), r.caught());
        assertEquals(List.of("start:START:null", "r1:RULE:0", "mr:MERGE:null", "after:RULE:1", "end:END:null"), path(r));
        RunTrace t = trace(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("50")));
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:OK", "3:mr:MERGE:OK", "4:after:RULE:OK", "5:end:END:OK"), kinds(t));
        assertEquals("r1", t.nodes().get(2).splitId());
        assertNull(t.nodes().get(2).merged());
    }

    @Test
    void 받는_노드_없으면_결과_없음은_NULL_로_진행한다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "after"), e("e3", "after", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertTrue(r.finalValues().containsKey("G"));
        assertNull(r.finalValues().get("G"));
        assertEquals(List.of(), r.caught());
    }

    @Test
    void 받는_노드_없으면_실패는_세트를_멈춘다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), end()), List.of(e("e1", "start", "r1"), e("e2", "r1", "end")));
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class, () -> run(f, rec("X", BigDecimal.ONE)));
        assertEquals(Code.EVALUATION_ERROR, ex.violations().get(0).code());
    }

    // ── 종류별 받기 ──

    @Test
    void 계산_오류는_EVAL_ERROR_로_받는다() {
        RuleSetResult r = run(returning("R_ERR", "R_FILL", "EVAL_ERROR"), rec("X", BigDecimal.ONE));
        CaughtException c = r.caught().get(0);
        assertEquals(CatchKind.EVAL_ERROR, c.kind());
        assertEquals("EVALUATION_ERROR", c.code());
        assertFalse(r.finalValues().containsKey("E"));
    }

    @Test
    void 판정_충돌은_HIT_CONFLICT_로_받는다() {
        RuleSetResult r = run(returning("R_U", "R_FILL", "HIT_CONFLICT"), rec("X", new BigDecimal("500")));
        assertEquals(CatchKind.HIT_CONFLICT, r.caught().get(0).kind());
        assertEquals("UNIQUE_MULTIPLE_HITS", r.caught().get(0).code());
    }

    @Test
    void 타입_변환_오류는_INPUT_ERROR_로_받는다() {
        // 뒤 R_AFTER 도 X 를 숫자로 바꾸므로 뒤 룰 없는 흐름으로 본다.
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "INPUT_ERROR"), rule("h", "R_FILL"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        RuleSetResult r = run(f, rec("X", "abc"));
        assertEquals(CatchKind.INPUT_ERROR, r.caught().get(0).kind());
        assertEquals("TYPE_CONVERSION", r.caught().get(0).code());
    }

    @Test
    void INPUT_ERROR_를_받는_룰의_입력은_사전_검사에서_빠지고_실행_직전에_MISSING_KEY_로_받는다() {
        // R_A 는 X 를 읽는다. 레코드에 X 가 없다. 받는 노드 없이는 세트 시작 때 SET_CHECK/MISSING_KEY 로 멈춘다.
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "INPUT_ERROR"), rule("h", "R_FILL"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        RuleSetResult r = run(f, rec("Y", BigDecimal.ONE));
        assertEquals(CatchKind.INPUT_ERROR, r.caught().get(0).kind());
        assertEquals("MISSING_KEY", r.caught().get(0).code());
        assertNum("0", r.finalValues().get("G"));
        // 같은 이름(X)을 받는 노드 없는 다른 룰도 반드시 읽으면 사전 검사에 남는다.
        FlowDefinition both = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "INPUT_ERROR"), rule("h", "R_FILL"), guardMerge("mr", "r1"),
                        rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "r2"), e("e6", "r2", "end")));
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class, () -> run(both, rec("Y", BigDecimal.ONE)));
        assertEquals("SET_CHECK/MISSING_KEY/R_B", ex.violations().get(0).stage() + "/" + ex.violations().get(0).code() + "/" + ex.violations().get(0).ruleId());
    }

    @Test
    void 받지_않는_종류는_받는_노드가_있어도_멈춘다() {
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class,
                () -> run(returning("R_U", "R_FILL", "EVAL_ERROR"), rec("X", new BigDecimal("500"))));
        assertEquals(Code.UNIQUE_MULTIPLE_HITS, ex.violations().get(0).code());
        FlowDefinition missing = returning("R_NONE", "R_FILL", "INPUT_ERROR", "EVAL_ERROR");
        EngineEvaluationException nf = assertThrows(EngineEvaluationException.class, () -> run(missing, rec("X", BigDecimal.ONE)));
        assertEquals(Code.RULE_NOT_FOUND, nf.violations().get(0).code());
    }

    @Test
    void 한_룰에_받는_노드_둘이면_종류로_고른다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_FILL"),
                        catchNode("c2", "r1", "INPUT_ERROR", "EVAL_ERROR"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "c2", "end"), e("e6", "mr", "end")));
        RuleSetResult noResult = run(f, rec("X", new BigDecimal("5")));
        assertEquals("c1", noResult.caught().get(0).catchNodeId());
        assertNull(noResult.endedBy());
        RuleSetResult bad = run(f, rec("X", "abc"));
        assertEquals("c2", bad.caught().get(0).catchNodeId());
        assertEquals("c2", bad.endedBy());
    }

    // ── 끝냄 ──

    @Test
    void 처리_갈래가_END_에_닿으면_세트를_끝내고_endedBy_를_남긴다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h", "R_FILL"), rule("after", "R_AFTER"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "after"), e("e3", "c1", "h"), e("e4", "h", "end"), e("e5", "after", "end")));
        RuleSetResult r = run(f, rec("X", BigDecimal.ONE));
        assertEquals("c1", r.endedBy());
        assertEquals(List.of("start:START:null", "r1:RULE:null", "c1:CATCH:null", "h:RULE:0", "end:END:null"), path(r));
        assertFalse(r.finalValues().containsKey("Z"));
        RunTrace t = trace(f, rec("X", BigDecimal.ONE));
        assertEquals("c1", t.endedBy());
        assertNull(t.violations());
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:CAUGHT", "3:c1:CATCH:OK", "4:h:RULE:OK", "5:end:END:OK"), kinds(t));
    }

    @Test
    void 병렬_갈래_안에서_끝내면_남은_형제는_돌지_않고_finalValues_는_끝난_형제와_지금_갈래다() {
        // start → p1 [1 → a(R_A)] [2 → g(R_G, c1 NO_RESULT → f(R_FILL) → end)] [3 → b(R_B)] → pm → end
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("g", "R_G"), catchNode("c1", "g", "NO_RESULT"), rule("f", "R_FILL"),
                        rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1g", "p1", "g", 2), pe("p1b", "p1", "b", 3), e("ea", "a", "pm"),
                        e("eg", "g", "pm"), e("ec", "c1", "f"), e("ef", "f", "end"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("c1", r.endedBy());
        assertEquals(List.of("A", "G"), List.copyOf(r.finalValues().keySet()));
        assertNum("6", r.finalValues().get("A"));
        assertNum("0", r.finalValues().get("G"));
        assertEquals(List.of("R_A", "R_FILL"), r.steps().stream().map(RuleResult::ruleId).toList());
        RunTrace t = trace(f, rec("X", new BigDecimal("5")));
        assertEquals(r.path().stream().map(RuleSetResult.PathStep::nodeId).toList(), t.nodes().stream().map(NodeTrace::nodeId).toList());
        assertEquals(r.finalValues().keySet(), t.finalValues().keySet());
    }

    // ── ctx ──

    @Test
    void 처리_갈래는_룰_직전_ctx_를_읽는다() {
        // R_G 는 X 를 NUMBER 로 바꿔 ctx 에 넣는다. 받으면 처리 갈래는 바꾸기 전 값("5" 문자열)을 읽어야 한다.
        RunTrace t = trace(returning("R_G", "R_A", "NO_RESULT"), rec("X", "5"));
        NodeTrace h = t.nodes().stream().filter(n -> n.nodeId().equals("h")).findFirst().orElseThrow();
        assertInstanceOf(String.class, h.reads().get("X"));
        assertEquals("5", h.reads().get("X"));
    }

    @Test
    void CATCH_값은_처리_갈래에서만_있고_finalValues_에_없다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_CODE"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h"), e("e4", "h", "mr"), e("e5", "mr", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("NO_RESULT", r.finalValues().get("CODE"));
        for (String k : r.finalValues().keySet()) {
            assertFalse(k.startsWith("CATCH_"), k);
        }
    }

    @Test
    void 중첩_처리_갈래는_안쪽_합류_뒤_바깥_CATCH_값을_되찾는다() {
        // r1(R_ERR) c1 EVAL_ERROR → h1(R_G) [c9 NO_RESULT → f(R_FILL) → mi] → mi → k(R_CODE) → mr → end
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_ERR"), catchNode("c1", "r1", "EVAL_ERROR"), rule("h1", "R_G"), catchNode("c9", "h1", "NO_RESULT"),
                        rule("f", "R_FILL"), guardMerge("mi", "h1"), rule("k", "R_CODE"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "h1"), e("e4", "h1", "mi"), e("e5", "c9", "f"), e("e6", "f", "mi"),
                        e("e7", "mi", "k"), e("e8", "k", "mr"), e("e9", "mr", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("5")));
        assertEquals("EVALUATION_ERROR", r.finalValues().get("CODE"));
        assertEquals(List.of("c1", "c9"), r.caught().stream().map(CaughtException::catchNodeId).toList());
    }

    @Test
    void 기록은_CAUGHT_룰과_CATCH_노드를_남긴다() {
        RunTrace t = trace(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("1:start:START:OK", "2:r1:RULE:CAUGHT", "3:c1:CATCH:OK", "4:h:RULE:OK", "5:mr:MERGE:OK", "6:after:RULE:OK", "7:end:END:OK"), kinds(t));
        NodeTrace r1 = t.nodes().get(1);
        assertEquals("R_G", r1.ruleId());
        assertNull(r1.result());
        assertEquals(List.of(), r1.violations());
        NodeTrace c1 = t.nodes().get(2);
        assertEquals(NodeKind.CATCH, c1.kind());
        assertEquals("R_G", c1.ruleId());
        assertEquals(CatchKind.NO_RESULT, c1.catchKind());
        assertEquals("NO_RESULT", c1.code());
        assertEquals("맞는 행과 기본 행이 없다", c1.message());
        assertNull(t.endedBy());
        RunTrace bad = trace(returning("R_ERR", "R_FILL", "EVAL_ERROR"), rec("X", BigDecimal.ONE));
        assertEquals(NodeStatus.CAUGHT, bad.nodes().get(1).status());
        assertEquals(Code.EVALUATION_ERROR, bad.nodes().get(1).violations().get(0).code());
    }

    @Test
    void 고친_값은_CATCH_노드_직전에도_넣을_수_있고_처리_갈래가_그_값을_읽는다() {
        // 고친 값 X=100 을 CATCH 노드(seq 3) 직전에 넣으면 처리 갈래 R_A 가 A=101 을 만든다.
        RunTrace t = engine.traceSet(new RuleSetDefinition("DRAFT", List.of(), SetStatus.INUSE, returning("R_G", "R_A", "NO_RESULT")),
                rec("X", new BigDecimal("5")), SampleRules.EVAL_TS, List.of(new TraceEdit(3, "c1", Map.of("X", new BigDecimal("100")))));
        assertNull(t.violations());
        assertNum("101", t.finalValues().get("A"));
    }

    @Test
    void CATCH_예약_이름은_레코드_키로_오면_RESERVED_KEY_다() {
        EngineEvaluationException ex = assertThrows(EngineEvaluationException.class,
                () -> run(returning("R_G", "R_FILL", "NO_RESULT"), rec("X", BigDecimal.ONE, "catch_kind", "x")));
        assertEquals(Code.RESERVED_KEY, ex.violations().get(0).code());
        assertEquals("레코드 키 'catch_kind' 는 받는 노드 예약 이름이다", ex.violations().get(0).message());
    }
}
