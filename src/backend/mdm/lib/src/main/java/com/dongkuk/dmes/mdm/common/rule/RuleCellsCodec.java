package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 셀 JSON 문자열 ↔ 셀 맵(TSK-08-02 design §6.5, I17). 06 모양 그대로 저장한다 — 키는 그 버전의 var_id 문자열, 셀 객체 키는
 * {@code op,left,right,list,expr,ast,val} 일곱, 값은 문자열({@code list} 는 문자열 배열, {@code ast} 는 객체).
 *
 * <p><b>값을 고치지 않는다</b>(트림·정규화·IN 정렬 없음 — 08-04 가 별도 클래스로 더한다). 모양이 어긋나면 {@code INVALID_VALUE}.
 */
public final class RuleCellsCodec {

    /** 셀 객체가 가질 수 있는 키(06:1038). */
    public static final Set<String> CELL_KEYS = Set.of("op", "left", "right", "list", "expr", "ast", "val");

    private static final Set<String> STRING_KEYS = Set.of("op", "left", "right", "expr", "val");

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private RuleCellsCodec() {
    }

    /** 순서를 보존해 읽는다. JSON 객체가 아니거나 키가 정수가 아니거나 셀이 객체가 아니면 {@code INVALID_VALUE}. */
    public static Map<Integer, Map<String, Object>> parse(String json) {
        Map<String, Object> raw;
        try {
            raw = MAPPER.readValue(json == null ? "" : json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw invalid("셀 JSON 이 객체가 아닙니다: " + json);
        }
        if (raw == null) {
            throw invalid("셀 JSON 이 객체가 아닙니다: " + json);
        }
        Map<Integer, Map<String, Object>> cells = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : raw.entrySet()) {
            int varId;
            try {
                varId = Integer.parseInt(e.getKey());
            } catch (NumberFormatException ex) {
                throw invalid("셀 키는 var_id 정수여야 합니다: " + e.getKey());
            }
            if (!(e.getValue() instanceof Map<?, ?> cell)) {
                throw invalid("var_id " + varId + " 의 셀이 객체가 아닙니다");
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> typed = (Map<String, Object>) cell;
            cells.put(varId, typed);
        }
        return cells;
    }

    /** 받은 순서 그대로 쓴다(공백 없음). */
    public static String write(Map<Integer, Map<String, Object>> cells) {
        Map<String, Object> raw = new LinkedHashMap<>();
        cells.forEach((k, v) -> raw.put(String.valueOf(k), v));
        try {
            return MAPPER.writeValueAsString(raw);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException(e);
        }
    }

    public static void validateShape(Map<Integer, Map<String, Object>> cells, Set<Integer> varIds) {
        validateShape(cells, varIds, null);
    }

    /** @param rowLabel 메시지 앞에 붙일 행 표시(예 {@code "3행"}). null 이면 붙이지 않는다 */
    public static void validateShape(Map<Integer, Map<String, Object>> cells, Set<Integer> varIds, String rowLabel) {
        String where = rowLabel == null ? "" : rowLabel + " ";
        for (Map.Entry<Integer, Map<String, Object>> e : cells.entrySet()) {
            int varId = e.getKey();
            if (!varIds.contains(varId)) {
                throw invalid(where + "var_id " + varId + " 은(는) 이 버전의 변수가 아닙니다");
            }
            for (Map.Entry<String, Object> kv : e.getValue().entrySet()) {
                String key = kv.getKey();
                Object value = kv.getValue();
                if (!CELL_KEYS.contains(key)) {
                    throw invalid(where + "var_id " + varId + " 셀에 모르는 키 " + key + " 가 있습니다");
                }
                boolean ok = STRING_KEYS.contains(key) ? value instanceof String
                        : key.equals("list") ? value instanceof List<?> list && list.stream().allMatch(x -> x instanceof String)
                        : value instanceof Map<?, ?>;
                if (!ok) {
                    throw invalid(where + "var_id " + varId + " 셀의 " + key + " 값 모양이 맞지 않습니다(문자열·문자열 배열·객체)");
                }
            }
        }
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
