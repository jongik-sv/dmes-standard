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
 * 실패는 {@link MdmUnavailableException} 이고, 그중 MDM 의 업무 거부는 {@link MdmRejectedException} 이다. view({@link #fetch})는 업무 거부와
 * 값 하나의 변환 실패를 예외 대신 {@code failed} 로 돌린다(장애로 세지 않게). 선례는 caravan-hub 클라이언트.
 */
public class MdmMetaClient implements MdmMetaFeed {

    static final String SERVICE_PATH = "/oasis/metaFeed/";
    static final String SYSTEM_ROLE = "SYSTEM";
    /** MDM {@code metaFeed/view} 가 한 번에 받는 키 수 상한({@code MetaFeedService.MAX_KEYS}). */
    static final int MAX_KEYS_PER_VIEW = 500;
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
        JsonNode latestSeq = result.path("latestSeq");
        if (!latestSeq.isNumber()) {
            // 0 으로 읽으면 폴러가 역행(규칙 4)으로 보고 캐시를 통째로 비운다 — 손상된 응답으로 다룬다.
            throw new MdmUnavailableException("MDM 응답에 latestSeq 가 없습니다(search)");
        }
        return new MdmChanges(latestSeq.asLong(), items, result.path("truncated").asBoolean(false));
    }

    /**
     * view — 키를 {@value #MAX_KEYS_PER_VIEW}개씩 나눠 부르고 결과를 합친다(MDM 이 한 번에 받는 상한). MDM 의 업무 거부({@code meta.success=false})는
     * 그 묶음 키를, 값 하나를 엔진 모양으로 읽을 수 없으면 그 키만 {@code failed} 로 돌린다 — 장애로 세지 않는다(MDM 이 살아 있다). 연결·시간 초과·
     * 손상된 봉투는 {@link MdmUnavailableException} 그대로 던진다(장애).
     */
    @Override
    public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
        List<String> all = new ArrayList<>(keys);
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (int from = 0; from < all.size(); from += MAX_KEYS_PER_VIEW) {
            List<String> chunk = all.subList(from, Math.min(all.size(), from + MAX_KEYS_PER_VIEW));
            JsonNode result;
            try {
                result = call("view", MdmJson.MAPPER.createObjectNode().put("type", type.name()), chunk);
            } catch (MdmRejectedException e) {
                chunk.forEach(k -> failed.put(k, e.getMessage()));
                continue;
            }
            for (JsonNode n : result.path("items")) {
                String key = n.path("key").asText();
                JsonNode value = n.path("value");
                if (value.isMissingNode() || value.isNull()) {
                    // 건너뛰면 그 키가 "없음"으로 60분 캐시된다 — 받을 수 없는 키(failed)로 돌린다.
                    failed.put(key, "value 없음");
                    continue;
                }
                try {
                    found.put(key, convert(type, value));
                } catch (MdmUnavailableException e) {
                    failed.put(key, e.getMessage());
                }
            }
            for (JsonNode n : result.path("failed")) {
                failed.put(n.path("key").asText(), n.path("message").asText(""));
            }
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
            throw new MdmRejectedException("MDM 이 거부했습니다(" + action + "): " + root.path("meta").path("message").asText(""));
        }
        JsonNode result = root.path("data").path("result");
        if (result.isMissingNode() || result.isNull()) {
            // 빈 결과를 0 으로 읽으면 폴러가 latestSeq=0 을 역행으로 보고 캐시를 통째로 비운다 — 손상된 응답으로 다룬다.
            throw new MdmUnavailableException("MDM 응답에 data.result 가 없습니다(" + action + ")");
        }
        return result;
    }
}
