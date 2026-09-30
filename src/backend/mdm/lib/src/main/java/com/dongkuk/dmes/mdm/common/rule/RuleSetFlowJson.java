package com.dongkuk.dmes.mdm.common.rule;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 룰 세트 흐름 JSON(FLOW_JSON) 코덱 — spec §3.3, 계획 C1·C6. 엔진은 Jackson 을 쓰지 않으므로 JSON ↔ 엔진 {@link FlowDefinition} 변환은
 * mdm/lib 이 맡는다. 노드 종류 키는 {@code kind}, IF "그 외" 선은 {@code "otherwise": true}(D2). {@code view} 는 화면 전용이라 읽지 않지만
 * {@link #write} 는 받은 맵을 그대로 저장한다. 형식이 틀리면 {@link IllegalArgumentException}(호출자가 MDM021 로 바꾼다).
 */
public final class RuleSetFlowJson {

    private static final ObjectMapper JSON = new ObjectMapper();

    private RuleSetFlowJson() {
    }

    public static FlowDefinition parse(String json) {
        try {
            return read(JSON.readTree(json));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름 JSON 을 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    public static FlowDefinition fromMap(Map<String, Object> flow) {
        return read(JSON.valueToTree(flow));
    }

    /** 받은 흐름(view 포함)을 그대로 JSON 문자열로. */
    public static String write(Map<String, Object> flow) {
        try {
            return JSON.writeValueAsString(flow);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름을 JSON 으로 쓸 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    /** 저장된 FLOW_JSON → 맵(조회 응답용, view 포함). */
    public static Map<String, Object> toMap(String json) {
        try {
            return JSON.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름 JSON 을 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    /** 분기(IF·PARALLEL)가 하나라도 있으면 true. 구조 오류로 트리가 없어도 분기 노드가 있으면 true 다. */
    public static boolean branched(FlowDefinition flow) {
        return flow.nodes().stream().anyMatch(n -> n.kind() == NodeKind.IF || n.kind() == NodeKind.PARALLEL);
    }

    /**
     * 계획 C4 1번 — 트리가 있으면 {@code tree.ruleIds()}, 없으면 RULE 노드의 ruleId 를 노드 배열 순서로 중복 없이(빈 ID 는 뺀다). 노드 ID 가
     * 겹치면 그 ID 의 첫 노드만 본다(C3).
     */
    public static List<String> ruleIds(FlowDefinition flow) {
        return ruleIds(flow, FlowParser.parse(flow));
    }

    /** {@link #ruleIds(FlowDefinition)} 와 같되 이미 파싱한 결과를 쓴다(분석기가 두 번 파싱하지 않게). */
    static List<String> ruleIds(FlowDefinition flow, FlowParse p) {
        if (p.tree() != null) {
            return p.tree().ruleIds();
        }
        Set<String> seenNodes = new HashSet<>();
        Set<String> out = new LinkedHashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id())) {
                continue;
            }
            if (n.kind() == NodeKind.RULE && n.ruleId() != null && !n.ruleId().isBlank()) {
                out.add(n.ruleId());
            }
        }
        return List.copyOf(out);
    }

    private static FlowDefinition read(JsonNode root) {
        if (root == null || !root.isObject()) {
            throw new IllegalArgumentException("흐름은 JSON 객체여야 한다");
        }
        int version = root.path("version").asInt(0);
        if (version != 1) {
            throw new IllegalArgumentException("흐름 형식 버전 " + version + " 는 읽지 못한다(1 만 받는다)");
        }
        List<FlowNode> nodes = new ArrayList<>();
        JsonNode ns = array(root, "nodes");
        for (int i = 0; i < ns.size(); i++) {
            JsonNode n = ns.get(i);
            String id = required(n, "id", "nodes[" + i + "]");
            String kind = required(n, "kind", "nodes[" + i + "]");
            NodeKind k;
            try {
                k = NodeKind.valueOf(kind);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("노드 종류 " + kind + " 를 모른다");
            }
            nodes.add(new FlowNode(id, k, text(n, "ruleId"), text(n, "splitId"), text(n, "label")));
        }
        List<FlowEdge> edges = new ArrayList<>();
        JsonNode es = array(root, "edges");
        for (int i = 0; i < es.size(); i++) {
            JsonNode e = es.get(i);
            String where = "edges[" + i + "]";
            JsonNode order = e.path("order");
            edges.add(new FlowEdge(required(e, "id", where), required(e, "from", where), required(e, "to", where),
                    order.isNumber() ? order.asInt() : null, text(e, "cond"), e.path("otherwise").asBoolean(false), text(e, "label")));
        }
        return new FlowDefinition(version, List.copyOf(nodes), List.copyOf(edges));
    }

    /** nodes·edges 는 반드시 배열이다. 빠지거나 다른 모양이면 형식 오류(NPE 대신). */
    private static JsonNode array(JsonNode root, String field) {
        JsonNode v = root.get(field);
        if (v == null || !v.isArray()) {
            throw new IllegalArgumentException("흐름의 " + field + " 는 배열이어야 한다");
        }
        return v;
    }

    private static String required(JsonNode node, String field, String where) {
        String v = text(node, field);
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(where + "." + field + " 가 없다");
        }
        return v;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }
}
