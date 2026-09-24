package com.dongkuk.dmes.mdm.common.dictionary;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;

/**
 * 도메인 JSON 칼럼({@code STD_AST}·{@code BIZ_AST}·{@code EXAMPLES}·{@code TEST_CASES}) 읽기·쓰기 한 곳(TSK-04-03).
 * 엔진 AST 는 {@code Map} 이고 JSON 직렬화는 호출자 몫이다(TSK-03-02 AstExporter).
 */
public final class DomainJson {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private DomainJson() {}

    /** null·공백이면 null. */
    public static Map<String, Object> readMap(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return MAPPER.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON 객체가 아니다: " + json, e);
        }
    }

    /** null·공백이면 빈 목록. */
    public static List<Object> readList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return MAPPER.readValue(json, new TypeReference<List<Object>>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("JSON 배열이 아니다: " + json, e);
        }
    }

    /** null 이면 null. */
    public static String write(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException(e);
        }
    }
}
