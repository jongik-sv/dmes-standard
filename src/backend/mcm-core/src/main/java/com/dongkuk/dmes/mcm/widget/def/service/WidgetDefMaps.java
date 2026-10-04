package com.dongkuk.dmes.mcm.widget.def.service;

import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 위젯 정의 행 → 응답 Map(스펙 2026-10-02-widget-admin-generic §5). 키는 {@code widgetId, srcTp, typeId, title, subtitle,
 * description, defW, defH, minW, minH, maxW, maxH, refreshSec, linkPageId, multipleYn, useYn, dataSrc, configJson}(문자열).
 * 사용자용 목록(widgetDef/list)은 모든 사용자가 부르므로 서버 전용 설정 키를 지운다(Review Focus 3).
 * <b>화면 목록에서 숨길 뿐 비밀 보장은 아니다</b> — chat 의 systemPrompt 와 고른 쿼리 위젯의 제목·설명은 매 요청 LLM 지시문·도구
 * 설명으로 들어가 대화로 드러날 수 있다(2026-10-03 보안 지적, 스펙 §5.1). 편집기가 비밀을 넣지 말라고 안내한다.
 */
public final class WidgetDefMaps {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> QUERY_SERVER_KEYS = List.of("sql");
    private static final List<String> CHAT_SERVER_KEYS = List.of("systemPrompt", "dataQueryDefIds");

    private WidgetDefMaps() {}

    /** 관리자용 — configJson 그대로. */
    public static Map<String, Object> toMap(WidgetDef def) {
        return toMap(def, def.getConfigJson());
    }

    /** 사용자용 — configJson 에서 서버 전용 키를 지운다. */
    public static Map<String, Object> toPublicMap(WidgetDef def) {
        return toMap(def, publicConfigJson(def.getTypeId(), def.getConfigJson()));
    }

    /** 유형별 서버 전용 키 — {@code query-*}: sql, {@code chat}: systemPrompt·dataQueryDefIds. */
    public static List<String> serverOnlyKeys(String typeId) {
        if (typeId == null) return List.of();
        if (typeId.startsWith("query-")) return QUERY_SERVER_KEYS;
        if ("chat".equals(typeId)) return CHAT_SERVER_KEYS;
        return List.of();
    }

    /** 서버 전용 키를 지운 configJson. 파싱 실패·객체 아님이면 null(화면은 설정 없음으로 본다). */
    public static String publicConfigJson(String typeId, String configJson) {
        if (configJson == null) return null;
        JsonNode node;
        try {
            node = JSON.readTree(configJson);
        } catch (JsonProcessingException e) {
            return null;
        }
        if (node == null || !node.isObject()) return null;
        List<String> hidden = serverOnlyKeys(typeId);
        if (hidden.isEmpty()) return configJson;
        ObjectNode obj = (ObjectNode) node;
        obj.remove(hidden);
        try {
            return JSON.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    /**
     * 관리자 목록용 — {@link WidgetDefRepository#findAllSummaryOrderByWidgetIdAsc} 열을 Map 으로. {@code configJson} 키는 싣지 않는다
     * (행을 고를 때 상세 조회로 받는다).
     */
    public static Map<String, Object> toSummaryMap(Object[] r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("widgetId", r[0]);
        m.put("srcTp", r[1]);
        m.put("typeId", r[2]);
        m.put("title", r[3]);
        m.put("subtitle", r[4]);
        m.put("description", r[5]);
        m.put("defW", r[6]);
        m.put("defH", r[7]);
        m.put("minW", r[8]);
        m.put("minH", r[9]);
        m.put("maxW", r[10]);
        m.put("maxH", r[11]);
        m.put("refreshSec", r[12]);
        m.put("linkPageId", r[13]);
        m.put("multipleYn", r[14]);
        m.put("useYn", r[15] == null ? "Y" : r[15]);
        m.put("dataSrc", r[16]);
        return m;
    }

    private static Map<String, Object> toMap(WidgetDef d, String configJson) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("widgetId", d.getWidgetId());
        m.put("srcTp", d.getSrcTp());
        m.put("typeId", d.getTypeId());
        m.put("title", d.getTitle());
        m.put("subtitle", d.getSubtitle());
        m.put("description", d.getDescription());
        m.put("defW", d.getDefW());
        m.put("defH", d.getDefH());
        m.put("minW", d.getMinW());
        m.put("minH", d.getMinH());
        m.put("maxW", d.getMaxW());
        m.put("maxH", d.getMaxH());
        m.put("refreshSec", d.getRefreshSec());
        m.put("linkPageId", d.getLinkPageId());
        m.put("multipleYn", d.getMultipleYn());
        m.put("useYn", d.getUseYn() == null ? "Y" : d.getUseYn());
        m.put("dataSrc", d.getDataSrc());
        m.put("configJson", configJson);
        return m;
    }
}
