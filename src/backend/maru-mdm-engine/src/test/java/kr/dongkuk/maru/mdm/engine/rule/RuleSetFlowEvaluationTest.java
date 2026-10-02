package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.SampleRuleValueTest.assertNum;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.violations;
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
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 룰 세트 흐름 실행(spec §4·§11 엔진 단위 테스트, plan C5). 한 줄 흐름 회귀는 RuleSetEvaluationTest·SampleRuleSetValueTest 가 본다. */
class RuleSetFlowEvaluationTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(
            calc("R_A", "A", "X + 1", "X"), calc("R_B", "B", "X + 2", "X"), calc("R_C", "C", "X + 3", "X"),
            calc("R_A10", "A", "X + 10", "X"), calc("R_SUM", "S", "A + B", "A", "B"), calc("R_BA", "B", "A + 1", "A"),
            calc("R_Y", "YY", "Y + 1", "Y"), calc("R_D", "D", "A + 1", "A"), calc("R_ERR", "E", "X / 0", "X"), calc("R_X0", "Z0", "X * 0", "X"),
            calc("R_K", "K", "1"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private RuleSetResult run(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", null, null, null, List.of(), SetStatus.INUSE, f));
        return engine.evaluateSet("S", record, SampleRules.EVAL_TS);
    }

    private EngineEvaluationException fail(FlowDefinition f, Map<String, Object> record) {
        lookup.addSet(new RuleSetDefinition("S", null, null, null, List.of(), SetStatus.INUSE, f));
        return assertThrows(EngineEvaluationException.class, () -> engine.evaluateSet("S", record, SampleRules.EVAL_TS));
    }

    private static List<String> path(RuleSetResult r) {
        return r.path().stream().map(p -> p.nodeId() + ":" + p.kind() + ":" + p.chosenEdgeId() + ":" + p.stepIndex()).toList();
    }

    /** start → if1 [b1 cond1 → a(R_A)] [b2 cond2 → b(R_B)] [그 외 → c(R_C)] → m1 → end. */
    private static FlowDefinition ifFlow(String cond1, String cond2) {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, cond1), br("b2", "if1", "b", 2, cond2),
                        other("bo", "if1", "c"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
    }

    /** start → p1 [1 → a(ruleA)] [2 → b(ruleB)] → pm → (after 가 있으면 s(after)) → end. */
    private static FlowDefinition parFlow(String ruleA, String ruleB, String after) {
        var nodes = new java.util.ArrayList<>(List.of(start(), par("p1"), rule("a", ruleA), rule("b", ruleB), merge("pm", "p1"), end()));
        var edges = new java.util.ArrayList<>(List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2),
                e("ea", "a", "pm"), e("eb", "b", "pm")));
        if (after == null) {
            edges.add(e("ee", "pm", "end"));
        } else {
            nodes.add(rule("s", after));
            edges.add(e("ep", "pm", "s"));
            edges.add(e("es", "s", "end"));
        }
        return flow(nodes, edges);
    }

    // ── 한 줄 흐름 path ──

    @Test
    void 한_줄_흐름은_start_r1_rN_end_path_와_stepIndex() {
        lookup.add(SampleRules.all().toArray(new kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition[0]));
        lookup.addSet(SampleRules.lsA3());
        RuleSetResult r = engine.evaluateSet("LS_A3", rec("COIL_THK", new BigDecimal("0.65"), "TOP_RESIN_CD", "2A",
                "COAT_SIDE", "1", "COIL_WID", new BigDecimal("1250")), SampleRules.EVAL_TS);
        assertEquals(List.of("start:START:null:null", "r1:RULE:null:0", "r2:RULE:null:1", "r3:RULE:null:2", "end:END:null:null"), path(r));
        assertEquals(List.of(), r.warnings());
    }

    // ── IF ──

    @Test
    void IF_는_처음_참인_갈래_하나만_실행한다() {
        RuleSetResult r = run(ifFlow("X > 10", "X > 0"), rec("X", new BigDecimal("20")));
        assertEquals(List.of("R_A"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("21", r.finalValues().get("A"));
        assertEquals(List.of("start:START:null:null", "if1:IF:b1:null", "a:RULE:null:0", "m1:MERGE:null:null", "end:END:null:null"), path(r));
    }

    @Test
    void 앞_갈래가_거짓이면_다음_참인_갈래() {
        RuleSetResult r = run(ifFlow("X > 10", "X > 0"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("R_B"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertEquals("b2", r.path().get(1).chosenEdgeId());
    }

    @Test
    void 참이_없으면_그_외_갈래() {
        RuleSetResult r = run(ifFlow("X > 10", "X > 0"), rec("X", new BigDecimal("-1")));
        assertEquals(List.of("R_C"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertEquals("bo", r.path().get(1).chosenEdgeId());
    }

    @Test
    void 조건식_NULL_은_거짓이고_BRANCH_COND_NULL_경고() {
        RuleSetResult r = run(ifFlow("FLAG", "X > 0"), rec("X", new BigDecimal("5"), "FLAG", null));
        assertEquals("b2", r.path().get(1).chosenEdgeId());
        assertEquals(1, r.warnings().size());
        EngineWarning w = r.warnings().get(0);
        assertEquals(EngineWarning.Code.BRANCH_COND_NULL, w.code());
        assertEquals("IF if1 갈래 b1 조건식 결과가 NULL 이라 거짓으로 봤다", w.message());
    }

    @Test
    void 조건식이_불린이_아니면_BRANCH_SELECT_BRANCH_EVAL_ERROR() {
        EngineEvaluationException e = fail(ifFlow("X + 1", "X > 0"), rec("X", new BigDecimal("5")));
        assertEquals(List.of("BRANCH_SELECT/BRANCH_EVAL_ERROR/null/null/b1"), violations(e));
    }

    @Test
    void 구조가_틀린_흐름은_SET_CHECK_FLOW_INVALID() {
        FlowDefinition noElse = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X < 0"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        EngineEvaluationException e = fail(noElse, rec("X", BigDecimal.ONE));
        assertEquals(List.of("SET_CHECK/FLOW_INVALID/null/null/if1"), violations(e));
        assertEquals("세트 S 의 흐름이 올바르지 않다: IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다", e.violations().get(0).message());
    }

    // ── 조건식 변수 타입(룰 조건 열과 같은 규칙) ──

    @Test
    void 선언_타입이_NUMBER_인_변수는_문자열로_와도_숫자로_비교한다() {
        // X 는 R_A·R_B·R_C 가 NUMBER 로 선언한다. "9" 를 문자열 그대로 비교하면 "9" > 10 이 참이 된다.
        RuleSetResult r = run(ifFlow("X > 10", "X > 0"), rec("X", "9"));
        assertEquals("b2", r.path().get(1).chosenEdgeId());
        assertEquals(List.of("R_B"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("11", r.finalValues().get("B"));
    }

    @Test
    void 앞_룰이_변수를_선언했는지와_상관없이_같은_갈래를_탄다() {
        // 앞 룰 없음: start → if1 [b1 "X > 10" → a(R_A)] [그 외 → c(R_C)] → m1 → end
        FlowDefinition bare = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        // 앞 룰 있음: start → x0(R_X0, X 를 NUMBER 로 받아 ctx 를 바꾼다) → if1 … 같은 갈래들
        FlowDefinition afterRule = flow(List.of(start(), rule("x0", "R_X0"), ifNode("if1"), rule("a", "R_A"), rule("c", "R_C"),
                        merge("m1", "if1"), end()),
                List.of(e("e0", "start", "x0"), e("ex", "x0", "if1"), br("b1", "if1", "a", 1, "X > 10"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RuleSetResult r1 = run(bare, rec("X", "9"));
        RuleSetResult r2 = run(afterRule, rec("X", "9"));
        assertEquals("bo", r1.path().stream().filter(p -> p.kind() == NodeKind.IF).findFirst().orElseThrow().chosenEdgeId());
        assertEquals("bo", r2.path().stream().filter(p -> p.kind() == NodeKind.IF).findFirst().orElseThrow().chosenEdgeId());
    }

    @Test
    void 조건식_변수와_선언의_대소문자가_달라도_선언_타입으로_바꾼다() {
        // EvalEx 변수 조회는 대소문자를 가리지 않는다. 선언은 X(R_A, NUMBER), 조건식·레코드는 x.
        // 바꾸지 않으면 "9" > 10 이 문자열 비교로 참이 되어 b1(R_A, X 필요)로 들어가 MISSING_KEY X 로 멈춘다.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("k", "R_K"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "x > 10"), other("bo", "if1", "k"),
                        e("ea", "a", "m1"), e("ek", "k", "m1"), e("ee", "m1", "end")));
        RuleSetResult r = run(f, rec("x", "9"));
        assertEquals("bo", r.path().get(1).chosenEdgeId());
        assertEquals(List.of("R_K"), r.steps().stream().map(RuleResult::ruleId).toList());
    }

    @Test
    void 조건식_변수_타입_변환_실패는_BRANCH_EVAL_ERROR() {
        EngineEvaluationException e = fail(ifFlow("X > 10", "X > 0"), rec("X", "abc"));
        assertEquals(List.of("BRANCH_SELECT/BRANCH_EVAL_ERROR/null/null/b1"), violations(e));
        assertEquals("IF if1 갈래 b1 조건식을 평가하지 못했다: 식 'X > 10' 변수 X 타입 변환 오류: String 값 'abc' 을 NUMBER 로 바꿀 수 없다",
                e.violations().get(0).message());
    }

    @Test
    void 조건식_파싱_실패는_사전_검사를_지나_평가_때_BRANCH_EVAL_ERROR() {
        EngineEvaluationException e = fail(ifFlow("X >", "X > 0"), rec("X", BigDecimal.ONE));
        assertEquals(List.of("BRANCH_SELECT/BRANCH_EVAL_ERROR/null/null/b1"), violations(e));
    }

    // ── 입력 키 ──

    @Test
    void 조건식_변수가_레코드에_없으면_세트_시작_전_MISSING_KEY() {
        EngineEvaluationException e = fail(ifFlow("Z > 0", "X > 0"), rec("X", BigDecimal.ONE));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/null/null/Z"), violations(e));
    }

    @Test
    void 타지_않는_갈래의_입력이_없어도_세트는_실패하지_않는다() {
        // b1 갈래의 R_Y 는 Y 가 필요하다. X=-1 이면 그 외(R_C)로 가므로 Y 가 없어도 된다.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("y", "R_Y"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "y", 1, "X > 0"), other("bo", "if1", "c"),
                        e("ey", "y", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("-1")));
        assertEquals(List.of("R_C"), r.steps().stream().map(RuleResult::ruleId).toList());

        EngineEvaluationException e = fail(f, rec("X", new BigDecimal("20")));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_Y/null/Y"), violations(e), "갈래에 들어갈 때 그 갈래 키를 본다");
    }

    @Test
    void IF_합류_뒤_일부_갈래_변수는_실행_직전에_본다() {
        // b1 → a(R_A: A) / 그 외 → 빈 갈래 / 합류 뒤 d(R_D: A 를 읽음)
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), rule("d", "R_D"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"),
                        e("ea", "a", "m1"), e("em", "m1", "d"), e("ed", "d", "end")));
        RuleSetResult ok = run(f, rec("X", new BigDecimal("5")));
        assertNum("7", ok.finalValues().get("D"));

        EngineEvaluationException e = fail(f, rec("X", new BigDecimal("-5")));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_D/null/A"), violations(e), "그 외(빈 갈래)를 타면 A 가 없다");

        RuleSetResult withA = run(f, rec("X", new BigDecimal("-5"), "A", new BigDecimal("100")));
        assertNum("101", withA.finalValues().get("D")); // 레코드가 A 를 주면 통과
    }

    @Test
    void IF_조건식이_합류_뒤_일부_갈래_변수를_읽으면_사전_검사는_통과하고_없으면_평가_때_BRANCH_EVAL_ERROR() {
        // if1 [b1 "X > 0" → a(R_A: A)] [그 외 → 빈 갈래] → m1 → if2 [b2 "A > 0" → d(R_D)] [그 외 → 빈 갈래] → m2 → end
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), ifNode("if2"), rule("d", "R_D"),
                        merge("m2", "if2"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"), e("ea", "a", "m1"),
                        e("em", "m1", "if2"), br("b2", "if2", "d", 1, "A > 0"), other("bo2", "if2", "m2"), e("ed", "d", "m2"),
                        e("ee", "m2", "end")));
        RuleSetResult ok = run(f, rec("X", new BigDecimal("5")));
        assertNum("7", ok.finalValues().get("D"));

        EngineEvaluationException e = fail(f, rec("X", new BigDecimal("-5")));
        assertEquals(List.of("BRANCH_SELECT/BRANCH_EVAL_ERROR/null/null/b2"), violations(e), "A 는 사전 검사가 아니라 평가 때 드러난다");
    }

    @Test
    void IF_갈래_안의_IF_는_갈래에_들어갈_때_지연_목록을_만든다() {
        // if1 [b1 "X > 0" → if2 [b2 "X > 10" → a(R_A: A)] [그 외 → 빈 갈래] → m2 → d(R_D: A 를 읽음)] [그 외 → c(R_C)] → m1 → end
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), ifNode("if2"), rule("a", "R_A"), merge("m2", "if2"), rule("d", "R_D"),
                        rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "if2", 1, "X > 0"), other("bo", "if1", "c"),
                        br("b2", "if2", "a", 1, "X > 10"), other("bo2", "if2", "m2"), e("ea", "a", "m2"), e("em", "m2", "d"),
                        e("ed", "d", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        RuleSetResult deep = run(f, rec("X", new BigDecimal("20")));
        assertNum("22", deep.finalValues().get("D"));

        EngineEvaluationException e = fail(f, rec("X", new BigDecimal("5")));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_D/null/A"), violations(e), "R_D 직전 지연 검사");

        RuleSetResult withA = run(f, rec("X", new BigDecimal("5"), "A", new BigDecimal("100")));
        assertNum("101", withA.finalValues().get("D"));
    }

    // ── 병렬 ──

    @Test
    void 병렬은_order_순으로_하나씩_실행하고_합류_뒤_결과를_합친다() {
        RuleSetResult r = run(parFlow("R_A", "R_B", "R_SUM"), rec("X", BigDecimal.ONE));
        assertEquals(List.of("R_A", "R_B", "R_SUM"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("5", r.finalValues().get("S"));
        assertEquals(List.of("start:START:null:null", "p1:PARALLEL:null:null", "a:RULE:null:0", "b:RULE:null:1",
                "pm:MERGE:null:null", "s:RULE:null:2", "end:END:null:null"), path(r));
    }

    @Test
    void 병렬_갈래는_형제_결과를_보지_않고_분기_직전_값을_본다() {
        // 둘째 갈래 R_BA(B = A + 1)는 첫 갈래의 A(X+1=2)가 아니라 레코드의 A(100)를 본다.
        RuleSetResult r = run(parFlow("R_A", "R_BA", null), rec("X", BigDecimal.ONE, "A", new BigDecimal("100")));
        assertNum("101", r.finalValues().get("B"));
        assertNum("2", r.finalValues().get("A")); // 합류 뒤에는 첫 갈래 결과가 ctx 에 들어간다

        EngineEvaluationException e = fail(parFlow("R_A", "R_BA", null), rec("X", BigDecimal.ONE));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_BA/null/A"), violations(e), "형제 결과는 입력으로 치지 않는다");
    }

    @Test
    void 병렬_형제가_같은_이름을_쓰면_뒤_갈래가_이긴다() {
        // Review Focus 5 — 정적 검사를 거치지 않은 흐름도 갈래 순서대로 합친다.
        RuleSetResult r = run(parFlow("R_A", "R_A10", null), rec("X", BigDecimal.ONE));
        assertNum("11", r.finalValues().get("A"));
    }

    @Test
    void 병렬_빈_갈래는_아무것도_하지_않고_합류한다() {
        // start → p1 [p1a 1 → a(R_A)] [p1b 2 → 빈 갈래] → pm → end
        FlowDefinition f = flow(List.of(start(), par("p1"), rule("a", "R_A"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "pm", 2),
                        e("ea", "a", "pm"), e("ee", "pm", "end")));
        RuleSetResult r = run(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("R_A"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("2", r.finalValues().get("A"));
        assertEquals(List.of("start:START:null:null", "p1:PARALLEL:null:null", "a:RULE:null:0", "pm:MERGE:null:null",
                "end:END:null:null"), path(r));
    }

    // ── 중첩·빈 갈래·같은 룰 ──

    @Test
    void 병렬_안의_IF() {
        FlowDefinition f = kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.nestedFlow();
        RuleSetResult in = run(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("R_A", "R_B"), in.steps().stream().map(RuleResult::ruleId).toList());
        RuleSetResult out = run(f, rec("X", new BigDecimal("-1")));
        assertEquals(List.of("R_B"), out.steps().stream().map(RuleResult::ruleId).toList());
        assertEquals("bo", out.path().stream().filter(p -> p.kind() == NodeKind.IF).findFirst().orElseThrow().chosenEdgeId());
    }

    @Test
    void 빈_갈래_두_개인_IF() {
        // Review Focus 6
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "m1", 1, "X > 0"), other("bo", "if1", "m1"), e("ee", "m1", "end")));
        RuleSetResult r = run(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of(), r.steps());
        assertEquals(List.of("start:START:null:null", "if1:IF:b1:null", "m1:MERGE:null:null", "end:END:null:null"), path(r));
    }

    @Test
    void 같은_룰이_두_갈래에_있으면_조회는_한_번_stepIndex_는_탄_노드() {
        // Review Focus 3
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a1", "R_A"), rule("a2", "R_A"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a1", 1, "X > 0"), other("bo", "if1", "a2"),
                        e("e1", "a1", "m1"), e("e2", "a2", "m1"), e("ee", "m1", "end")));
        RuleSetResult r = run(f, rec("X", new BigDecimal("-1")));
        assertEquals(List.of(new PathStep("a2", NodeKind.RULE, null, 0)),
                r.path().stream().filter(p -> p.kind() == NodeKind.RULE).toList());
        assertEquals(1, lookup.ruleCalls().stream().filter("R_A"::equals).count());
    }

    @Test
    void 룰_실행_오류는_지금처럼_세트를_멈춘다() {
        FlowDefinition f = flow(List.of(start(), rule("x", "R_ERR"), end()), List.of(e("e1", "start", "x"), e("e2", "x", "end")));
        assertThrows(EngineEvaluationException.class, () -> run(f, rec("X", BigDecimal.ONE)));
    }

    // ── 빈 단계(TASK, 4단계 spec §1.1) ──

    @Test
    void 빈_단계는_path_에_TASK_로_남고_steps_와_결과는_그대로다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        RuleSetResult r = run(f, rec("X", BigDecimal.ONE));
        assertEquals(List.of("start:START:null:null", "t1:TASK:null:null", "a:RULE:null:0", "end:END:null:null"), path(r));
        assertEquals(List.of("R_A"), r.steps().stream().map(RuleResult::ruleId).toList());
        assertNum("2", r.finalValues().get("A"));
    }

    @Test
    void 빈_단계는_아무_이름도_만들지_않는다_IF_한_갈래가_빈_단계면_합류_뒤_읽기는_지연_키_검사다() {
        // start → if1 [b1 "X > 10" → t1] [그 외 → a(R_A)] → m1 → d(R_D: A + 1) → end
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), task("t1"), rule("a", "R_A"), merge("m1", "if1"), rule("d", "R_D"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "t1", 1, "X > 10"), other("bo", "if1", "a"),
                        e("et", "t1", "m1"), e("ea", "a", "m1"), e("em", "m1", "d"), e("ed", "d", "end")));
        assertEquals(List.of("SET_CHECK/MISSING_KEY/R_D/null/A"), violations(fail(f, rec("X", new BigDecimal("20")))));
        assertNum("1", run(f, rec("X", new BigDecimal("-1"))).finalValues().get("D"));
    }
}
