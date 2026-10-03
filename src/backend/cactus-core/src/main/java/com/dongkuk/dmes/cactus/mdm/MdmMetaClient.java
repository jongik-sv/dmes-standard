package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
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
 *
 * <p>D-154 — 목차·본문({@link #fetchToc}·{@link #fetchBodies})과 옛 MDM 신호 (가)·(나).
 */
public class MdmMetaClient implements MdmMetaFeed {

    static final String SERVICE_PATH = "/oasis/metaFeed/";
    static final String SYSTEM_ROLE = "SYSTEM";
    /** MDM {@code metaFeed/view} 가 한 번에 받는 키 수 상한({@code MetaFeedService.MAX_KEYS}). */
    static final int MAX_KEYS_PER_VIEW = 500;
    /** 목차 요청 {@code params.at} 형식 — 초까지(KST 벽시계). */
    static final DateTimeFormatter AT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final TypeReference<List<RuleDefinition>> RULE_VERSIONS = new TypeReference<>() {
    };
    private static final TypeReference<List<RuleSetDefinition>> RULE_SET_VERSIONS = new TypeReference<>() {
    };
    private static final TypeReference<List<MdmLayoutVersion>> LAYOUT_VERSIONS = new TypeReference<>() {
    };

    private final RestClient restClient;
    private final String baseUrl;
    private final String module;
    /** 별칭 매칭에 쓰는 시스템 코드 — null·빈 값이면 COLUMN 요청에도 싣지 않는다. */
    private final String systemCode;

    public MdmMetaClient(RestClient restClient, String baseUrl, String module) {
        this(restClient, baseUrl, module, null);
    }

    public MdmMetaClient(RestClient restClient, String baseUrl, String module, String systemCode) {
        this.systemCode = systemCode == null || systemCode.isBlank() ? null : systemCode.trim();
        this.restClient = restClient;
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
        this.module = module;
    }

    @Override
    public MdmChanges changes(long since, int limit) {
        ObjectNode params = MdmJson.MAPPER.createObjectNode().put("since", since).put("limit", limit);
        JsonNode result = call("search", params, MdmJson.MAPPER.createArrayNode());
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
     *
     * <p>값 모양: RULE·RULE_SET·LAYOUT 은 RELEASED 버전 목록이다(LAYOUT 은 {@link MdmLayoutVersion} — 버전별 합성 구간을 싣는다).
     */
    @Override
    public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
        List<String> all = new ArrayList<>(keys);
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (int from = 0; from < all.size(); from += MAX_KEYS_PER_VIEW) {
            legacyChunk(type, all.subList(from, Math.min(all.size(), from + MAX_KEYS_PER_VIEW)), found, failed);
        }
        return new MdmFetchResult(found, failed);
    }

    /** part 없는 view 한 묶음(지금 동작). 업무 거부는 그 묶음 키 전부 failed. */
    private void legacyChunk(MdmTargetType type, List<String> chunk, Map<String, Object> found, Map<String, String> failed) {
        JsonNode result;
        try {
            ObjectNode params = MdmJson.MAPPER.createObjectNode().put("type", type.name());
            if (type == MdmTargetType.COLUMN && systemCode != null) {
                params.put("systemCode", systemCode); // 별칭 매칭 — COLUMN 에만(다른 종류에는 영향 없음)
            }
            result = call("view", params, keyRows(chunk));
        } catch (MdmRejectedException e) {
            chunk.forEach(k -> failed.put(k, e.getMessage()));
            return;
        }
        readLegacy(type, result, found, failed);
    }

    private static void readLegacy(MdmTargetType type, JsonNode result, Map<String, Object> found, Map<String, String> failed) {
        for (JsonNode n : result.path("items")) {
            String key = n.path("key").asText();
            JsonNode value = n.path("value");
            if (absent(value)) {
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

    /**
     * 목차(D-154, 스펙 §4.1). 신호 (가): 응답에 {@code part=TOC} 가 되울려 오지 않으면 옛 MDM 이 params 를 무시한 것 — 그 묶음을 전 이력으로 읽는다.
     * 신호 (나): 업무 거부면 같은 묶음을 part 없이 한 번 다시 보낸다(새 MDM 의 묶음 거부는 키 상한 초과 같은 입력 오류뿐이고 500 개씩 나눠 보내므로
     * 해가 없다). 판정은 응답마다 새로 한다 — 일시 거부 한 번이 물러남으로 굳지 않는다.
     */
    @Override
    public MdmTocResult fetchToc(MdmTargetType type, Collection<String> keys, LocalDateTime at) {
        List<String> all = new ArrayList<>(new LinkedHashSet<>(keys));
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        Map<String, MdmCurrent> current = new LinkedHashMap<>();
        Map<String, Object> legacy = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (int from = 0; from < all.size(); from += MAX_KEYS_PER_VIEW) {
            List<String> chunk = all.subList(from, Math.min(all.size(), from + MAX_KEYS_PER_VIEW));
            ObjectNode params = MdmJson.MAPPER.createObjectNode().put("type", type.name()).put("part", "TOC");
            if (at != null) {
                params.put("at", AT.format(at));
            }
            JsonNode result;
            try {
                result = call("view", params, keyRows(chunk));
            } catch (MdmRejectedException e) {
                legacyChunk(type, chunk, legacy, failed); // 신호 (나)
                continue;
            }
            if (!"TOC".equals(result.path("part").asText(null))) {
                readLegacy(type, result, legacy, failed); // 신호 (가)
                continue;
            }
            for (JsonNode n : result.path("items")) {
                String key = n.path("key").asText();
                JsonNode value = n.path("value");
                if (absent(value)) {
                    // null 목차로 담으면 그 키가 "없음"으로 60분 캐시된다 — 받을 수 없는 키(failed)로 돌린다(지금 값 경로와 같다).
                    failed.put(key, "value 없음");
                    continue;
                }
                try {
                    MdmToc toc = MdmJson.MAPPER.treeToValue(value, MdmToc.class);
                    JsonNode cur = n.path("current");
                    // current 는 덤이다 — 본문이 비었으면 목차만 받고 본문은 서비스가 따로 요청한다
                    MdmCurrent c = cur.isObject() && !absent(cur.path("value"))
                            ? new MdmCurrent(MdmVersions.key(cur.path("ver").asText()), convertBody(type, cur.path("value")))
                            : null;
                    tocs.put(key, toc);
                    if (c != null) {
                        current.put(key, c);
                    }
                } catch (IOException | IllegalArgumentException | MdmUnavailableException e) {
                    failed.put(key, "MDM 응답의 " + type + " 목차를 읽을 수 없습니다: " + e.getMessage());
                }
            }
            for (JsonNode n : result.path("failed")) {
                failed.put(n.path("key").asText(), n.path("message").asText(""));
            }
        }
        return new MdmTocResult(tocs, current, legacy, failed);
    }

    /** 본문(D-154). 신호 (가)·(나)는 목차와 같다 — 물러나면 그 묶음의 정의 키로 전 이력을 받는다. */
    @Override
    public MdmBodyResult fetchBodies(MdmTargetType type, Collection<MdmBodyKey> keys) {
        List<MdmBodyKey> all = new ArrayList<>(new LinkedHashSet<>(keys));
        Map<MdmBodyKey, Object> found = new LinkedHashMap<>();
        Map<MdmBodyKey, String> failed = new LinkedHashMap<>();
        Map<String, Object> legacy = new LinkedHashMap<>();
        Map<String, String> legacyFailed = new LinkedHashMap<>();
        Set<String> asked = new LinkedHashSet<>();
        for (int from = 0; from < all.size(); from += MAX_KEYS_PER_VIEW) {
            List<MdmBodyKey> chunk = all.subList(from, Math.min(all.size(), from + MAX_KEYS_PER_VIEW));
            ObjectNode params = MdmJson.MAPPER.createObjectNode().put("type", type.name()).put("part", "BODY");
            ArrayNode rows = MdmJson.MAPPER.createArrayNode();
            chunk.forEach(k -> rows.addObject().put("key", k.key()).put("ver", k.ver()));
            JsonNode result;
            try {
                result = call("view", params, rows);
            } catch (MdmRejectedException e) {
                List<String> defKeys = chunk.stream().map(MdmBodyKey::key).distinct().toList();
                asked.addAll(defKeys);
                legacyChunk(type, defKeys, legacy, legacyFailed);
                continue;
            }
            if (!"BODY".equals(result.path("part").asText(null))) {
                chunk.forEach(k -> asked.add(k.key()));
                readLegacy(type, result, legacy, legacyFailed);
                continue;
            }
            for (JsonNode n : result.path("items")) {
                MdmBodyKey key;
                try {
                    key = new MdmBodyKey(n.path("key").asText(), MdmVersions.key(n.path("ver").asText()));
                } catch (IllegalArgumentException e) {
                    continue; // 키를 알 수 없는 줄 — 그 쌍은 응답에 없는 것으로 남아 서비스가 받을 수 없음으로 처리한다
                }
                JsonNode value = n.path("value");
                if (absent(value)) {
                    failed.put(key, "value 없음"); // null 본문을 담지 않는다 — NOT_RELEASED 가 아니라 받을 수 없음이다
                    continue;
                }
                try {
                    found.put(key, convertBody(type, value));
                } catch (MdmUnavailableException e) {
                    failed.put(key, e.getMessage());
                }
            }
            for (JsonNode n : result.path("failed")) {
                String raw = n.path("ver").asText("");
                String ver;
                try {
                    ver = MdmVersions.key(raw);
                } catch (IllegalArgumentException e) {
                    ver = raw;
                }
                failed.put(new MdmBodyKey(n.path("key").asText(), ver), n.path("message").asText(""));
            }
        }
        return new MdmBodyResult(found, failed, legacy, legacyFailed, asked);
    }

    /** 본문 하나 → 엔진 모양. CODE 는 {@code CodeVersionSlice}(감싸기는 서비스). */
    static Object convertBody(MdmTargetType type, JsonNode value) {
        try {
            return switch (type) {
                case RULE -> MdmJson.MAPPER.treeToValue(value, RuleDefinition.class);
                case RULE_SET -> MdmJson.MAPPER.treeToValue(value, RuleSetDefinition.class);
                case LAYOUT -> MdmJson.MAPPER.treeToValue(value, MdmLayoutVersion.class);
                case CODE -> MdmJson.MAPPER.treeToValue(value, CodeVersionSlice.class);
                case COLUMN, DOMAIN -> throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
            };
        } catch (IOException | IllegalArgumentException e) {
            throw new MdmUnavailableException("MDM 응답의 " + type + " 본문을 읽을 수 없습니다: " + e.getMessage(), e);
        }
    }

    /** Jackson 은 null·없는 값을 예외 없이 null 로 읽는다 — 값 경로({@link #readLegacy})처럼 먼저 거른다. */
    private static boolean absent(JsonNode value) {
        return value.isMissingNode() || value.isNull();
    }

    private static ArrayNode keyRows(Collection<String> keys) {
        ArrayNode rows = MdmJson.MAPPER.createArrayNode();
        keys.forEach(k -> rows.addObject().put("key", k));
        return rows;
    }

    static Object convert(MdmTargetType type, JsonNode value) {
        try {
            return switch (type) {
                case COLUMN -> MdmJson.MAPPER.treeToValue(value, MdmColumnMeta.class);
                case DOMAIN -> MdmJson.MAPPER.treeToValue(value, MdmDomainMeta.class);
                case RULE -> MdmJson.MAPPER.readerFor(RULE_VERSIONS).readValue(value);
                case RULE_SET -> MdmJson.MAPPER.readerFor(RULE_SET_VERSIONS).readValue(value);
                case CODE -> MdmJson.MAPPER.treeToValue(value, CodeRows.class);
                case LAYOUT -> MdmJson.MAPPER.readerFor(LAYOUT_VERSIONS).readValue(value);
            };
        } catch (IOException | IllegalArgumentException e) {
            throw new MdmUnavailableException("MDM 응답의 " + type + " 값을 읽을 수 없습니다: " + e.getMessage(), e);
        }
    }

    private JsonNode call(String action, ObjectNode params, ArrayNode rows) {
        ObjectNode body = MdmJson.MAPPER.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.set("params", params);
        body.putObject("grids").putObject("keys").set("rows", rows);
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
