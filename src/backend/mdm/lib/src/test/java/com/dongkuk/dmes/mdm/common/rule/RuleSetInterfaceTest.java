package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import org.junit.jupiter.api.Test;

/**
 * 하위 세트 spec §2 — 겉모양(입력·최종 결과·always·endsEarly). always 는 루트 끝 상태와 모든 끝냄 지점(끝내는 처리 갈래·끝내는 IF 갈래)의 교집합
 * (Ruling 16), endsEarly 는 처리 갈래가 END 로 가거나 처리 갈래 안 IF 갈래가 END 로 갈 때만(편차 10). 엔진 SetShape 와 같은 알고리즘(편차 8).
 */
class RuleSetInterfaceTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static RuleIo rule(String id, List<String> conds, List<String> results) {
        return RuleSetCorpusTest.rule(id, json(conds, results));
    }

    private static JsonNode json(List<String> conds, List<String> results) {
        ObjectNode n = JSON.createObjectNode();
        n.put("exists", true);
        n.put("status", "INUSE");
        n.put("releasedVer", "1.000");
        ArrayNode cs = n.putArray("conds");
        conds.forEach(c -> cs.addObject().put("name", c).put("source", "NONE"));
        ArrayNode rs = n.putArray("results");
        results.forEach(r -> rs.addObject().put("name", r));
        return n;
    }

    private static FlowDefinition flow(String nodes, String edges) {
        return RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[" + nodes + "],\"edges\":[" + edges + "]}");
    }

    private static String node(String id, String kind) {
        return "{\"id\":\"" + id + "\",\"kind\":\"" + kind + "\"}";
    }

    private static String ruleNode(String id, String ruleId) {
        return "{\"id\":\"" + id + "\",\"kind\":\"RULE\",\"ruleId\":\"" + ruleId + "\"}";
    }

    private static String setNode(String id, String setId) {
        return "{\"id\":\"" + id + "\",\"kind\":\"SET\",\"setId\":\"" + setId + "\"}";
    }

    private static String catchNode(String id, String attachTo, String kind) {
        return "{\"id\":\"" + id + "\",\"kind\":\"CATCH\",\"attachTo\":\"" + attachTo + "\",\"catches\":[\"" + kind + "\"]}";
    }

    private static String edge(String id, String from, String to) {
        return "{\"id\":\"" + id + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\"}";
    }

    private static String branch(String id, String from, String to, String cond) {
        return cond == null ? "{\"id\":\"" + id + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\",\"otherwise\":true}"
                : "{\"id\":\"" + id + "\",\"from\":\"" + from + "\",\"to\":\"" + to + "\",\"order\":1,\"cond\":\"" + cond + "\"}";
    }

    private static List<String> outputs(SetCallIo io) {
        return io.outputs().stream().map(o -> o.name() + ":" + o.always()).toList();
    }

    @Test
    void 앞에서_읽고_뒤에서_만든_이름은_최종_결과이고_만든_뒤_읽힌_이름은_중간_결과() {
        FlowDefinition f = flow(String.join(",", node("start", "START"), ruleNode("a", "C_A"), ruleNode("b", "C_B"), node("end", "END")),
                String.join(",", edge("e1", "start", "a"), edge("e2", "a", "b"), edge("e3", "b", "end")));
        SetCallIo io = RuleSetInterface.of("C", "C 세트", true, "INUSE", f,
                Map.of("C_A", rule("C_A", List.of("Y"), List.of("A")), "C_B", rule("C_B", List.of("A"), List.of("Y"))), Map.of());
        assertEquals(List.of("Y"), io.inputs().stream().map(IoName::name).toList());
        assertEquals(List.of("Y:true"), outputs(io));
        assertEquals("C 세트", io.setName());
        assertTrue(io.exists());
        assertFalse(io.endsEarly());
    }

    @Test
    void IF_한_갈래에서만_만든_출력은_always_가_아니고_손주_세트의_always_false_도_이어진다() {
        // start → if1 [b1 → rp(R_P: P) → j] [그 외 → s1(G: P always, H not always) → j] → j(R_J) → end — 새 형식 IF, 모이는 자리 j
        FlowDefinition f = flow(String.join(",", node("start", "START"), node("if1", "IF"), ruleNode("rp", "R_P"), setNode("s1", "G"), ruleNode("j", "R_J"),
                node("end", "END")),
                String.join(",", edge("e0", "start", "if1"), branch("b1", "if1", "rp", "Y > 0"), branch("bo", "if1", "s1", null), edge("e1", "rp", "j"),
                        edge("e2", "s1", "j"), edge("e3", "j", "end")));
        SetCallIo g = new SetCallIo("G", "G 세트", true, "INUSE", List.of(),
                List.of(new SetCallIo.OutputName("P", null, null, false, null, true), new SetCallIo.OutputName("H", null, null, false, null, false)), false);
        SetCallIo io = RuleSetInterface.of("S", "S 세트", true, "INUSE", f,
                Map.of("R_P", rule("R_P", List.of("Y"), List.of("P")), "R_J", rule("R_J", List.of(), List.of("Z"))), Map.of("G", g));
        assertEquals(List.of("P:true", "H:false", "Z:true"), outputs(io), "P 는 두 갈래 모두에서 반드시 만들어진다(R_P, 손주 G 의 always P)");
        assertEquals(List.of("Y"), io.inputs().stream().map(IoName::name).toList());
    }

    @Test
    void 끝내는_IF_갈래의_끝_상태도_END_지점이라_그_갈래에서_안_만든_출력은_always_가_아니다() {
        // start → if1 [b1 → ra(R_A: A,B) → end](끝내는 갈래) [그 외 → rb] → rb(R_B: A) → end
        FlowDefinition f = flow(String.join(",", node("start", "START"), node("if1", "IF"), ruleNode("ra", "R_A"), ruleNode("rb", "R_B"), node("end", "END")),
                String.join(",", edge("e0", "start", "if1"), branch("b1", "if1", "ra", "X > 0"), branch("bo", "if1", "rb", null), edge("e1", "ra", "end"),
                        edge("e2", "rb", "end")));
        SetCallIo io = RuleSetInterface.of("S", null, true, "INUSE", f,
                Map.of("R_A", rule("R_A", List.of(), List.of("A", "B")), "R_B", rule("R_B", List.of(), List.of("A", "C"))), Map.of());
        assertEquals(List.of("A:true", "B:false", "C:false"), outputs(io), "A 는 두 END 지점 모두, B 는 끝내는 갈래만, C 는 정상 끝만");
        assertFalse(io.endsEarly(), "처리 갈래 밖 끝내는 IF 갈래는 endedBy 를 남기지 않는다(부모에게 정상 완료)");
    }

    @Test
    void 처리_갈래가_END_로_가면_endsEarly_이고_그_끝_상태도_always_교집합에_든다() {
        // start → r1(R_A: A) → r2(R_B: B) → end, c1(r1, INPUT_ERROR) → rc(R_C: B) → end
        FlowDefinition f = flow(String.join(",", node("start", "START"), ruleNode("r1", "R_A"), ruleNode("r2", "R_B"), catchNode("c1", "r1", "INPUT_ERROR"),
                ruleNode("rc", "R_C"), node("end", "END")),
                String.join(",", edge("e1", "start", "r1"), edge("e2", "r1", "r2"), edge("e3", "r2", "end"), edge("e4", "c1", "rc"), edge("e5", "rc", "end")));
        SetCallIo io = RuleSetInterface.of("S", null, true, "INUSE", f, Map.of("R_A", rule("R_A", List.of(), List.of("A")),
                "R_B", rule("R_B", List.of(), List.of("B")), "R_C", rule("R_C", List.of(), List.of("B"))), Map.of());
        assertTrue(io.endsEarly());
        assertEquals(List.of("A:false", "B:true"), outputs(io), "A 는 처리 갈래(룰 실패)에서 없다, B 는 정상 끝·처리 갈래 끝 모두");
    }

    @Test
    void 처리_갈래_안_IF_갈래가_END_로_가면_endsEarly_다() {
        // start → r1(R_A) → n(R_F) → end, c1(r1) → if1 [b1 → e(R_E) → end] [그 외 → h(R_H)] → h → n — 처리 갈래는 n 으로 돌아온다
        FlowDefinition f = flow(String.join(",", node("start", "START"), ruleNode("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), node("if1", "IF"),
                ruleNode("e", "R_E"), ruleNode("h", "R_H"), ruleNode("n", "R_F"), node("end", "END")),
                String.join(",", edge("e1", "start", "r1"), edge("e2", "r1", "n"), edge("e3", "c1", "if1"), branch("b1", "if1", "e", "X > 0"),
                        branch("bo", "if1", "h", null), edge("ee", "e", "end"), edge("eh", "h", "n"), edge("en", "n", "end")));
        SetCallIo io = RuleSetInterface.of("S", null, true, "INUSE", f, Map.of("R_A", rule("R_A", List.of(), List.of("V")),
                "R_E", rule("R_E", List.of(), List.of("Q")), "R_H", rule("R_H", List.of(), List.of("V")), "R_F", rule("R_F", List.of(), List.of("W"))), Map.of());
        assertTrue(io.endsEarly(), "처리 갈래 안 IF 갈래의 끝냄도 endedBy 를 남긴다(J-D18)");
        assertEquals(List.of("V:false", "Q:false", "W:false"), outputs(io), "끝내는 IF 갈래(e) 끝 상태에는 V·W 가 없다");
    }

    @Test
    void 처리_갈래가_돌아오면_endsEarly_가_아니다() {
        // start → r1(R_A) → n(R_F) → end, c1(r1) → h(R_H) → n
        FlowDefinition f = flow(String.join(",", node("start", "START"), ruleNode("r1", "R_A"), catchNode("c1", "r1", "NO_RESULT"), ruleNode("h", "R_H"),
                ruleNode("n", "R_F"), node("end", "END")),
                String.join(",", edge("e1", "start", "r1"), edge("e2", "r1", "n"), edge("e3", "c1", "h"), edge("e4", "h", "n"), edge("e5", "n", "end")));
        SetCallIo io = RuleSetInterface.of("S", null, true, "INUSE", f, Map.of("R_A", rule("R_A", List.of(), List.of("V")),
                "R_H", rule("R_H", List.of(), List.of("V")), "R_F", rule("R_F", List.of("V"), List.of("W"))), Map.of());
        assertFalse(io.endsEarly());
        assertEquals(List.of("W:true"), outputs(io), "V 는 R_F 가 읽어 중간 결과다");
    }

    @Test
    void 입력에서_예약_이름_CATCH_는_뺀다() {
        // start → r1(R_A) → end, c1(r1) → rc(R_C: CATCH_CODE 를 읽는다) → end
        FlowDefinition f = flow(String.join(",", node("start", "START"), ruleNode("r1", "R_A"), catchNode("c1", "r1", "EVAL_ERROR"), ruleNode("rc", "R_C"),
                node("end", "END")),
                String.join(",", edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "c1", "rc"), edge("e4", "rc", "end")));
        SetCallIo io = RuleSetInterface.of("S", null, true, "INUSE", f, Map.of("R_A", rule("R_A", List.of("X"), List.of("A")),
                "R_C", rule("R_C", List.of("catch_code", "X"), List.of("LOG"))), Map.of());
        assertEquals(List.of("X"), io.inputs().stream().map(IoName::name).toList(), "하위 세트 입력은 부모 ctx 에서 CATCH_* 를 뺀 사본이다(편차 11)");
    }

    @Test
    void 없는_세트의_겉모양은_빈_목록이고_겉모양_비교는_이름_타입_always_만_본다() {
        SetCallIo none = RuleSetInterface.of("X", null, false, null, FlowParser.linear(List.of("R_A")), Map.of(), Map.of());
        assertEquals(SetCallIo.missing("X"), none);
        assertFalse(none.exists());
        assertFalse(none.asRuleIo().exists());
        assertNull(none.asRuleIo().releasedVer());
        SetCallIo a = new SetCallIo("S", "S 세트", true, "INUSE", List.of(new IoName("Y", "DICT", "와이", "NUMBER", 0, false, null)),
                List.of(new SetCallIo.OutputName("P", "NUMBER", 0, false, null, true)), false);
        SetCallIo b = new SetCallIo("S", "다른 이름", true, "DEPRECATED", List.of(new IoName("Y", "NONE", "다른 표시명", "NUMBER", 2, false, null)),
                List.of(new SetCallIo.OutputName("P", "NUMBER", 2, false, null, true)), true);
        assertTrue(a.sameShape(b), "이름·출처·표시명·소수 자리·상태·endsEarly 는 보지 않는다");
        SetCallIo c = new SetCallIo("S", "S 세트", true, "INUSE", a.inputs(), List.of(new SetCallIo.OutputName("P", "NUMBER", 0, false, null, false)), false);
        assertFalse(a.sameShape(c), "always 가 바뀌면 다르다");
        RuleIo asRule = a.asRuleIo();
        assertEquals("set:S", asRule.ruleId());
        assertTrue(asRule.exists());
        assertNotNull(asRule.releasedVer(), "분석기는 releasedVer 가 null 이 아닌지만 본다");
        assertEquals(List.of("P"), asRule.results().stream().map(IoName::name).toList());
    }

    @Test
    void 구조_오류_흐름은_노드_배열_순서로_입출력을_세고_always_와_endsEarly_는_모두_false_다() {
        // srv:5 넘김 2 — start → a(R_A: Y → A) → end, s1(G: P always)·b(R_B: A → B) 는 선이 없다(구조 오류 → 트리 없음). 저장 검사가 막는 모양이지만
        // 겉모양 계산은 예외 없이 노드 배열 순서(RuleSetFlowJson.ruleIds 와 같은 규칙)로 세고, 끝 상태를 모르므로 어떤 출력도 always 가 아니다.
        FlowDefinition f = flow(String.join(",", node("start", "START"), ruleNode("a", "R_A"), setNode("s1", "G"), ruleNode("b", "R_B"), node("end", "END")),
                String.join(",", edge("e1", "start", "a"), edge("e2", "a", "end")));
        assertNull(FlowParser.parse(f).tree(), "구조 오류라 트리가 없어야 이 사례가 뜻이 있다");
        SetCallIo g = new SetCallIo("G", "G 세트", true, "INUSE", List.of(), List.of(new SetCallIo.OutputName("P", null, null, false, null, true)), true);
        SetCallIo io = RuleSetInterface.of("S", "S 세트", true, "INUSE", f,
                Map.of("R_A", rule("R_A", List.of("Y"), List.of("A")), "R_B", rule("R_B", List.of("A"), List.of("B"))), Map.of("G", g));
        assertEquals(List.of("Y"), io.inputs().stream().map(IoName::name).toList());
        assertEquals(List.of("P:false", "B:false"), outputs(io), "A 는 R_B 가 읽어 중간 결과");
        assertFalse(io.endsEarly(), "하위 세트 G 의 endsEarly 는 이어지지 않는다");
        assertTrue(io.exists());
    }

    @Test
    void 세트_키는_접두로_룰_ID_와_가른다() {
        assertEquals("set:SP", SetCallIo.key("SP"));
        assertTrue(SetCallIo.isKey("set:SP"));
        assertFalse(SetCallIo.isKey("SP"));
        assertFalse(SetCallIo.isKey(null));
        assertEquals("SP", SetCallIo.idOf("set:SP"));
        assertEquals("R_A", SetCallIo.idOf("R_A"));
    }
}
