package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * MDM metaFeed HTTP 클라이언트(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2). {@code POST {base-url}/oasis/metaFeed/{action}}.
 * 헤더: {@code X-Client-Key}(RestClient 기본 헤더 — 자동 설정이 넣는다), {@code X-Authenticated-User: system:{module}},
 * {@code X-Authenticated-Role: SYSTEM}, 요청마다 {@code X-Tx-Id}. 사용자 헤더가 없으면 MDM 이 JWT 흐름으로 빠져 401 이다.
 *
 * <p>OASIS 는 BPMN 안 오류도 HTTP 200 + {@code meta.success=false} 로 준다 — 성공 여부는 {@code meta.success} 로 판정한다.
 * 모든 실패는 {@link MdmUnavailableException} 이다. 선례는 caravan-hub 클라이언트.
 */
public class MdmMetaClient implements MdmMetaFeed {

    static final String SERVICE_PATH = "/oasis/metaFeed/";
    static final String SYSTEM_ROLE = "SYSTEM";
    private static final TypeReference<List<RuleDefinition>> RULE_VERSIONS = new TypeReference<>() {
    };
    private static final TypeReference<Map<String, Object>> PLAIN_MAP = new TypeReference<>() {
    };

    private final RestClient restClient;
    private final String baseUrl;
    private final String module;

    public MdmMetaClient(RestClient restClient, String baseUrl, String module) {
        this.restClient = restClient;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.module = module;
    }

    @Override
    public MdmChanges changes(long since, int limit) {
        ObjectNode params = MdmJson.MAPPER.createObjectNode().put("since", since).put("limit", limit);
        JsonNode result = call("search", params, List.of());
        List<MdmChange> items = new ArrayList<>();
        for (JsonNode n : result.path("items")) {
            items.add(new MdmChange(n.path("seq").asLong(), n.path("type").asText(null), n.path("key").asText(null),
                    n.path("kind").asText(null)));
        }
        return new MdmChanges(result.path("latestSeq").asLong(0L), items, result.path("truncated").asBoolean(false));
    }

    @Override
    public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
        JsonNode result = call("view", MdmJson.MAPPER.createObjectNode().put("type", type.name()), keys);
        Map<String, Object> found = new LinkedHashMap<>();
        for (JsonNode n : result.path("items")) {
            found.put(n.path("key").asText(), convert(type, n.path("value")));
        }
        Map<String, String> failed = new LinkedHashMap<>();
        for (JsonNode n : result.path("failed")) {
            failed.put(n.path("key").asText(), n.path("message").asText(""));
        }
        return new MdmFetchResult(found, failed);
    }

    static Object convert(MdmTargetType type, JsonNode value) {
        try {
            return switch (type) {
                case COLUMN -> MdmJson.MAPPER.treeToValue(value, MdmColumnMeta.class);
                case DOMAIN -> MdmJson.MAPPER.treeToValue(value, MdmDomainMeta.class);
                case RULE -> MdmJson.MAPPER.readerFor(RULE_VERSIONS).readValue(value);
                case RULE_SET -> MdmJson.MAPPER.treeToValue(value, RuleSetDefinition.class);
                case CODE -> MdmJson.MAPPER.treeToValue(value, CodeRows.class);
                case LAYOUT -> MdmJson.MAPPER.convertValue(value, PLAIN_MAP);
            };
        } catch (IOException | IllegalArgumentException e) {
            throw new MdmUnavailableException("MDM 응답의 " + type + " 값을 읽을 수 없습니다: " + e.getMessage(), e);
        }
    }

    private JsonNode call(String action, ObjectNode params, Collection<String> keys) {
        ObjectNode body = MdmJson.MAPPER.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.set("params", params);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        keys.forEach(k -> rows.addObject().put("key", k));
        String text;
        try {
            text = restClient.post()
                    .uri(baseUrl + SERVICE_PATH + action)
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header("X-Authenticated-User", "system:" + module)
                    .header("X-Authenticated-Role", SYSTEM_ROLE)
                    .header("X-Tx-Id", UUID.randomUUID().toString())
                    .body(MdmJson.MAPPER.writeValueAsString(body))
                    .retrieve()
                    .body(String.class);
        } catch (RestClientException | JsonProcessingException e) {
            throw new MdmUnavailableException("MDM 호출 실패(" + action + "): " + e.getMessage(), e);
        }
        JsonNode root;
        try {
            root = MdmJson.MAPPER.readTree(text == null ? "" : text);
        } catch (JsonProcessingException e) {
            throw new MdmUnavailableException("MDM 응답이 JSON 이 아닙니다(" + action + ")", e);
        }
        if (!root.path("meta").path("success").asBoolean(false)) {
            throw new MdmUnavailableException("MDM 이 거부했습니다(" + action + "): " + root.path("meta").path("message").asText(""));
        }
        return root.path("data").path("result");
    }
}
