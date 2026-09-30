package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/** 흐름 JSON 코덱(spec §3.3, 계획 C6) — kind·otherwise 키, view 무시, 형식 오류 문구, 펼친 룰 목록. */
class RuleSetFlowJsonTest {

    static final String IF_FLOW = """
            {"version":1,
             "nodes":[{"id":"start","kind":"START"},{"id":"if1","kind":"IF","label":"주문 유형"},
                      {"id":"r1","kind":"RULE","ruleId":"A"},{"id":"r2","kind":"RULE","ruleId":"B"},
                      {"id":"m1","kind":"MERGE","splitId":"if1"},{"id":"r3","kind":"RULE","ruleId":"A"},{"id":"end","kind":"END"}],
             "edges":[{"id":"e1","from":"start","to":"if1"},
                      {"id":"e2","from":"if1","to":"r1","order":1,"cond":"X > 1","label":"크다"},
                      {"id":"e3","from":"if1","to":"r2","otherwise":true},
                      {"id":"e4","from":"r1","to":"m1"},{"id":"e5","from":"r2","to":"m1"},
                      {"id":"e6","from":"m1","to":"r3"},{"id":"e7","from":"r3","to":"end"}],
             "view":{"positions":{"start":{"x":0,"y":0}}}}
            """;

    @Test
    void 노드_종류와_선_필드를_읽고_view_는_무시한다() {
        FlowDefinition f = RuleSetFlowJson.parse(IF_FLOW);
        assertEquals(1, f.version());
        assertEquals(7, f.nodes().size());
        assertEquals(NodeKind.IF, f.nodes().get(1).kind());
        assertEquals("주문 유형", f.nodes().get(1).label());
        assertEquals("if1", f.nodes().get(4).splitId());
        FlowEdge e2 = f.edges().get(1);
        assertEquals(1, e2.order());
        assertEquals("X > 1", e2.cond());
        assertFalse(e2.otherwise());
        FlowEdge e3 = f.edges().get(2);
        assertTrue(e3.otherwise());
        assertNull(e3.order());
        assertNull(e3.cond());
    }

    @Test
    void 펼친_룰_목록은_깊이_우선_중복_없음이고_분기_여부를_안다() {
        FlowDefinition f = RuleSetFlowJson.parse(IF_FLOW);
        assertEquals(List.of("A", "B"), RuleSetFlowJson.ruleIds(f));
        assertTrue(RuleSetFlowJson.branched(f));
        assertFalse(RuleSetFlowJson.branched(kr.dongkuk.maru.mdm.engine.flow.FlowParser.linear(List.of("A", "B"))));
    }

    @Test
    void 구조_오류로_트리가_없으면_노드_배열_순서의_룰_ID_다() {
        String noElse = IF_FLOW.replace("{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true}",
                "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r2\",\"order\":2,\"cond\":\"X > 2\"}");
        assertEquals(List.of("A", "B"), RuleSetFlowJson.ruleIds(RuleSetFlowJson.parse(noElse)));
    }

    @Test
    void 노드_ID_가_겹치면_첫_노드만_룰_목록에_넣는다() {
        String dup = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"A\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"B\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}";
        assertEquals(List.of("A"), RuleSetFlowJson.ruleIds(RuleSetFlowJson.parse(dup)));
    }

    @Test
    void 맵과_문자열이_같은_정의가_되고_write_는_view_를_남긴다() {
        Map<String, Object> m = RuleSetFlowJson.toMap(IF_FLOW);
        assertEquals(RuleSetFlowJson.parse(IF_FLOW), RuleSetFlowJson.fromMap(m));
        assertTrue(RuleSetFlowJson.write(m).contains("\"positions\""));
    }

    @Test
    void 형식이_틀리면_한국어_문구로_거부한다() {
        assertEquals("흐름은 JSON 객체여야 한다", assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse("[]")).getMessage());
        assertEquals("흐름 형식 버전 2 는 읽지 못한다(1 만 받는다)",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse("{\"version\":2,\"nodes\":[],\"edges\":[]}")).getMessage());
        assertEquals("노드 종류 LOOP 를 모른다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[{\"id\":\"x\",\"kind\":\"LOOP\"}],\"edges\":[]}")).getMessage());
        assertEquals("nodes[0].id 가 없다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[{\"kind\":\"START\"}],\"edges\":[]}")).getMessage());
        assertEquals("edges[0].to 가 없다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[],\"edges\":[{\"id\":\"e1\",\"from\":\"a\"}]}")).getMessage());
    }

    @Test
    void nodes_edges_가_배열이_아니거나_빠지면_형식_오류다() {
        assertEquals("흐름의 nodes 는 배열이어야 한다",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse("{\"version\":1,\"edges\":[]}")).getMessage());
        assertEquals("흐름의 nodes 는 배열이어야 한다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":{\"id\":\"start\",\"kind\":\"START\"},\"edges\":[]}")).getMessage());
        assertEquals("흐름의 edges 는 배열이어야 한다",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[]}")).getMessage());
        assertEquals("흐름의 edges 는 배열이어야 한다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[],\"edges\":{\"id\":\"e1\",\"from\":\"a\",\"to\":\"b\"}}")).getMessage());
        assertEquals("흐름의 edges 는 배열이어야 한다",
                assertThrows(IllegalArgumentException.class,
                        () -> RuleSetFlowJson.fromMap(Map.of("version", 1, "nodes", List.of(), "edges", "e1"))).getMessage());
    }
}
