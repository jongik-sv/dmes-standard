package com.dongkuk.dmes.mcm.widget.admin.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfig;
import com.dongkuk.dmes.mcm.widget.collect.CollectConfigs;
import com.dongkuk.dmes.mcm.widget.memo.service.WidgetMemoService;
import com.dongkuk.dmes.mcm.widget.query.QueryParam;
import com.dongkuk.dmes.mcm.widget.query.QueryParams;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * 정의 위젯 설정(CONFIG_JSON) 서버 검사 — 스펙 2026-10-02-widget-admin-generic §5.3·§6.
 * 서버는 유형 목록을 모르므로(프런트 생성물) 아래 알려진 유형만 모양을 보고, 나머지는 JSON 객체인지만 본다.
 */
final class WidgetDefConfigRules {

    static final int CONFIG_MAX_BYTES = 200 * 1024;
    // JSON 값 뒤 군더더기(`{} junk`)도 거절한다 — 원문 그대로 저장되므로 파서가 끝까지 봐야 한다.
    private static final ObjectMapper JSON =
            new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);
    private static final Pattern MEDIA_SRC = Pattern.compile("^media:[0-9a-f]{32}$");

    private WidgetDefConfigRules() {}

    /**
     * 설정을 검사하고 저장할 DATA_SRC 를 돌려준다(쿼리 유형만 값, 그 밖은 null).
     * 쿼리 유형은 config.sql 을 {@link WidgetQueryRunner#validateSql} 로 저장 때도 검사하고, config.params(입력 조건)도 함께 본다(§7.1).
     */
    static String check(String typeId, String rawDataSrc, String configJson, WidgetQueryRunner queryRunner) {
        return check(typeId, rawDataSrc, configJson, queryRunner, null);
    }

    /**
     * {@link #check(String, String, String, WidgetQueryRunner)} + 정시 수집(collect) http 원천의 호스트 허용 판정. hostAllowed 가 null 이면 저장 때는
     * 호스트 허용 목록을 보지 않는다(수집기가 실행 때마다 거절한다).
     */
    static String check(String typeId, String rawDataSrc, String configJson, WidgetQueryRunner queryRunner,
                        Predicate<String> hostAllowed) {
        if (configJson.getBytes(StandardCharsets.UTF_8).length > CONFIG_MAX_BYTES) {
            throw invalid("위젯 설정은 200KB 이하로 정합니다.");
        }
        JsonNode config;
        try {
            config = JSON.readTree(configJson);
        } catch (JsonProcessingException e) {
            config = null;
        }
        if (config == null || !config.isObject()) throw invalid("위젯 설정(configJson)은 JSON 객체여야 합니다.");

        if (typeId.startsWith("query-")) {
            String dataSrc = requireDataSrc(rawDataSrc);
            JsonNode sql = config.get("sql");
            if (sql == null || !sql.isTextual() || sql.asText().isBlank()) {
                throw new BusinessException(ErrorCode.REQUIRED_VALUE, "SQL 을 입력해 주세요.");
            }
            checkQuery(sql.asText(), config.get("params"), queryRunner);
            return dataSrc;
        }
        switch (typeId) {
            case "web" -> {
                if (!isHttpUrl(textOf(config, "url"))) {
                    throw invalid("웹 주소는 http:// 또는 https:// 로 시작하는 절대 주소여야 합니다.");
                }
            }
            case "links" -> {
                for (JsonNode item : items(config, "링크 목록")) {
                    String kind = textOf(item, "kind");
                    if ("url".equals(kind)) {
                        if (!isHttpUrl(textOf(item, "url"))) {
                            throw invalid("링크 주소는 http:// 또는 https:// 로 시작하는 절대 주소여야 합니다.");
                        }
                    } else if ("page".equals(kind)) {
                        String pageId = textOf(item, "pageId");
                        if (pageId == null || pageId.isBlank()) throw invalid("화면 링크에는 pageId 가 필요합니다.");
                    } else {
                        throw invalid("링크 종류(kind)는 page 또는 url 이어야 합니다: " + kind);
                    }
                }
            }
            case "media" -> {
                for (JsonNode item : items(config, "미디어 목록")) {
                    String src = textOf(item, "src");
                    if (src == null || !(MEDIA_SRC.matcher(src).matches() || isHttpUrl(src))) {
                        throw invalid("미디어 주소는 media:{파일 ID} 또는 http(s) 주소여야 합니다: " + src);
                    }
                }
            }
            case CollectConfig.TYPE_ID -> // 정시 수집 — 스펙 2026-10-05 정시 수집 §2 의 규칙을 모두 서버가 판정한다
                    CollectConfigs.check(config, queryRunner::validateCollectSql, hostAllowed);
            case "html" -> {
                JsonNode allowScript = config.get("allowScript");
                if (allowScript != null && !allowScript.isNull() && !allowScript.isBoolean()) {
                    throw invalid("스크립트 허용(allowScript)은 true 또는 false 여야 합니다.");
                }
            }
            case WidgetMemoService.TYPE_MEMO -> { // §17.1
                String scope = textOf(config, "scope");
                if (!WidgetMemoService.SCOPE_SHARED.equals(scope) && !WidgetMemoService.SCOPE_PERSONAL.equals(scope)) {
                    throw invalid("메모 종류(scope)는 shared 또는 personal 이어야 합니다.");
                }
                String format = textOf(config, "format");
                if (format == null || !WidgetMemoService.FORMATS.contains(format)) { // Set.of 는 null 을 못 받는다
                    throw invalid("메모 형식(format)은 text·md·html 중 하나여야 합니다.");
                }
                JsonNode content = config.get("content");
                if (content != null && !content.isNull()) {
                    if (!content.isTextual()) throw invalid("메모 내용(content)은 문자열이어야 합니다.");
                    if (content.asText().length() > WidgetMemoService.CONTENT_MAX) {
                        throw invalid("메모 내용은 20,000자까지 쓸 수 있습니다.");
                    }
                }
            }
            default -> {
                // 그 밖 유형은 JSON 객체인지만 본다.
            }
        }
        return null;
    }

    /**
     * 쿼리 유형의 SQL·입력 조건(params) 검사. 조건이 없으면 지금과 같다(SQL 에 사용자 바인드가 있으면 알 수 없는 변수로 거절). 조건이 있으면
     * params 모양을 {@link QueryParams#parse} 로 보고, SQL 의 사용자 바인드는 모두 선언되어 있어야 하며(실행기 검사), 선언했지만 SQL 이 쓰지 않는
     * 이름도 거절한다.
     */
    private static void checkQuery(String sql, JsonNode paramsNode, WidgetQueryRunner queryRunner) {
        List<QueryParam> params = QueryParams.parse(paramsNode);
        if (params.isEmpty()) {
            queryRunner.validateSql(sql);
            return;
        }
        List<String> used = queryRunner.validateSql(sql, QueryParams.names(params));
        for (QueryParam param : params) {
            if (used == null || !used.contains(param.name())) {
                throw invalid("조건 :" + param.name() + " 는 SQL 에서 쓰이지 않습니다. SQL 에 쓰거나 조건을 지워 주세요.");
            }
        }
    }

    /** 쿼리 실행 모듈 — 지금은 mcm 만(§0 사용자 결정, W-D24). */
    static String requireDataSrc(String raw) {
        String dataSrc = CommWidgetMngService.blankToNull(raw);
        if (dataSrc == null) throw new BusinessException(ErrorCode.REQUIRED_VALUE, "쿼리 실행 모듈(dataSrc)을 정해 주세요.");
        if (!CommWidgetMngService.MCM_DATA_SRC.equals(dataSrc)) throw invalid("아직 지원하지 않는 모듈입니다");
        return dataSrc;
    }

    /** http·https 절대 주소(호스트 있음). javascript:·data:·file:·상대 주소는 거절. */
    static boolean isHttpUrl(String value) {
        if (value == null || value.isBlank()) return false;
        String s = value.trim();
        try {
            URI uri = new URI(s);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            return ("http".equals(scheme) || "https".equals(scheme)) && uri.getHost() != null && !uri.getHost().isBlank();
        } catch (URISyntaxException e) {
            return false;
        }
    }

    private static Iterable<JsonNode> items(JsonNode config, String label) {
        JsonNode items = config.get("items");
        if (items == null || items.isNull()) return List.of();
        if (!items.isArray()) throw invalid(label + "(items)은 배열이어야 합니다.");
        return items;
    }

    private static String textOf(JsonNode node, String field) {
        JsonNode v = node == null ? null : node.get(field);
        return v == null || !v.isTextual() ? null : v.asText();
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
