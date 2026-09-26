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
 *
 * <p><b>ast 표현 정규화(레거시 문자열 → 객체)는 값 변경이 아니다</b>(TSK-08-04 반려 재작업 D14) — 08-02 I17 의 "값을 고치지 않는다"는
 * {@code op·left·right·list·expr·val} 에 대한 것이고, {@code ast} 는 {@code expr} 에서 파생된 표현일 뿐이다. {@link #parse} 는 셀의
 * 문자열 {@code ast} 를 객체로 풀고, {@link #ast(Object)} 는 그 밖의 호출자(독자·view·확정 diff)가 같은 규칙으로 읽게 한다.
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
            decodeCellAst(varId, typed);
            cells.put(varId, typed);
        }
        return cells;
    }

    /**
     * 셀의 {@code ast} 가 문자열이면 객체로 풀어 넣고(레거시, D14), 공백뿐이면 키를 지운다(D15). 이미 Map 이면 손대지 않는다(null 도
     * 그대로 — 키가 없는 것과 같다). 그 밖 타입(숫자·배열 등, RR4)은 문자열로 감싸지 않고 원문 JSON 에 그대로 있었다는 뜻이라 여기서도
     * 곧바로 거부한다 — {@link #ast(Object)} 나 {@link #validateShape} 를 거치지 않는 호출자가 있어도 parse 단계에서 막힌다.
     */
    private static void decodeCellAst(int varId, Map<String, Object> cell) {
        Object raw = cell.get("ast");
        if (raw == null || raw instanceof Map<?, ?>) {
            return;
        }
        if (raw instanceof String s) {
            if (s.isBlank()) {
                cell.remove("ast");
                return;
            }
            String preview = s.length() > 40 ? s.substring(0, 40) : s;
            cell.put("ast", decodeAstString(s, "var_id " + varId + " 셀의 ast 를 읽을 수 없습니다(JSON 객체가 아님): " + preview));
            return;
        }
        throw invalid("var_id " + varId + " 셀의 ast 를 읽을 수 없습니다(JSON 객체가 아님): " + raw);
    }

    /** null → null, {@code Map} → 그대로, 공백뿐 문자열 → null, 그 밖 문자열은 JSON 객체로 디코드, 그 밖 타입은 예외(RR4). */
    public static Map<String, Object> ast(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof Map<?, ?> map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> typed = (Map<String, Object>) map;
            return typed;
        }
        if (raw instanceof String s) {
            if (s.isBlank()) {
                return null;
            }
            return decodeAstString(s, "셀의 ast 를 읽을 수 없습니다: " + raw);
        }
        throw invalid("셀의 ast 를 읽을 수 없습니다: " + raw);
    }

    private static Map<String, Object> decodeAstString(String s, String errorMessage) {
        Object decoded;
        try {
            decoded = MAPPER.readValue(s, Object.class);
        } catch (JsonProcessingException | IllegalArgumentException e) {
            throw invalid(errorMessage);
        }
        if (!(decoded instanceof Map<?, ?> map)) {
            throw invalid(errorMessage);
        }
        @SuppressWarnings("unchecked")
        Map<String, Object> typed = (Map<String, Object>) map;
        return typed;
    }

    /** ast 가 문자열인 셀이 하나라도 있으면 {@code write(parse(json))}, 없으면 입력 그대로(바이트 동일, D19). */
    public static String normalizeStored(String json) {
        if (!hasStringAst(json)) {
            return json;
        }
        return write(parse(json));
    }

    private static boolean hasStringAst(String json) {
        Map<String, Object> raw;
        try {
            raw = MAPPER.readValue(json == null ? "" : json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (JsonProcessingException | IllegalArgumentException e) {
            return false;
        }
        if (raw == null) {
            return false;
        }
        for (Object v : raw.values()) {
            if (v instanceof Map<?, ?> cell && cell.get("ast") instanceof String) {
                return true;
            }
        }
        return false;
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
