package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.catchNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.guardMerge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifNode;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.merge;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.nestedFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.other;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.par;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.parFlow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.pe;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.task;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/** plan C3 — 구조 검사 문구·순서와 블록 트리. 같은 문구를 m-mdm flow-model.ts 와 rule-set-corpus.json 이 고정한다. */
class FlowParserTest {

    /** issue 를 "code|nodeId|edgeId|message" 로. */
    private static List<String> issues(FlowDefinition f) {
        FlowParse p = FlowParser.parse(f);
        if (!p.issues().isEmpty()) {
            assertNull(p.tree(), "오류가 있으면 트리가 없다");
        }
        return p.issues().stream().map(i -> i.code() + "|" + i.nodeId() + "|" + i.edgeId() + "|" + i.message()).toList();
    }

    private static FlowDefinition line(List<FlowNode> nodes, List<FlowEdge> edges) {
        return flow(nodes, edges);
    }

    // ── 정상 ──

    @Test
    void IF_흐름은_그_외를_마지막에_둔_갈래_순서로_트리가_된다() {
        FlowParse p = FlowParser.parse(ifFlow());
        assertEquals(List.of(), p.issues());
        Seq root = p.tree().root();
        assertEquals(1, root.items().size());
        Split s = (Split) root.items().get(0);
        assertEquals("if1", s.nodeId());
        assertEquals(NodeKind.IF, s.kind());
        assertEquals("m1", s.mergeId());
        assertEquals(List.of("b1", "b2", "bo"), s.branches().stream().map(Branch::edgeId).toList());
        assertTrue(s.branches().get(2).otherwise());
        assertEquals(List.of(new RuleStep("a", "R_A")), s.branches().get(0).body().items());
        assertTrue(p.tree().branched());
        assertEquals("m1", s.joinId());
        assertFalse(s.branches().get(0).ends());
    }

    @Test
    void 갈래_순서는_선_배열이_아니라_order_다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), other("bo", "if1", "m1"), br("b2", "if1", "b", 2, "X > 0"),
                        br("b1", "if1", "a", 1, "X > 10"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertEquals(List.of("b1", "b2", "bo"), s.branches().stream().map(Branch::edgeId).toList());
    }

    @Test
    void 병렬_흐름은_order_순_갈래와_합류_뒤_룰() {
        FlowParse p = FlowParser.parse(parFlow());
        assertEquals(List.of(), p.issues());
        List<Block> items = p.tree().root().items();
        assertEquals(2, items.size());
        Split s = (Split) items.get(0);
        assertEquals(NodeKind.PARALLEL, s.kind());
        assertEquals(List.of("p1a", "p1b"), s.branches().stream().map(Branch::edgeId).toList());
        assertEquals(new RuleStep("c", "R_C"), items.get(1));
    }

    @Test
    void 중첩_분기와_빈_그_외_갈래() {
        FlowParse p = FlowParser.parse(nestedFlow());
        assertEquals(List.of(), p.issues());
        Split outer = (Split) p.tree().root().items().get(0);
        Split inner = (Split) outer.branches().get(0).body().items().get(0);
        assertEquals("if1", inner.nodeId());
        assertEquals(List.of(), inner.branches().get(1).body().items(), "그 외 갈래가 합류로 바로 간다 = 빈 갈래");
    }

    @Test
    void 두_갈래_모두_빈_IF_도_정상이다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "m1", 1, "X > 0"), other("bo", "if1", "m1"), e("ee", "m1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertTrue(s.branches().stream().allMatch(b -> b.body().items().isEmpty()));
        assertEquals(List.of(), p.tree().ruleIds());
    }

    @Test
    void linear_는_start_r1_rN_end_와_e1_eN1_을_만든다() {
        FlowDefinition f = FlowParser.linear(List.of("R_A", "R_B"));
        assertEquals(List.of("start", "r1", "r2", "end"), f.nodes().stream().map(FlowNode::id).toList());
        assertEquals(List.of("e1", "e2", "e3"), f.edges().stream().map(FlowEdge::id).toList());
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        assertEquals(List.of("R_A", "R_B"), p.tree().ruleIds());
        assertFalse(p.tree().branched());
    }

    @Test
    void 빈_linear_는_start_end_한_선이고_트리가_비었다() {
        FlowParse p = FlowParser.parse(FlowParser.linear(List.of()));
        assertEquals(List.of(), p.issues());
        assertNotNull(p.tree());
        assertEquals(List.of(), p.tree().root().items());
    }

    @Test
    void TASK_는_TaskStep_블록이고_ruleSteps_에_들지_않지만_관계는_있다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "a", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        assertEquals(List.of(new TaskStep("t1"), new RuleStep("a", "R_A")), p.tree().root().items());
        assertEquals(List.of(new RuleStep("a", "R_A")), p.tree().ruleSteps());
        assertEquals(List.of("R_A"), p.tree().ruleIds());
        assertEquals(FlowTree.Relation.BEFORE, p.tree().relation("t1", "a"));
        assertFalse(p.tree().branched());
    }

    @Test
    void IF_갈래_안의_TASK_는_그_갈래_본문이고_다른_갈래와_EXCLUSIVE() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), task("t1"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "t1", 1, "X > 10"), other("bo", "if1", "c"),
                        e("et", "t1", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertEquals(List.of(new TaskStep("t1")), s.branches().get(0).body().items());
        assertEquals(FlowTree.Relation.EXCLUSIVE, p.tree().relation("t1", "c"));
    }

    @Test
    void TASK_는_나가는_선이_하나여야_한다() {
        FlowDefinition f = flow(List.of(start(), task("t1"), rule("a", "R_A"), rule("b", "R_B"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "a"), e("e3", "t1", "b"), e("e4", "a", "end"), e("e5", "b", "end")));
        assertTrue(issues(f).contains("FLOW_STRUCTURE|t1|null|t1의 나가는 선이 2개다. 1개여야 한다"), issues(f).toString());
    }

    // ── 1단계(모두 모은다) ──

    @Test
    void a_노드_ID_중복() {
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), rule("a", "R_B"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|a|null|노드 ID a가 겹친다"), issues(f));
    }

    @Test
    void a_겹친_ID_는_첫_노드만_센다() {
        // 둘째 "end"(RULE)는 개수·순회에서 빠진다 — END 는 1개로 센다(머리말 C3).
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), end(), rule("end", "R_B")),
                List.of(e("e1", "start", "a"), e("e2", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|end|null|노드 ID end가 겹친다"), issues(f));
    }

    @Test
    void b1_b2_시작_끝_개수() {
        FlowDefinition f = line(List.of(rule("a", "R_A")), List.of());
        assertEquals(List.of(
                "FLOW_STRUCTURE|null|null|시작 노드가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|null|null|끝 노드가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|a|null|a의 들어오는 선이 0개다. 1개 이상이어야 한다",
                "FLOW_STRUCTURE|a|null|a의 나가는 선이 0개다. 1개여야 한다"), issues(f));
    }

    @Test
    void c_없는_노드를_가리키는_선은_from_먼저() {
        FlowDefinition f = line(List.of(start(), end()), List.of(e("e1", "start", "end"), e("e2", "x", "y")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|x|e2|선 e2가 없는 노드 x를 가리킨다",
                "FLOW_STRUCTURE|y|e2|선 e2가 없는 노드 y를 가리킨다"), issues(f));
    }

    @Test
    void d1_d2_들어오는_선과_나가는_선_개수() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), other("bo", "if1", "a"), e("ea", "a", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|if1|null|if1의 나가는 선이 1개다. 2개 이상이어야 한다",
                "FLOW_STRUCTURE|m1|null|m1의 들어오는 선이 1개다. 2개 이상이어야 한다"), issues(f));
    }

    @Test
    void d1_START_에_들어오는_선() {
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "end"), e("e3", "end", "start")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|start|null|start의 들어오는 선이 1개다. 없어야 한다",
                "FLOW_STRUCTURE|end|null|end의 나가는 선이 1개다. 없어야 한다"), issues(f));
    }

    @Test
    void e_룰_노드에_룰_ID_가_없다() {
        FlowDefinition f = line(List.of(start(), rule("a", " "), end()), List.of(e("e1", "start", "a"), e("e2", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|a|null|룰 노드 a에 룰 ID가 없다"), issues(f));
    }

    @Test
    void f1_짝_분기가_없는_합류_f2_합류가_없는_병렬과_합류가_둘인_IF() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", null), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 -가 없다"), issues(f), "IF 는 합류가 0개여도 된다");
        FlowDefinition par = line(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2), e("ea", "a", "end"), e("eb", "b", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|p1|null|분기 p1를 닫는 합류가 0개다. 정확히 1개여야 한다"), issues(par));
        FlowDefinition two = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"),
                        merge("m2", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 1"), br("b2", "if1", "b", 2, "X > 2"), other("bo", "if1", "c"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m2"), e("em", "m1", "m2"), e("ee", "m2", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|if1|null|IF if1를 닫는 합류가 2개다. IF 는 합류를 두지 않는다"), issues(two));
    }

    @Test
    void g1_그_외_갈래가_없거나_둘이다() {
        FlowDefinition none = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X < 0"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_IF_ELSE|if1|null|IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다"), issues(none));

        FlowDefinition two = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), other("o1", "if1", "a"), other("o2", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_IF_ELSE|if1|null|IF if1에 \"그 외\" 갈래가 2개다. 정확히 1개여야 한다"), issues(two));
    }

    @Test
    void g2_IF_갈래에_조건식이_없다() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "  "), other("bo", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_IF_ELSE|if1|b1|IF if1의 갈래 b1에 조건식이 없다"), issues(f));
    }

    @Test
    void g3_병렬_갈래에_조건() {
        FlowDefinition f = line(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), br("p1a", "p1", "a", 1, "X > 0"), pe("p1b", "p1", "b", 2),
                        e("ea", "a", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|p1|p1a|병렬 분기 p1의 갈래 p1a에는 조건을 둘 수 없다"), issues(f));
    }

    @Test
    void g4_g5_순서가_없거나_겹친다() {
        FlowDefinition f = line(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), new FlowEdge("p1a", "p1", "a", null, null, false, null), pe("p1b", "p1", "b", 2),
                        pe("p1c", "p1", "c", 2), e("ea", "a", "pm"), e("eb", "b", "pm"), e("ec", "c", "pm"), e("ee", "pm", "end")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|p1|p1a|분기 p1의 갈래 p1a에 순서가 없다",
                "FLOW_STRUCTURE|p1|p1c|분기 p1의 갈래 순서 2가 겹친다"), issues(f));
    }

    @Test
    void 일단계_순서는_a_b_c_노드별_d_e_f1_분기별_f2_g() {
        // a(중복) → b2(END 없음) → c(없는 노드) → 노드별 d/e/f1 → 분기별 f2/g1
        FlowDefinition f = line(List.of(start(), rule("r", "R_A"), rule("r", "R_B"), ifNode("if1")),
                List.of(e("e0", "start", "r"), e("e1", "r", "zz"), e("e2", "r", "if1")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|r|null|노드 ID r가 겹친다",
                "FLOW_STRUCTURE|null|null|끝 노드가 0개다. 정확히 1개여야 한다",
                "FLOW_STRUCTURE|zz|e1|선 e1가 없는 노드 zz를 가리킨다",
                "FLOW_STRUCTURE|if1|null|if1의 나가는 선이 0개다. 2개 이상이어야 한다",
                "FLOW_IF_ELSE|if1|null|IF if1에 \"그 외\" 갈래가 0개다. 정확히 1개여야 한다"), issues(f));
    }

    // ── 2단계(첫 오류에서 멈춘다) ──

    @Test
    void 두_번_지나는_노드() {
        // if1 이 m1 에서 닫힌 뒤 if2 의 갈래가 이미 지난 m1 로 다시 간다.
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), ifNode("if2"), merge("m2", "if2"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"), e("ea", "a", "m1"),
                        e("e1", "m1", "if2"), br("c1", "if2", "m1", 1, "X > 1"), br("c2", "if2", "m2", 2, "X > 2"),
                        other("co", "if2", "m2"), e("ee", "m2", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|m1를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"), issues(f));
    }

    @Test
    void 갈래가_짝_합류가_아닌_곳으로_나간다() {
        // p1 의 두 번째 갈래가 pm 이 아니라 바깥 IF 의 합류 m1 로 간다.
        FlowDefinition f = line(List.of(start(), ifNode("if1"), par("p1"), rule("a", "R_A"), rule("b", "R_B"), merge("pm", "p1"),
                        merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "p1", 1, "X > 0"), other("bo", "if1", "m1"),
                        pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2), pe("p1c", "p1", "pm", 3),
                        e("ea", "a", "pm"), e("eb", "b", "m1"), e("ep", "pm", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|갈래가 pm에서 닫히지 않고 m1로 나간다"), issues(f));
    }

    @Test
    void 도달할_수_없는_노드() {
        // x ↔ y 는 개수 규칙을 지키지만 시작에서 닿지 않는다.
        FlowDefinition f = line(List.of(start(), rule("a", "R_A"), rule("x", "R_X"), rule("y", "R_Y"), end()),
                List.of(e("e1", "start", "a"), e("e2", "a", "end"), e("e3", "x", "y"), e("e4", "y", "x")));
        assertEquals(List.of("FLOW_STRUCTURE|x|null|x에 도달할 수 없다"), issues(f));
    }

    @Test
    void 노드_200개로_만들_수_있는_가장_깊은_중첩_IF_도_스택_넘침_없이_파싱한다() {
        int depth = 99;
        List<FlowNode> nodes = new ArrayList<>();
        List<FlowEdge> edges = new ArrayList<>();
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null, null, null));
        for (int i = 1; i <= depth; i++) {
            nodes.add(new FlowNode("if" + i, NodeKind.IF, null, null, null, null, null));
            nodes.add(new FlowNode("m" + i, NodeKind.MERGE, null, "if" + i, null, null, null));
        }
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null, null, null));
        edges.add(new FlowEdge("e0", "start", "if1", null, null, false, null));
        for (int i = 1; i <= depth; i++) {
            String inner = i < depth ? "if" + (i + 1) : "m" + i;
            edges.add(new FlowEdge("a" + i, "if" + i, inner, 1, "X = " + i, false, null));
            edges.add(new FlowEdge("b" + i, "if" + i, "m" + i, null, null, true, null));
            edges.add(new FlowEdge("c" + i, "m" + i, i > 1 ? "m" + (i - 1) : "end", null, null, false, null));
        }
        assertEquals(200, nodes.size());
        FlowParse p = FlowParser.parse(new FlowDefinition(1, nodes, edges));
        assertEquals(List.of(), p.issues());
        assertNotNull(p.tree());
    }

    // ── 받는 노드(받는 노드 spec §3) ──

    /** start → r1(R_A) → mr → r2(R_B) → end. c1(NO_RESULT) → r9(R_C) → mr, c2(INPUT_ERROR·EVAL_ERROR) → end. */
    static FlowDefinition guardedFlow() {
        return flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), rule("r9", "R_C"),
                        catchNode("c2", "r1", "INPUT_ERROR", "EVAL_ERROR"), guardMerge("mr", "r1"), rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "r9"), e("e4", "r9", "mr"), e("e5", "c2", "end"),
                        e("e6", "mr", "r2"), e("e7", "r2", "end")));
    }

    @Test
    void 받는_룰은_Guarded_블록이고_처리_갈래는_돌아옴과_끝냄을_안다() {
        FlowParse p = FlowParser.parse(guardedFlow());
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals(new RuleStep("r1", "R_A"), g.step());
        assertEquals("r1", g.nodeId());
        assertEquals("mr", g.mergeId());
        assertEquals("mr", g.joinId());
        assertEquals(List.of(), g.normal().items());
        assertEquals(new Guarded.Handler("c1", List.of(CatchKind.NO_RESULT), new Seq(List.of(new RuleStep("r9", "R_C"))), false),
                g.handlers().get(0));
        assertEquals(new Guarded.Handler("c2", List.of(CatchKind.INPUT_ERROR, CatchKind.EVAL_ERROR), new Seq(List.of()), true),
                g.handlers().get(1));
        assertEquals(g.handlers().get(1), g.handlerFor(CatchKind.EVAL_ERROR));
        assertNull(g.handlerFor(CatchKind.HIT_CONFLICT));
        assertEquals(new RuleStep("r2", "R_B"), p.tree().root().items().get(1));
        assertEquals(List.of("R_A", "R_C", "R_B"), p.tree().ruleIds());
        assertFalse(p.tree().branched());
    }

    @Test
    void 돌아오는_처리_갈래가_없으면_정상_갈래가_비고_룰의_나가는_선이_그대로_이어진다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "EVAL_ERROR"), rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "r2"), e("e3", "c1", "end"), e("e4", "r2", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertNull(g.mergeId());
        assertNull(g.joinId());
        assertEquals(List.of(), g.normal().items());
        assertTrue(g.handlers().get(0).ends());
        assertEquals(new RuleStep("r2", "R_B"), p.tree().root().items().get(1));
    }

    @Test
    void 정상_갈래에_노드가_있고_처리_갈래_안_룰에도_받는_노드를_붙일_수_있다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), rule("n1", "R_B"), catchNode("c1", "r1", "NO_RESULT"), rule("h1", "R_C"),
                        catchNode("c9", "h1", "EVAL_ERROR"), guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "mr"), e("e4", "c1", "h1"), e("e5", "h1", "mr"),
                        e("e6", "c9", "end"), e("e7", "mr", "end")));
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals(List.of(new RuleStep("n1", "R_B")), g.normal().items());
        Guarded inner = (Guarded) g.handlers().get(0).body().items().get(0);
        assertEquals("h1", inner.nodeId());
        assertNull(inner.mergeId());
        assertTrue(inner.handlers().get(0).ends());
        assertEquals(List.of("R_A", "R_B", "R_C"), p.tree().ruleIds());
    }

    @Test
    void 받는_노드_오류는_FLOW_CATCH_로_모두_모은다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "R_A"), task("t1"), catchNode("c0", "zz", "NO_RESULT"), catchNode("c1", "t1", "NO_RESULT"),
                        new FlowNode("c2", NodeKind.CATCH, null, null, null, "r1", List.of()), catchNode("c3", "r1", "NO_RESULT", "BOOM", "NO_RESULT"),
                        catchNode("c4", "r1", "NO_RESULT"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "t1"), e("e3", "t1", "end"), e("e4", "c0", "end"), e("e5", "c1", "end"),
                        e("e6", "c2", "end"), e("e7", "c3", "end"), e("e8", "c4", "end")));
        assertEquals(List.of(
                "FLOW_CATCH|c0|null|받는 노드 c0가 붙은 노드 zz가 없다",
                "FLOW_CATCH|c2|null|받는 노드 c2에 받을 예외 종류가 없다",
                "FLOW_CATCH|c3|null|받는 노드 c3의 예외 종류 BOOM를 모른다",
                "FLOW_CATCH|c3|null|받는 노드 c3에 예외 종류 NO_RESULT가 겹친다",
                "FLOW_CATCH|c4|null|룰 노드 r1에서 예외 종류 NO_RESULT를 c3와 c4가 함께 받는다"), issues(f));
    }

    @Test
    void END_는_들어오는_선이_여럿이어도_되고_룰은_들어오는_선이_없으면_거부한다() {
        FlowDefinition withCatch = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "c1", "end")));
        assertEquals(List.of(), issues(withCatch));
        FlowDefinition orphan = flow(List.of(start(), rule("r1", "R_A"), rule("r2", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "end"), e("e3", "r2", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|r2|null|r2의 들어오는 선이 0개다. 1개 이상이어야 한다"), issues(orphan));
    }

    @Test
    void 돌아오는_합류는_받는_룰마다_하나까지이고_받는_노드_없는_룰은_짝이_아니다() {
        FlowDefinition two = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), guardMerge("m1", "r1"), guardMerge("m2", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "m1"), e("e3", "c1", "m1"), e("e4", "m1", "m2"), e("e5", "c1", "m2"), e("e6", "m2", "end")));
        assertTrue(issues(two).contains("FLOW_STRUCTURE|r1|null|룰 r1로 돌아오는 합류가 2개다. 1개까지 둔다"), issues(two).toString());
        FlowDefinition bare = flow(List.of(start(), rule("r1", "R_A"), guardMerge("m1", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "m1"), e("e3", "m1", "end")));
        assertTrue(issues(bare).contains("FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 r1가 없다"), issues(bare).toString());
    }

    @Test
    void 처리_갈래가_둘러싼_IF_의_옛_합류로_돌아오면_받고_옛_형식_IF_갈래는_END_로_못_간다() {
        // start → if9 [b1 → r1 → m9][그 외 → m9] → end. r1 에 c1 → m9(if9 의 합류).
        FlowDefinition jump = flow(List.of(start(), ifNode("if9"), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), merge("m9", "if9"), end()),
                List.of(e("e0", "start", "if9"), br("b1", "if9", "r1", 1, "X > 0"), other("bo", "if9", "m9"), e("e1", "r1", "m9"),
                        e("e2", "c1", "m9"), e("e3", "m9", "end")));
        FlowParse p = FlowParser.parse(jump);
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        Guarded g = (Guarded) s.branches().get(0).body().items().get(0);
        assertEquals("m9", g.joinId());
        assertNull(g.mergeId());
        assertEquals(List.of(), g.normal().items());
        // start → r1 → mr → end. c1 → if1 [b1 → end][b2 → m2][그 외 → m2] → m2 → mr.
        FlowDefinition nested = flow(List.of(start(), rule("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), ifNode("if1"), merge("m2", "if1"),
                        guardMerge("mr", "r1"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "mr"), e("e3", "c1", "if1"), br("b1", "if1", "end", 1, "X > 0"),
                        br("b2", "if1", "m2", 2, "X > 1"), other("bo", "if1", "m2"), e("e4", "m2", "mr"), e("e5", "mr", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|end|null|갈래가 m2에서 닫히지 않고 end로 나간다"), issues(nested));
    }

    // ── 모이는 자리·끝내는 갈래(implicit-join spec §2.2) ──

    private static Split split(FlowDefinition f, int index) {
        FlowParse p = FlowParser.parse(f);
        assertEquals(List.of(), p.issues());
        return (Split) p.tree().root().items().get(index);
    }

    @Test
    void 새_형식_IF_는_갈래가_다음_노드로_바로_모인다() {
        FlowParse p = FlowParser.parse(kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.ifFlowNew());
        assertEquals(List.of(), p.issues());
        Split s = (Split) p.tree().root().items().get(0);
        assertNull(s.mergeId());
        assertEquals("j", s.joinId());
        assertEquals(List.of("b1", "b2", "bo"), s.branches().stream().map(Branch::edgeId).toList());
        assertTrue(s.branches().stream().noneMatch(Branch::ends));
        assertEquals(new TaskStep("j"), p.tree().root().items().get(1));
    }

    @Test
    void 빈_갈래는_모이는_자리로_바로_가는_선이고_중첩_IF_는_같은_자리에서_함께_닫힌다() {
        // if1 [b1 → if2 [d1 → a][그 외 → b]] [그 외 → z(빈 갈래)], a·b → z → end — 두 IF 가 z 에서 함께 닫힌다.
        FlowDefinition g = flow(List.of(start(), ifNode("if1"), ifNode("if2"), rule("a", "R_A"), rule("b", "R_B"), rule("z", "R_Z"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "if2", 1, "X > 0"), other("bo", "if1", "z"), br("d1", "if2", "a", 1, "X > 1"),
                        other("do", "if2", "b"), e("ea", "a", "z"), e("eb", "b", "z"), e("ez", "z", "end")));
        Split outer = split(g, 0);
        assertEquals("z", outer.joinId());
        assertEquals(List.of(), outer.branches().get(1).body().items(), "그 외는 z 로 바로 가는 빈 갈래");
        Split inner = (Split) outer.branches().get(0).body().items().get(0);
        assertEquals("z", inner.joinId());
        assertEquals(new RuleStep("z", "R_Z"), FlowParser.parse(g).tree().root().items().get(1));
    }

    @Test
    void END_로_바로_가는_갈래는_끝내는_갈래이고_빈_갈래로_세지_않는다() {
        // if1 [b1 "X > 0" → end] [그 외 → a] → a → end. 두 갈래가 겹치지 않아 §2.2 5 — END 로 바로 가지 않는 마지막 갈래(그 외)가 이어진다.
        Split s = split(flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "end", 1, "X > 0"), other("bo", "if1", "a"), e("ea", "a", "end"))), 0);
        assertEquals("a", s.joinId());
        assertTrue(s.branches().get(0).ends());
        assertEquals(List.of(), s.branches().get(0).body().items());
        assertFalse(s.branches().get(1).ends());
        assertEquals(List.of(), s.branches().get(1).body().items());
    }

    @Test
    void 몸_있는_끝내는_갈래_여럿과_이어지는_갈래_둘이면_이어지는_갈래가_처음_만나는_노드가_모이는_자리다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("e1n", "R_E1"), rule("e2n", "R_E2"), rule("a", "R_A"), rule("b", "R_B"),
                        rule("x", "R_X"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "e1n", 1, "X > 1"), br("b2", "if1", "e2n", 2, "X > 2"), br("b3", "if1", "a", 3, "X > 3"),
                        other("bo", "if1", "b"), e("ee1", "e1n", "end"), e("ee2", "e2n", "end"), e("ea", "a", "x"), e("eb", "b", "x"),
                        e("ex", "x", "end")));
        Split s = split(f, 0);
        assertEquals("x", s.joinId());
        assertEquals(List.of(true, true, false, false), s.branches().stream().map(Branch::ends).toList());
        assertEquals(List.of(new RuleStep("e1n", "R_E1")), s.branches().get(0).body().items());
    }

    @Test
    void 모든_갈래가_따로_END_로_가면_실행_순서_마지막의_END_직행_아닌_갈래가_이어진다() {
        // 그 외에 노드가 있으면 그 외가 이어진다(§1 둘째 예).
        Split s1 = split(flow(List.of(start(), ifNode("if1"), rule("r8", "R_L"), rule("r2", "R_M"), end()),
                List.of(e("e0", "start", "if1"), br("e3", "if1", "r8", 1, "PRICE = NULL"), e("e4", "r8", "end"), other("e5", "if1", "r2"),
                        e("e6", "r2", "end"))), 0);
        assertEquals("r2", s1.joinId());
        assertEquals(List.of(true, false), s1.branches().stream().map(Branch::ends).toList());
        // 그 외가 END 로 바로 가면 조건 갈래가 이어진다(N20).
        Split s2 = split(flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), e("ea", "a", "end"))), 0);
        assertEquals("a", s2.joinId());
        assertEquals(List.of(false, true), s2.branches().stream().map(Branch::ends).toList());
    }

    @Test
    void 다른_갈래와_노드를_함께_지나는_갈래는_끝내는_갈래가_아니다() {
        // b1·b2 는 s 를 함께 지난 뒤 END, 그 외는 c → END 따로(N24).
        Split s = split(flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), rule("s", "R_S"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), br("b2", "if1", "b", 2, "X > 1"), other("bo", "if1", "c"),
                        e("ea", "a", "s"), e("eb", "b", "s"), e("ec", "c", "end"), e("es", "s", "end"))), 0);
        assertEquals("s", s.joinId());
        assertEquals(List.of(false, false, true), s.branches().stream().map(Branch::ends).toList());
    }

    @Test
    void f4_새_형식_IF_의_같은_도착_갈래_선_둘은_거부하고_옛_IF_와_병렬은_받는다() {
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), end()),
                List.of(e("e1", "start", "if1"), br("e2", "if1", "a", 1, "X > 0"), other("e3", "if1", "a"), e("e4", "a", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|if1|e3|IF if1의 갈래 e3가 갈래 e2와 같은 노드 a로 간다. 같은 노드로 가는 갈래는 하나만 둔다"), issues(f));
        FlowDefinition old = flow(List.of(start(), ifNode("if1"), merge("m1", "if1"), end()),
                List.of(e("e1", "start", "if1"), br("e2", "if1", "m1", 1, "X > 0"), other("e3", "if1", "m1"), e("e4", "m1", "end")));
        assertEquals(List.of(), issues(old));
        FlowDefinition par = flow(List.of(start(), par("p1"), merge("pm", "p1"), end()),
                List.of(e("e1", "start", "p1"), pe("e2", "p1", "pm", 1), pe("e3", "p1", "pm", 2), e("e4", "pm", "end")));
        assertEquals(List.of(), issues(par));
    }

    @Test
    void S6_줄기_순환과_모이는_자리_재진입() {
        // if1 [b1 → a → c → a(순환)] [그 외 → b] → b → end: 모이는 자리를 계산하는 줄기가 a 를 두 번 만난다.
        FlowDefinition loop = flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("c", "R_C"), rule("b", "R_B"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"), e("ea", "a", "c"), e("ec", "c", "a"),
                        e("eb", "b", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|a|null|a를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"), issues(loop));
        // r1 → if1 [b1 → a → r1] [그 외 → end]: if1 의 모이는 자리를 계산하다 다시 if1 의 모이는 자리가 필요하다(N7).
        FlowDefinition back = flow(List.of(start(), rule("r1", "R_A"), ifNode("if1"), rule("a", "R_B"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "end"), e("ea", "a", "r1")));
        assertEquals(List.of("FLOW_STRUCTURE|if1|null|if1를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"), issues(back));
    }

    @Test
    void S6_갈래가_다른_갈래_중간_노드로_들어간다() {
        // N5 — 세 갈래가 모두 z 에서 만나고 b1·b2 는 y 를 함께 지난다: b2 가 이미 지난 y 를 다시 만난다.
        FlowDefinition f = flow(List.of(start(), ifNode("if1"), rule("a", "A"), rule("b", "B"), rule("c", "C"), rule("y", "D"), rule("z", "E"), end()),
                List.of(e("e1", "start", "if1"), br("b1", "if1", "a", 1, "X > 1"), br("b2", "if1", "b", 2, "X > 2"), other("bo", "if1", "c"),
                        e("ea", "a", "y"), e("eb", "b", "y"), e("ec", "c", "z"), e("ey", "y", "z"), e("ez", "z", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|y|null|y를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다"), issues(f));
    }

    // ── 돌아오는 자리(implicit-join spec §2.3) ──

    @Test
    void 처리_갈래가_룰_바로_뒤_노드나_정상_경로_중간_노드로_돌아온다() {
        FlowParse p = FlowParser.parse(flow(List.of(start(), rule("r1", "R_G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_H"), rule("n", "R_F"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n"), e("e3", "c1", "h"), e("e4", "h", "n"), e("e5", "n", "end"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals("n", g.joinId());
        assertNull(g.mergeId());
        assertEquals(List.of(), g.normal().items());
        assertEquals(new Guarded.Handler("c1", List.of(CatchKind.NO_RESULT), new Seq(List.of(new RuleStep("h", "R_H"))), false), g.handlers().get(0));
        assertEquals(new RuleStep("n", "R_F"), p.tree().root().items().get(1));
        FlowParse mid = FlowParser.parse(flow(List.of(start(), rule("r1", "R_G"), rule("n1", "R_K"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "R_H"),
                        rule("n2", "R_F"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "n2"), e("e4", "c1", "h"), e("e5", "h", "n2"), e("e6", "n2", "end"))));
        Guarded gm = (Guarded) mid.tree().root().items().get(0);
        assertEquals("n2", gm.joinId());
        assertEquals(List.of(new RuleStep("n1", "R_K")), gm.normal().items());
    }

    @Test
    void S7_두_처리_갈래가_서로_다른_노드로_돌아온다() {
        FlowDefinition f = flow(List.of(start(), rule("r1", "A"), rule("x", "B"), rule("y", "C"), catchNode("c1", "r1", "NO_RESULT"), rule("h1", "D"),
                        catchNode("c2", "r1", "EVAL_ERROR"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "x"), e("e3", "x", "y"), e("e4", "y", "end"), e("e5", "c1", "h1"), e("e6", "h1", "x"),
                        e("e7", "c2", "y")));
        assertEquals(List.of("FLOW_STRUCTURE|c2|null|r1의 처리 갈래 c2가 y로 돌아온다. 앞 처리 갈래 c1처럼 x로 돌아와야 한다"), issues(f));
    }

    @Test
    void S8_처리_갈래가_정상_갈래_노드로_들어가면_방문_검사보다_먼저_멈춘다() {
        // c1 → if1 [b1 → h1 → n1] [그 외 → h2 → n2]: if1 의 갈래는 n2 에서 만나 돌아오는 자리는 n2, 그런데 b1 은 정상 갈래 노드 n1 을 지난다.
        FlowDefinition f = flow(List.of(start(), rule("r1", "A"), rule("n1", "B"), rule("n2", "C"), catchNode("c1", "r1", "NO_RESULT"), ifNode("if1"),
                        rule("h1", "D"), rule("h2", "E"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "n1"), e("e3", "n1", "n2"), e("e4", "n2", "end"), e("e5", "c1", "if1"),
                        br("b1", "if1", "h1", 1, "X > 0"), other("bo", "if1", "h2"), e("e6", "h1", "n1"), e("e7", "h2", "n2")));
        assertEquals(List.of("FLOW_STRUCTURE|n1|null|처리 갈래 c1가 r1의 정상 갈래 노드 n1로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다"),
                issues(f));
    }

    @Test
    void S9_셋째_문구와_정상_갈래가_병렬을_넘어_END_로_빠지는_S5() {
        // N25 — 처리 갈래가 아직 지나지 않은 다른 병렬의 합류 pm3 을 지나 돌아오는 자리 j 로 가려 한다.
        FlowDefinition s9 = flow(List.of(start(), ifNode("if1"), rule("r1", "A"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "B"), par("p3"),
                        rule("a", "C"), merge("pm3", "p3"), rule("j", "D"), end()),
                List.of(e("e1", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "p3"), e("e2", "r1", "j"), e("ec", "c1", "h"),
                        e("eh", "h", "pm3"), pe("pa", "p3", "a", 1), pe("pb", "p3", "pm3", 2), e("ea", "a", "pm3"), e("ep", "pm3", "j"), e("ej", "j", "end")));
        assertEquals(List.of("FLOW_STRUCTURE|pm3|null|처리 갈래 c1가 돌아올 자리 j나 끝에 닿지 않고 pm3로 나간다"), issues(s9));
        // N16 — 처리 갈래가 병렬 합류 pm 으로 돌아온다(J = pm). 정상 갈래는 병렬을 한 칸으로 넘어 pm 에 닿지 않고 END 로 빠진다.
        FlowDefinition s5 = flow(List.of(start(), rule("r1", "A"), par("p1"), rule("a", "B"), rule("b", "C"), merge("pm", "p1"), rule("x", "D"),
                        catchNode("c1", "r1", "NO_RESULT"), rule("h", "E"), end()),
                List.of(e("e1", "start", "r1"), e("e2", "r1", "p1"), pe("pa", "p1", "a", 1), pe("pb", "p1", "b", 2), e("ea", "a", "pm"), e("eb", "b", "pm"),
                        e("ep", "pm", "x"), e("ex", "x", "end"), e("ec", "c1", "h"), e("eh", "h", "pm")));
        assertEquals(List.of("FLOW_STRUCTURE|end|null|갈래가 pm에서 닫히지 않고 end로 나간다"), issues(s5));
    }

    @Test
    void 돌아오는_자리가_IF_모이는_자리이거나_병렬_합류여도_받는다() {
        // N13 — r1 은 if1 의 b1 갈래 안, c1 → h → j(= if1 의 모이는 자리).
        Split s = split(flow(List.of(start(), ifNode("if1"), rule("r1", "G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "H"), rule("x", "K"),
                        rule("j", "F"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "r1", 1, "X > 0"), other("bo", "if1", "x"), e("e2", "r1", "j"), e("ec", "c1", "h"),
                        e("eh", "h", "j"), e("ex", "x", "j"), e("ej", "j", "end"))), 0);
        assertEquals("j", s.joinId());
        assertEquals("j", ((Guarded) s.branches().get(0).body().items().get(0)).joinId());
        // N14 — 병렬 갈래 안 r1 의 처리 갈래가 병렬 합류 pm 으로 돌아온다.
        Split p = split(flow(List.of(start(), par("p1"), rule("r1", "G"), catchNode("c1", "r1", "NO_RESULT"), rule("h", "H"), rule("y", "K"),
                        merge("pm", "p1"), rule("z", "F"), end()),
                List.of(e("e0", "start", "p1"), pe("pa", "p1", "r1", 1), pe("pb", "p1", "y", 2), e("e2", "r1", "pm"), e("ec", "c1", "h"),
                        e("eh", "h", "pm"), e("ey", "y", "pm"), e("ep", "pm", "z"), e("ez", "z", "end"))), 0);
        Guarded g = (Guarded) p.branches().get(0).body().items().get(0);
        assertEquals("pm", g.joinId());
        assertNull(g.mergeId());
    }

    @Test
    void 빈_단계에도_받는_노드를_붙이고_TaskStep_블록이_된다() {
        FlowParse p = FlowParser.parse(flow(List.of(start(), task("t1"), catchNode("c1", "t1", "NO_RESULT"), rule("h", "H"),
                        catchNode("c2", "t1", "EVAL_ERROR"), rule("n", "F"), end()),
                List.of(e("e1", "start", "t1"), e("e2", "t1", "n"), e("e3", "c1", "h"), e("e4", "h", "n"), e("e5", "c2", "end"), e("e6", "n", "end"))));
        assertEquals(List.of(), p.issues());
        Guarded g = (Guarded) p.tree().root().items().get(0);
        assertEquals(new TaskStep("t1"), g.step());
        assertEquals("n", g.joinId());
        assertTrue(g.handlers().get(1).ends());
        assertEquals(List.of("H", "F"), p.tree().ruleIds());
    }
}
