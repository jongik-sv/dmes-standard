package com.dongkuk.caravan.core.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Map;

/**
 * JSON 유틸리티 클래스
 *
 * <p>Jackson ObjectMapper를 사용한 JSON 변환 유틸리티입니다.</p>
 *
 * <h3>제공 기능</h3>
 * <ul>
 *   <li>JSON → Map 변환</li>
 *   <li>JSON → 객체 변환</li>
 *   <li>객체 → JSON 변환</li>
 *   <li>JSON 유효성 검증</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * // JSON → Map
 * Map<String, Object> map = JsonUtil.parseMap("{\"key\": \"value\"}");
 *
 * // 객체 → JSON
 * String json = JsonUtil.toJson(myObject);
 *
 * // JSON 유효성 검증
 * if (JsonUtil.isValidJson(text)) {
 *     // valid JSON
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 */
public final class JsonUtil {

    private static final Logger log = LoggerFactory.getLogger(JsonUtil.class);

    /** 공유 ObjectMapper 인스턴스 (Thread-safe) */
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /** 유틸리티 클래스이므로 인스턴스화 방지 */
    private JsonUtil() {}

    /**
     * JSON 문자열을 Map으로 파싱합니다.
     *
     * <p>Kafka 메시지 파싱에 주로 사용됩니다.</p>
     *
     * @param json JSON 문자열
     * @return 파싱된 Map 객체
     * @throws RuntimeException JSON 파싱 실패 시
     */
    public static Map<String, Object> parseMap(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {});
        } catch (JsonProcessingException e) {
            log.error("JSON 파싱 실패: {}", e.getMessage());
            throw new RuntimeException("JSON 파싱 실패", e);
        }
    }

    /**
     * 객체를 JSON 문자열로 변환합니다.
     *
     * @param obj 변환할 객체
     * @return JSON 문자열
     * @throws RuntimeException JSON 변환 실패 시
     */
    public static String toJson(Object obj) {
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (JsonProcessingException e) {
            log.error("JSON 변환 실패: {}", e.getMessage());
            throw new RuntimeException("JSON 변환 실패", e);
        }
    }

    /**
     * JSON 문자열을 지정된 타입으로 파싱합니다.
     *
     * <h4>사용 예시</h4>
     * <pre>{@code
     * MyDto dto = JsonUtil.parse(jsonString, MyDto.class);
     * }</pre>
     *
     * @param json JSON 문자열
     * @param type 대상 클래스 타입
     * @param <T>  반환 타입
     * @return 파싱된 객체
     * @throws RuntimeException JSON 파싱 실패 시
     */
    public static <T> T parse(String json, Class<T> type) {
        try {
            return objectMapper.readValue(json, type);
        } catch (JsonProcessingException e) {
            log.error("JSON 파싱 실패: {}", e.getMessage());
            throw new RuntimeException("JSON 파싱 실패", e);
        }
    }

    /**
     * 문자열이 유효한 JSON인지 확인합니다.
     *
     * @param json 검증할 문자열
     * @return JSON 유효 여부
     *         <ul>
     *           <li>{@code true}: 유효한 JSON</li>
     *           <li>{@code false}: null, 빈 문자열, 또는 유효하지 않은 JSON</li>
     *         </ul>
     */
    public static boolean isValidJson(String json) {
        if (json == null || json.trim().isEmpty()) {
            return false;
        }
        try {
            objectMapper.readTree(json);
            return true;
        } catch (JsonProcessingException e) {
            return false;
        }
    }
}
