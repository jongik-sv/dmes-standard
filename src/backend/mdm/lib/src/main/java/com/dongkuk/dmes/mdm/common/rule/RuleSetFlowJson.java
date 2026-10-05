package com.dongkuk.dmes.mdm.common.rule;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
 * mdm/lib 이 맡는다. 노드 종류 키는 {@code kind}, 받는 노드(CATCH)는 {@code attachTo}·{@code catches} 를 더 갖는다,
 * IF "그 외" 선은 {@code "otherwise": true}(D2). {@code view} 는 화면 전용이라 읽지 않고 {@link #canonical} 이 그대로 싣는다. 형식이 틀리면 {@link IllegalArgumentException}(호출자가 MDM021 로 바꾼다).
 */
public final class RuleSetFlowJson {

    private static final ObjectMapper JSON = new ObjectMapper();

    private RuleSetFlowJson() {
    }

    public static final int MAX_NODES = 200;
    public static final int MAX_EDGES = 400;
    public static final int MAX_JSON_CHARS = 262_144;

    /** 엄격 읽기 — 타입이 다른 칸은 조용히 바꾸지 않고 IAE 로 거부한다(P2). */
    public static FlowDefinition parse(String json) {
        return read(tree(json));
    }

    /** 엄격 읽기 뒤 키 순서·null 쓰기가 고정인 정규 JSON 문자열. view 는 받은 객체 그대로(없으면 빈 배치). */
    public static String canonical(String json) {
        JsonNode root = tree(json);
        FlowDefinition f = read(root);
        ObjectNode out = JSON.createObjectNode();
        out.put("version", f.version());
        ArrayNode ns = out.putArray("nodes");
        for (FlowNode n : f.nodes()) {
            ObjectNode o = ns.addObject();
            o.put("id", n.id());
            o.put("kind", n.kind().name());
            o.put("ruleId", n.ruleId());
            o.put("splitId", n.splitId());
            o.put("label", n.label());
            // 받는 노드만 두 칸을 쓴다 — 받는 노드 없는 세트의 정규 글자는 그대로다(Ruling R11).
            if (n.kind() == NodeKind.CATCH) {
                o.put("attachTo", n.attachTo());
                if (n.catches() == null) {
                    o.putNull("catches");
                } else {
                    ArrayNode cs = o.putArray("catches");
                    n.catches().forEach(cs::add);
                }
            }
            // setId 는 SET 노드에만 쓴다 — SET 없는 세트의 정규 문자열이 그대로여야 한다(편차 5, 저장 흐름 dirty 기준).
            if (n.setId() != null) {
                o.put("setId", n.setId());
            }
        }
        ArrayNode es = out.putArray("edges");
        for (FlowEdge e : f.edges()) {
            ObjectNode o = es.addObject();
            o.put("id", e.id());
            o.put("from", e.from());
            o.put("to", e.to());
            o.put("order", e.order());
            o.put("cond", e.cond());
            o.put("otherwise", e.otherwise());
            o.put("label", e.label());
        }
        JsonNode view = root.get("view");
        if (view == null || view.isNull()) {
            ObjectNode dv = out.putObject("view");
            dv.putObject("positions");
            dv.putArray("notes");
            dv.putArray("groups");
        } else {
            out.set("view", view);
        }
        String result;
        try {
            result = JSON.writeValueAsString(out);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름을 JSON 으로 쓸 수 없다: " + e.getOriginalMessage(), e);
        }
        // 빠진 선택 칸을 null 로 채워 길이가 늘 수 있다 — 저장값이 읽기 상한을 넘으면 뒤에서 읽지 못하므로 여기서 거부한다.
        if (result.length() > MAX_JSON_CHARS) {
            throw new IllegalArgumentException("정규화한 흐름 JSON 이 " + result.length() + "자다. " + MAX_JSON_CHARS + "자까지 받는다");
        }
        return result;
    }

    private static JsonNode tree(String json) {
        if (json != null && json.length() > MAX_JSON_CHARS) {
            throw new IllegalArgumentException("흐름 JSON 이 " + json.length() + "자다. " + MAX_JSON_CHARS + "자까지 받는다");
        }
        try {
            return JSON.readTree(json);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("흐름 JSON 을 읽을 수 없다: " + e.getOriginalMessage(), e);
        }
    }

    /** 저장된 FLOW_JSON → 맵(조회 응답용, view 포함). */
    public static Map<String, Object> toMap(String json) {
        tree(json);
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
        JsonNode ver = root.get("version");
        if (ver == null || !ver.isIntegralNumber() || !ver.canConvertToInt() || ver.intValue() != 1) {
            throw new IllegalArgumentException("흐름 형식 버전은 정수 1 이어야 한다");
        }
        JsonNode ns = array(root, "nodes");
        JsonNode es = array(root, "edges");
        if (ns.size() > MAX_NODES) {
            throw new IllegalArgumentException("노드가 " + ns.size() + "개다. 흐름 하나에 " + MAX_NODES + "개까지 둔다");
        }
        if (es.size() > MAX_EDGES) {
            throw new IllegalArgumentException("선이 " + es.size() + "개다. 흐름 하나에 " + MAX_EDGES + "개까지 둔다");
        }
        JsonNode view = root.get("view");
        if (view != null && !view.isNull() && !view.isObject()) {
            throw new IllegalArgumentException("흐름의 view 는 객체여야 한다");
        }
        List<FlowNode> nodes = new ArrayList<>();
        for (int i = 0; i < ns.size(); i++) {
            JsonNode n = ns.get(i);
            String where = "nodes[" + i + "]";
            object(n, where);
            String id = required(n, "id", where);
            String kind = required(n, "kind", where);
            NodeKind k;
            try {
                k = NodeKind.valueOf(kind);
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("노드 종류 " + kind + " 를 모른다");
            }
            nodes.add(new FlowNode(id, k, text(n, "ruleId", where), text(n, "splitId", where), text(n, "label", where),
                    text(n, "attachTo", where), strings(n, "catches", where), text(n, "setId", where)));
        }
        List<FlowEdge> edges = new ArrayList<>();
        for (int i = 0; i < es.size(); i++) {
            JsonNode e = es.get(i);
            String where = "edges[" + i + "]";
            object(e, where);
            String id = required(e, "id", where);
            String from = required(e, "from", where);
            String to = required(e, "to", where);
            JsonNode order = e.get("order");
            Integer ord = null;
            if (order != null && !order.isNull()) {
                if (!order.isIntegralNumber() || !order.canConvertToInt()) {
                    throw new IllegalArgumentException(where + ".order 는 정수여야 한다");
                }
                ord = order.intValue();
            }
            String cond = text(e, "cond", where);
            JsonNode ow = e.get("otherwise");
            boolean otherwise = false;
            if (ow != null && !ow.isNull()) {
                if (!ow.isBoolean()) {
                    throw new IllegalArgumentException(where + ".otherwise 는 true/false 여야 한다");
                }
                otherwise = ow.booleanValue();
            }
            edges.add(new FlowEdge(id, from, to, ord, cond, otherwise, text(e, "label", where)));
        }
        return new FlowDefinition(1, List.copyOf(nodes), List.copyOf(edges));
    }

    private static void object(JsonNode n, String where) {
        if (n == null || !n.isObject()) {
            throw new IllegalArgumentException(where + " 는 객체여야 한다");
        }
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
        String v = text(node, field, where);
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(where + "." + field + " 가 없다");
        }
        return v;
    }

    /** 문자열 배열 칸 — 없거나 null 이면 null, 배열이 아니거나 문자열이 아닌 원소가 있으면 형식 오류. */
    private static List<String> strings(JsonNode node, String field, String where) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return null;
        }
        if (!v.isArray()) {
            throw new IllegalArgumentException(where + "." + field + " 는 문자열 배열이어야 한다");
        }
        List<String> out = new ArrayList<>();
        for (JsonNode x : v) {
            if (!x.isTextual()) {
                throw new IllegalArgumentException(where + "." + field + " 는 문자열 배열이어야 한다");
            }
            out.add(x.textValue());
        }
        return List.copyOf(out);
    }

    /** 문자열 칸 — 없거나 null 이면 null, 문자열이 아니면 형식 오류. */
    private static String text(JsonNode node, String field, String where) {
        JsonNode v = node.get(field);
        if (v == null || v.isNull()) {
            return null;
        }
        if (!v.isTextual()) {
            throw new IllegalArgumentException(where + "." + field + " 는 문자열이어야 한다");
        }
        return v.textValue();
    }
}
