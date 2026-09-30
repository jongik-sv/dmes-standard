package kr.dongkuk.maru.mdm.engine.flow;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.br;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
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
                "FLOW_STRUCTURE|a|null|a의 들어오는 선이 0개다. 1개여야 한다",
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
    void f1_f2_짝_분기가_없는_합류와_합류가_없는_분기() {
        FlowDefinition f = line(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), merge("m1", null), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "b"),
                        e("ea", "a", "m1"), e("eb", "b", "m1"), e("ee", "m1", "end")));
        assertEquals(List.of(
                "FLOW_STRUCTURE|m1|null|합류 m1의 짝 분기 -가 없다",
                "FLOW_STRUCTURE|if1|null|분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"), issues(f));
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
                "FLOW_STRUCTURE|if1|null|분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다",
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
        assertEquals(List.of("FLOW_STRUCTURE|m1|null|m1를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다"), issues(f));
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
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null));
        for (int i = 1; i <= depth; i++) {
            nodes.add(new FlowNode("if" + i, NodeKind.IF, null, null, null));
            nodes.add(new FlowNode("m" + i, NodeKind.MERGE, null, "if" + i, null));
        }
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null));
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
}
