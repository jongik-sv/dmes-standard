package kr.dongkuk.maru.mdm.engine.testsupport;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/** 흐름 정의 조립 도우미(plan Task 4). 표본 흐름의 룰 ID 는 R_A·R_B·R_C 다. */
public final class FlowFixtures {

    private FlowFixtures() {}

    public static FlowNode start() {
        return new FlowNode("start", NodeKind.START, null, null, null, null, null);
    }

    public static FlowNode end() {
        return new FlowNode("end", NodeKind.END, null, null, null, null, null);
    }

    public static FlowNode rule(String id, String ruleId) {
        return new FlowNode(id, NodeKind.RULE, ruleId, null, null, null, null);
    }

    public static FlowNode ifNode(String id) {
        return new FlowNode(id, NodeKind.IF, null, null, null, null, null);
    }

    public static FlowNode par(String id) {
        return new FlowNode(id, NodeKind.PARALLEL, null, null, null, null, null);
    }

    public static FlowNode merge(String id, String splitId) {
        return new FlowNode(id, NodeKind.MERGE, null, splitId, null, null, null);
    }

    /** 빈 단계(TASK, 4단계 spec §1.1). */
    public static FlowNode task(String id) {
        return new FlowNode(id, NodeKind.TASK, null, null, "빈 단계", null, null);
    }

    /** 분기 밖 보통 선. */
    public static FlowEdge e(String id, String from, String to) {
        return new FlowEdge(id, from, to, null, null, false, null);
    }

    /** IF 갈래 선. */
    public static FlowEdge br(String id, String from, String to, int order, String cond) {
        return new FlowEdge(id, from, to, order, cond, false, null);
    }

    /** IF 의 "그 외" 선. */
    public static FlowEdge other(String id, String from, String to) {
        return new FlowEdge(id, from, to, null, null, true, null);
    }

    /** 병렬 갈래 선. */
    public static FlowEdge pe(String id, String from, String to, int order) {
        return new FlowEdge(id, from, to, order, null, false, null);
    }

    public static FlowDefinition flow(List<FlowNode> nodes, List<FlowEdge> edges) {
        return new FlowDefinition(1, List.copyOf(nodes), List.copyOf(edges));
    }

    /** start → if1 [b1 "X > 10" → a(R_A)] [b2 "X > 0" → b(R_B)] [그 외 bo → c(R_C)] → m1 → end. */
    public static FlowDefinition ifFlow() {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), merge("m1", "if1"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"),
                        other("bo", "if1", "c"), e("ea", "a", "m1"), e("eb", "b", "m1"), e("ec", "c", "m1"), e("ee", "m1", "end")));
    }

    /** start → p1 [p1a 1 → a(R_A)] [p1b 2 → b(R_B)] → pm → c(R_C) → end. */
    public static FlowDefinition parFlow() {
        return flow(List.of(start(), par("p1"), rule("a", "R_A"), rule("b", "R_B"), merge("pm", "p1"), rule("c", "R_C"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "a", 1), pe("p1b", "p1", "b", 2), e("ea", "a", "pm"),
                        e("eb", "b", "pm"), e("ep", "pm", "c"), e("ec", "c", "end")));
    }

    /** 받는 노드(받는 노드 spec §2). kinds 는 저장 키(CatchKind 이름). */
    public static FlowNode catchNode(String id, String attachTo, String... kinds) {
        return new FlowNode(id, NodeKind.CATCH, null, null, null, attachTo, List.of(kinds));
    }

    /** 받는 룰로 돌아오는 합류 — splitId 가 룰 노드 ID 다. */
    public static FlowNode guardMerge(String id, String ruleNodeId) {
        return new FlowNode(id, NodeKind.MERGE, null, ruleNodeId, null, null, null);
    }

    /** start → p1 [p1a 1 → if1(b1 "X > 0" → a(R_A), 그 외 bo → 빈 갈래) → m1] [p1b 2 → b(R_B)] → pm → end. */
    public static FlowDefinition nestedFlow() {
        return flow(List.of(start(), par("p1"), ifNode("if1"), rule("a", "R_A"), merge("m1", "if1"), rule("b", "R_B"), merge("pm", "p1"), end()),
                List.of(e("e0", "start", "p1"), pe("p1a", "p1", "if1", 1), pe("p1b", "p1", "b", 2),
                        br("b1", "if1", "a", 1, "X > 0"), other("bo", "if1", "m1"), e("ea", "a", "m1"),
                        e("em", "m1", "pm"), e("eb", "b", "pm"), e("ee", "pm", "end")));
    }

    /** 새 형식 IF(implicit-join spec §1) — start → if1 [b1 "X > 10" → a(R_A)] [b2 "X > 0" → b(R_B)] [그 외 bo → c(R_C)] → j(빈 단계) → end. */
    public static FlowDefinition ifFlowNew() {
        return flow(List.of(start(), ifNode("if1"), rule("a", "R_A"), rule("b", "R_B"), rule("c", "R_C"), task("j"), end()),
                List.of(e("e0", "start", "if1"), br("b1", "if1", "a", 1, "X > 10"), br("b2", "if1", "b", 2, "X > 0"), other("bo", "if1", "c"),
                        e("ea", "a", "j"), e("eb", "b", "j"), e("ec", "c", "j"), e("ej", "j", "end")));
    }
}
