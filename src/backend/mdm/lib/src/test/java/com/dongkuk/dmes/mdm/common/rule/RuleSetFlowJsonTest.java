package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

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
    void setIds_는_트리가_있으면_깊이_우선_중복_없이_구조_오류면_노드_순서이고_빈_ID_는_뺀다() {
        String ok = """
                {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"s1","kind":"SET","setId":"B"},{"id":"s2","kind":"SET","setId":"A"},
                 {"id":"s3","kind":"SET","setId":"B"},{"id":"s4","kind":"SET"},{"id":"end","kind":"END"}],
                 "edges":[{"id":"e1","from":"start","to":"s1"},{"id":"e2","from":"s1","to":"s2"},{"id":"e3","from":"s2","to":"s3"},
                 {"id":"e4","from":"s3","to":"s4"},{"id":"e5","from":"s4","to":"end"}]}""";
        assertEquals(List.of("B", "A"), RuleSetFlowJson.setIds(RuleSetFlowJson.parse(ok)));
        String broken = """
                {"version":1,"nodes":[{"id":"s2","kind":"SET","setId":"A"},{"id":"s1","kind":"SET","setId":"B"},{"id":"s9","kind":"SET","setId":" "},
                 {"id":"s1","kind":"SET","setId":"C"},{"id":"r1","kind":"RULE","ruleId":"R"}],"edges":[]}""";
        assertEquals(List.of("A", "B"), RuleSetFlowJson.setIds(RuleSetFlowJson.parse(broken)), "겹친 노드 ID 는 첫 노드만 본다");
        assertEquals(List.of(), RuleSetFlowJson.setIds(RuleSetFlowJson.parse(IF_FLOW)));
    }

    @Test
    void 노드_ID_가_겹치면_첫_노드만_룰_목록에_넣는다() {
        String dup = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"A\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"B\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}";
        assertEquals(List.of("A"), RuleSetFlowJson.ruleIds(RuleSetFlowJson.parse(dup)));
    }

    @Test
    void 형식이_틀리면_한국어_문구로_거부한다() {
        assertEquals("흐름은 JSON 객체여야 한다", assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse("[]")).getMessage());
        assertEquals("흐름 형식 버전은 정수 1 이어야 한다",
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
                        () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[],\"edges\":\"e1\"}")).getMessage());
    }

    private static final String VALID = """
        {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"end","kind":"END"}],
         "edges":[{"id":"e1","from":"start","to":"end"}]}""";

    @ParameterizedTest(name = "{0}")
    @CsvSource(delimiter = '|', textBlock = """
        문자열 버전      | {"version":"1","nodes":[],"edges":[]}                                                     | 흐름 형식 버전은 정수 1 이어야 한다
        실수 버전        | {"version":1.0,"nodes":[],"edges":[]}                                                     | 흐름 형식 버전은 정수 1 이어야 한다
        숫자 노드 id     | {"version":1,"nodes":[{"id":7,"kind":"START"}],"edges":[]}                               | nodes[0].id 는 문자열이어야 한다
        문자열 order     | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","order":"1"}]}            | edges[0].order 는 정수여야 한다
        실수 order       | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","order":1.5}]}            | edges[0].order 는 정수여야 한다
        문자열 otherwise | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","otherwise":"true"}]}     | edges[0].otherwise 는 true/false 여야 한다
        숫자 cond        | {"version":1,"nodes":[],"edges":[{"id":"e1","from":"a","to":"b","cond":3}]}               | edges[0].cond 는 문자열이어야 한다
        배열 view        | {"version":1,"nodes":[],"edges":[],"view":[]}                                             | 흐름의 view 는 객체여야 한다
        객체 아닌 노드   | {"version":1,"nodes":["start"],"edges":[]}                                                | nodes[0] 는 객체여야 한다
        """)
    void 타입이_다른_칸은_조용히_바꾸지_않고_거부한다(String name, String json, String message) {
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(json));
        assertEquals(message, e.getMessage(), name);
    }

    @Test
    void 노드_201개_선_401개_너무_긴_JSON_은_거부한다() {
        String nodes201 = IntStream.range(0, 201).mapToObj(i -> "{\"id\":\"n" + i + "\",\"kind\":\"RULE\",\"ruleId\":\"R\"}")
                .collect(Collectors.joining(","));
        assertEquals("노드가 201개다. 흐름 하나에 200개까지 둔다", assertThrows(IllegalArgumentException.class,
                () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[" + nodes201 + "],\"edges\":[]}")).getMessage());
        String edges401 = IntStream.range(0, 401).mapToObj(i -> "{\"id\":\"e" + i + "\",\"from\":\"a\",\"to\":\"b\"}")
                .collect(Collectors.joining(","));
        assertEquals("선이 401개다. 흐름 하나에 400개까지 둔다", assertThrows(IllegalArgumentException.class,
                () -> RuleSetFlowJson.parse("{\"version\":1,\"nodes\":[],\"edges\":[" + edges401 + "]}")).getMessage());
        String longJson = "{\"version\":1,\"nodes\":[],\"edges\":[],\"view\":{\"pad\":\"" + "x".repeat(RuleSetFlowJson.MAX_JSON_CHARS) + "\"}}";
        assertTrue(assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(longJson)).getMessage()
                .endsWith("자다. 262144자까지 받는다"));
    }

    @Test
    void 정규_JSON_은_모든_칸을_고정_순서로_쓰고_view_를_보존한다() throws Exception {
        String in = """
            {"view":{"positions":{"start":{"x":1,"y":2}},"notes":[],"groups":[]},"edges":[{"to":"end","from":"start","id":"e1"}],
             "nodes":[{"kind":"START","id":"start"},{"kind":"END","id":"end","label":"끝"}],"version":1}""";
        assertEquals("{\"version\":1,"
                + "\"nodes\":[{\"id\":\"start\",\"kind\":\"START\",\"ruleId\":null,\"splitId\":null,\"label\":null},"
                + "{\"id\":\"end\",\"kind\":\"END\",\"ruleId\":null,\"splitId\":null,\"label\":\"끝\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"end\",\"order\":null,\"cond\":null,\"otherwise\":false,\"label\":null}],"
                + "\"view\":{\"positions\":{\"start\":{\"x\":1,\"y\":2}},\"notes\":[],\"groups\":[]}}", RuleSetFlowJson.canonical(in));
        assertTrue(RuleSetFlowJson.canonical(VALID).endsWith("\"view\":{\"positions\":{},\"notes\":[],\"groups\":[]}}"));
    }

    @Test
    void 입력은_상한_안인데_정규화하면_상한을_넘는_흐름은_거부한다() {
        String head = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"end\"}],\"view\":{\"pad\":\"";
        String tail = "\"}}";
        String json = head + "x".repeat(RuleSetFlowJson.MAX_JSON_CHARS - head.length() - tail.length() - 10) + tail;
        assertTrue(json.length() <= RuleSetFlowJson.MAX_JSON_CHARS);
        RuleSetFlowJson.parse(json);
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.canonical(json));
        assertTrue(e.getMessage().startsWith("정규화한 흐름 JSON 이 ") && e.getMessage().endsWith("자다. 262144자까지 받는다"), e.getMessage());
    }

    @Test
    void 받는_노드는_attachTo_catches_를_읽고_정규_JSON_은_CATCH_노드에만_두_칸을_쓴다() {
        String in = """
            {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"r1","kind":"RULE","ruleId":"A"},
             {"id":"c1","kind":"CATCH","attachTo":"r1","catches":["NO_RESULT","BOOM"],"label":"단가 없음"},{"id":"end","kind":"END"}],
             "edges":[{"id":"e1","from":"start","to":"r1"},{"id":"e2","from":"r1","to":"end"},{"id":"e3","from":"c1","to":"end"}]}""";
        FlowDefinition f = RuleSetFlowJson.parse(in);
        assertEquals("r1", f.nodes().get(2).attachTo());
        assertEquals(List.of("NO_RESULT", "BOOM"), f.nodes().get(2).catches());
        assertNull(f.nodes().get(1).attachTo());
        assertNull(f.nodes().get(1).catches());
        String c = RuleSetFlowJson.canonical(in);
        assertTrue(c.contains("{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"A\",\"splitId\":null,\"label\":null},"), c);
        assertTrue(c.contains("{\"id\":\"c1\",\"kind\":\"CATCH\",\"ruleId\":null,\"splitId\":null,\"label\":\"단가 없음\",\"attachTo\":\"r1\",\"catches\":[\"NO_RESULT\",\"BOOM\"]}"), c);
    }

    @Test
    void catches_는_문자열_배열이어야_한다() {
        String bad = """
            {"version":1,"nodes":[{"id":"c1","kind":"CATCH","attachTo":"r1","catches":"NO_RESULT"}],"edges":[]}""";
        assertEquals("nodes[0].catches 는 문자열 배열이어야 한다",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(bad)).getMessage());
        String badItem = """
            {"version":1,"nodes":[{"id":"c1","kind":"CATCH","attachTo":"r1","catches":[1]}],"edges":[]}""";
        assertEquals("nodes[0].catches 는 문자열 배열이어야 한다",
                assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(badItem)).getMessage());
    }

    @Test
    void SET_노드의_setId_를_읽고_정규_JSON_은_SET_노드에만_setId_를_쓴다() {
        String in = """
            {"version":1,"nodes":[{"id":"start","kind":"START"},{"id":"s1","kind":"SET","setId":"QD_S_PRICE","label":"단가 결정"},
             {"id":"end","kind":"END"}],"edges":[{"id":"e1","from":"start","to":"s1"},{"id":"e2","from":"s1","to":"end"}]}""";
        FlowDefinition f = RuleSetFlowJson.parse(in);
        assertEquals("QD_S_PRICE", f.nodes().get(1).setId());
        assertNull(f.nodes().get(0).setId());
        String out = RuleSetFlowJson.canonical(in);
        assertEquals(1, out.split("\"setId\"", -1).length - 1, "setId 는 SET 노드 하나에만 쓴다: " + out);
        assertTrue(out.contains("\"setId\":\"QD_S_PRICE\""));
    }

    @Test
    void setId_가_문자열이_아니면_형식_오류() {
        String in = """
            {"version":1,"nodes":[{"id":"s1","kind":"SET","setId":3}],"edges":[]}""";
        IllegalArgumentException e = assertThrows(IllegalArgumentException.class, () -> RuleSetFlowJson.parse(in));
        assertEquals("nodes[0].setId 는 문자열이어야 한다", e.getMessage());
    }
}
