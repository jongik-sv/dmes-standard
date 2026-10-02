package com.dongkuk.dmes.mcm.widget.admin.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.query.WidgetQueryRunner;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URISyntaxException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * 정의 위젯 설정(CONFIG_JSON) 서버 검사 — 스펙 2026-10-02-widget-admin-generic §5.3·§6.
 * 서버는 유형 목록을 모르므로(프런트 생성물) 아래 알려진 유형만 모양을 보고, 나머지는 JSON 객체인지만 본다.
 */
final class WidgetDefConfigRules {

    static final int CONFIG_MAX_BYTES = 200 * 1024;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Pattern MEDIA_SRC = Pattern.compile("^media:[0-9a-f]{32}$");

    private WidgetDefConfigRules() {}

    /**
     * 설정을 검사하고 저장할 DATA_SRC 를 돌려준다(쿼리 유형만 값, 그 밖은 null).
     * 쿼리 유형은 config.sql 을 {@link WidgetQueryRunner#validateSql} 로 저장 때도 검사한다(§7.1).
     */
    static String check(String typeId, String rawDataSrc, String configJson, WidgetQueryRunner queryRunner) {
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
            queryRunner.validateSql(sql.asText());
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
            case "html" -> {
                JsonNode allowScript = config.get("allowScript");
                if (allowScript != null && !allowScript.isNull() && !allowScript.isBoolean()) {
                    throw invalid("스크립트 허용(allowScript)은 true 또는 false 여야 합니다.");
                }
            }
            default -> {
                // 그 밖 유형은 JSON 객체인지만 본다.
            }
        }
        return null;
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
