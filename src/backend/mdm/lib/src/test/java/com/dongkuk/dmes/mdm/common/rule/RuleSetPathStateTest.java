package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleSetPathState.At;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import org.junit.jupiter.api.Test;

/**
 * 2단계 계획 P4 — {@link RuleSetPathState#before} 가 RULE 노드마다 "그 노드를 처리하기 전" 경로 상태를 적는다. 순차·IF·PARALLEL·중첩 IF 와 받는 룰(정상·처리 갈래, 중첩 처리 갈래) 사례.
 * 룰 X 가 만드는 이름은 {@code PRODUCES} 표로 준다.
 */
class RuleSetPathStateTest {

    private static final Map<String, Set<String>> PRODUCES = Map.of(
            "R_P", Set.of("X"),
            "R_A", Set.of("Y", "Z"),
            "R_B", Set.of("Y"),
            "R_C", Set.of(),
            "R_D", Set.of("W"),
            "R_E", Set.of("X"),
            "R_Z", Set.of("Z"));

    private static Map<String, At> before(String nodes, String edges) {
        String json = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"}," + nodes + ",{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[" + edges + "]}";
        FlowParse p = FlowParser.parse(RuleSetFlowJson.parse(json));
        assertTrue(p.issues().isEmpty(), p.issues().toString());
        FlowTree tree = p.tree();
        return RuleSetPathState.before(tree, id -> PRODUCES.getOrDefault(id, Set.of()));
    }

    private static String rule(String node, String ruleId) {
        return "{\"id\":\"" + node + "\",\"kind\":\"RULE\",\"ruleId\":\"" + ruleId + "\"}";
    }

    private static String split(String node, String kind) {
        return "{\"id\":\"" + node + "\",\"kind\":\"" + kind + "\"}";
    }

    private static String merge(String node, String splitId) {
        return "{\"id\":\"" + node + "\",\"kind\":\"MERGE\",\"splitId\":\"" + splitId + "\"}";
    }

    private static final List<String> EDGES = new ArrayList<>();

    /** 선 — extra 는 order·cond·otherwise 조각(없으면 빈 문자열). id 는 호출 순서로 매긴다. */
    private static String edge(String from, String to, String extra) {
        EDGES.add(from);
        return "{\"id\":\"e" + EDGES.size() + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"" + (extra.isEmpty() ? "" : "," + extra) + "}";
    }

    private static At at(Set<String> defined, Set<String> maybe) {
        return new At(defined, maybe);
    }

    @Test
    void 순차_흐름은_앞_룰이_만든_이름이_차례로_defined_에_쌓인다() {
        EDGES.clear();
        String e = String.join(",", edge("start", "r1", ""), edge("r1", "r2", ""), edge("r2", "r3", ""), edge("r3", "end", ""));
        Map<String, At> b = before(String.join(",", rule("r1", "R_P"), rule("r2", "R_B"), rule("r3", "R_C")), e);

        assertEquals(List.of("r1", "r2", "r3"), List.copyOf(b.keySet()), "깊이 우선 순서");
        assertEquals(at(Set.of(), Set.of()), b.get("r1"));
        assertEquals(at(Set.of("X"), Set.of()), b.get("r2"));
        assertEquals(at(Set.of("X", "Y"), Set.of()), b.get("r3"));
    }

    @Test
    void IF_갈래는_분기_직전_상태에서_시작하고_합류_뒤는_교집합이_defined_나머지는_maybe_다() {
        EDGES.clear();
        String e = String.join(",", edge("start", "r0", ""), edge("r0", "if1", ""), edge("if1", "r1", "\"order\":1,\"cond\":\"X > 0\""),
                edge("if1", "r2", "\"otherwise\":true"), edge("r1", "m1", ""), edge("r2", "m1", ""), edge("m1", "r3", ""), edge("r3", "end", ""));
        Map<String, At> b = before(String.join(",", rule("r0", "R_P"), split("if1", "IF"), rule("r1", "R_A"), rule("r2", "R_B"), merge("m1", "if1"),
                rule("r3", "R_C")), e);

        assertEquals(at(Set.of(), Set.of()), b.get("r0"));
        assertEquals(at(Set.of("X"), Set.of()), b.get("r1"));
        assertEquals(at(Set.of("X"), Set.of()), b.get("r2"), "형제 갈래(r1)의 결과는 보이지 않는다");
        assertEquals(at(Set.of("X", "Y"), Set.of("Z")), b.get("r3"), "Y 는 두 갈래 모두, Z 는 r1 갈래에서만");
    }

    @Test
    void PARALLEL_갈래는_서로의_결과를_보지_못하고_합류_뒤는_합집합이_defined_다() {
        EDGES.clear();
        String e = String.join(",", edge("start", "p1", ""), edge("p1", "r1", "\"order\":1"), edge("p1", "r2", "\"order\":2"), edge("r1", "m1", ""),
                edge("r2", "m1", ""), edge("m1", "r3", ""), edge("r3", "end", ""));
        Map<String, At> b = before(String.join(",", split("p1", "PARALLEL"), rule("r1", "R_B"), rule("r2", "R_Z"), merge("m1", "p1"), rule("r3", "R_C")), e);

        assertEquals(at(Set.of(), Set.of()), b.get("r1"));
        assertEquals(at(Set.of(), Set.of()), b.get("r2"), "병렬 형제(r1)의 Y 는 보이지 않는다");
        assertEquals(at(Set.of("Y", "Z"), Set.of()), b.get("r3"));
    }

    @Test
    void IF_안_IF_는_안쪽_합류의_maybe_가_바깥_합류까지_이어진다() {
        EDGES.clear();
        // start → if1 { e: r1(R_P:X) → if2 { e: r2(R_B:Y) ; else: r3(R_Z:Z) } → m2 → r4(R_D:W) ; else: r5(R_E:X) } → m1 → r6 → end
        String e = String.join(",", edge("start", "if1", ""), edge("if1", "r1", "\"order\":1,\"cond\":\"A > 0\""), edge("if1", "r5", "\"otherwise\":true"),
                edge("r1", "if2", ""), edge("if2", "r2", "\"order\":1,\"cond\":\"X > 0\""), edge("if2", "r3", "\"otherwise\":true"), edge("r2", "m2", ""),
                edge("r3", "m2", ""), edge("m2", "r4", ""), edge("r4", "m1", ""), edge("r5", "m1", ""), edge("m1", "r6", ""), edge("r6", "end", ""));
        Map<String, At> b = before(String.join(",", split("if1", "IF"), rule("r1", "R_P"), split("if2", "IF"), rule("r2", "R_B"), rule("r3", "R_Z"),
                merge("m2", "if2"), rule("r4", "R_D"), rule("r5", "R_E"), merge("m1", "if1"), rule("r6", "R_C")), e);

        assertEquals(List.of("r1", "r2", "r3", "r4", "r5", "r6"), List.copyOf(b.keySet()), "깊이 우선 순서");
        assertEquals(at(Set.of(), Set.of()), b.get("r1"));
        assertEquals(at(Set.of("X"), Set.of()), b.get("r2"));
        assertEquals(at(Set.of("X"), Set.of()), b.get("r3"));
        assertEquals(at(Set.of("X"), Set.of("Y", "Z")), b.get("r4"));
        assertEquals(at(Set.of(), Set.of()), b.get("r5"), "바깥 IF 의 다른 갈래는 첫 갈래 결과를 보지 못한다");
        assertEquals(at(Set.of("X"), Set.of("Y", "Z", "W")), b.get("r6"), "X 는 두 갈래 모두, W 는 첫 갈래에서만, 안쪽 maybe 는 그대로");
    }

    private static String catchNode(String node, String attachTo, String kinds) {
        return "{\"id\":\"" + node + "\",\"kind\":\"CATCH\",\"attachTo\":\"" + attachTo + "\",\"catches\":[" + kinds + "]}";
    }

    private static final Set<String> CATCH = ReservedNames.CATCH_NAMES;

    @Test
    void 받는_룰_처리_갈래는_룰_직전_상태에_CATCH_를_더해_시작하고_합류_뒤는_교집합이다() {
        EDGES.clear();
        // start → r1(R_A: Y,Z) → mr → r3(R_C) → end. c1 → r2(R_B: Y) → mr, c2 → end(끝냄 — 세지 않는다).
        String e = String.join(",", edge("start", "r1", ""), edge("r1", "mr", ""), edge("c1", "r2", ""), edge("r2", "mr", ""), edge("c2", "end", ""),
                edge("mr", "r3", ""), edge("r3", "end", ""));
        Map<String, At> b = before(String.join(",", rule("r1", "R_A"), catchNode("c1", "r1", "\"NO_RESULT\""), rule("r2", "R_B"),
                catchNode("c2", "r1", "\"EVAL_ERROR\""), merge("mr", "r1"), rule("r3", "R_C")), e);

        assertEquals(List.of("r1", "r2", "r3"), List.copyOf(b.keySet()));
        assertEquals(at(Set.of(), Set.of()), b.get("r1"));
        assertEquals(at(CATCH, Set.of()), b.get("r2"), "실패한 룰 결과(Y,Z)는 없다");
        assertEquals(at(Set.of("Y"), Set.of("Z")), b.get("r3"), "Y 는 정상·돌아오는 처리 갈래 모두, Z 는 정상 갈래에서만");
    }

    @Test
    void 받는_룰_정상_갈래_룰도_적고_룰_결과_뒤에서_시작한다() {
        EDGES.clear();
        // start → r1(R_P: X) → r2(R_B: Y) → mr → end. c1 → r3(R_D: W) → mr.
        String e = String.join(",", edge("start", "r1", ""), edge("r1", "r2", ""), edge("r2", "mr", ""), edge("c1", "r3", ""), edge("r3", "mr", ""),
                edge("mr", "end", ""));
        Map<String, At> b = before(String.join(",", rule("r1", "R_P"), rule("r2", "R_B"), catchNode("c1", "r1", "\"INPUT_ERROR\""), rule("r3", "R_D"),
                merge("mr", "r1")), e);

        assertEquals(List.of("r1", "r2", "r3"), List.copyOf(b.keySet()), "받는 룰 → 정상 갈래 → 처리 갈래");
        assertEquals(at(Set.of("X"), Set.of()), b.get("r2"));
        assertEquals(at(CATCH, Set.of()), b.get("r3"));
    }

    @Test
    void 중첩_처리_갈래는_안쪽_합류_뒤에도_바깥_CATCH_가_남는다() {
        EDGES.clear();
        // start → r1(R_P: X) → m1 → end. c1(r1) → r2(R_B: Y) → m2 → r4(R_C) → m1. c2(r2) → r3(R_C) → m2.
        String e = String.join(",", edge("start", "r1", ""), edge("r1", "m1", ""), edge("c1", "r2", ""), edge("r2", "m2", ""), edge("c2", "r3", ""),
                edge("r3", "m2", ""), edge("m2", "r4", ""), edge("r4", "m1", ""), edge("m1", "end", ""));
        Map<String, At> b = before(String.join(",", rule("r1", "R_P"), catchNode("c1", "r1", "\"NO_RESULT\""), rule("r2", "R_B"),
                catchNode("c2", "r2", "\"NO_RESULT\""), rule("r3", "R_C"), merge("m2", "r2"), rule("r4", "R_C"), merge("m1", "r1")), e);

        assertEquals(List.of("r1", "r2", "r3", "r4"), List.copyOf(b.keySet()));
        assertEquals(at(CATCH, Set.of()), b.get("r2"));
        assertEquals(at(CATCH, Set.of()), b.get("r3"), "안쪽 처리 갈래 — 바깥 CATCH_* 위에 다시 CATCH_*, R_B 결과 Y 는 없다");
        assertEquals(at(CATCH, Set.of("Y")), b.get("r4"), "안쪽 합류 뒤 — 바깥 CATCH_* 는 남고 Y 는 정상 갈래에서만");
    }

    @Test
    void 적은_상태는_사본이라_바꿀_수_없다() {
        EDGES.clear();
        String e = String.join(",", edge("start", "r1", ""), edge("r1", "r2", ""), edge("r2", "end", ""));
        Map<String, At> b = before(String.join(",", rule("r1", "R_P"), rule("r2", "R_B")), e);

        assertEquals(Set.of(), b.get("r1").defined(), "r1 을 적은 뒤 r1 의 결과를 더해도 r1 직전 상태는 그대로다");
        assertThrows(UnsupportedOperationException.class, () -> b.get("r2").defined().add("Q"));
    }

    @Test
    void 끝내는_IF_갈래는_블록_뒤_상태에_들지_않는다() {
        EDGES.clear();
        // start → if1 [b1 "X > 0" → r1(R_A) → end](끝내는 갈래) [그 외 → r2(R_B)] → r2 → r3 → end
        String e = String.join(",", edge("start", "if1", ""), edge("if1", "r1", "\"order\":1,\"cond\":\"X > 0\""), edge("if1", "r2", "\"otherwise\":true"),
                edge("r1", "end", ""), edge("r2", "r3", ""), edge("r3", "end", ""));
        Map<String, At> b = before(String.join(",", split("if1", "IF"), rule("r1", "R_A"), rule("r2", "R_B"), rule("r3", "R_C")), e);

        assertEquals(at(Set.of(), Set.of()), b.get("r1"));
        assertEquals(at(Set.of(), Set.of()), b.get("r2"), "끝내는 갈래(r1)의 Y·Z 는 블록 뒤에 없다");
        assertEquals(at(Set.of("Y"), Set.of()), b.get("r3"));
    }
}
