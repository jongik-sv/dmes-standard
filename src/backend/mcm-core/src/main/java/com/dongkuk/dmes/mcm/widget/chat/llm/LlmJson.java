package com.dongkuk.dmes.mcm.widget.chat.llm;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/**
 * 공급자 구현이 함께 쓰는 JSON 도구. 요청·응답 본문은 문자열로 주고받고 여기서 직렬화한다
 * (Spring 7 RestClient 가 Jackson 2·3 중 어느 변환기를 고를지에 기대지 않으려고 — 같은 방식: {@code AuditLogger}).
 */
final class LlmJson {

    static final ObjectMapper MAPPER = new ObjectMapper();

    private static final TypeReference<Map<String, Object>> MAP = new TypeReference<>() {};

    private LlmJson() {}

    static String write(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new LlmException("요청 본문을 만들지 못했습니다: " + e.getClass().getSimpleName(), e);
        }
    }

    static JsonNode read(String body, String provider) {
        if (body == null || body.isBlank()) throw new LlmException(provider + " 응답이 비어 있습니다");
        try {
            return MAPPER.readTree(body);
        } catch (JsonProcessingException e) {
            throw new LlmException(provider + " 응답이 JSON 이 아닙니다", e);
        }
    }

    /** JSON 객체 노드 → Map. 객체가 아니면 빈 Map. */
    static Map<String, Object> toMap(JsonNode node) {
        if (node == null || !node.isObject()) return Map.of();
        return MAPPER.convertValue(node, MAP);
    }

    /** JSON 문자열(OpenAI function.arguments) → Map. 깨진 값이면 빈 Map. */
    static Map<String, Object> parseObject(String json) {
        if (json == null || json.isBlank()) return Map.of();
        try {
            return toMap(MAPPER.readTree(json));
        } catch (JsonProcessingException e) {
            return Map.of();
        }
    }

    static String trimSlash(String url) {
        String s = url.trim();
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        return s;
    }

    static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
