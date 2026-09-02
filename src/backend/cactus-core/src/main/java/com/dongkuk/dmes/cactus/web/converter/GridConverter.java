package com.dongkuk.dmes.cactus.web.converter;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Map&lt;String, Object&gt; ↔ DTO 변환 유틸.
 * Jackson ObjectMapper를 사용하여 변환한다.
 */
public class GridConverter {

    /** 변환에 사용하는 ObjectMapper (알 수 없는 속성 무시 설정) */
    private static final ObjectMapper MAPPER = new ObjectMapper()
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

    /** 인스턴스 생성 방지용 private 생성자. */
    private GridConverter() {
    }

    /**
     * Map 리스트를 DTO 리스트로 변환한다.
     * 매핑되지 않는 필드는 무시한다.
     *
     * @param rows Map 리스트
     * @param type 변환할 DTO 클래스
     * @return 변환된 DTO 리스트
     */
    public static <T> List<T> convert(List<Map<String, Object>> rows, Class<T> type) {
        try {
            return rows.stream()
                    .map(GridConverter::normalizeEmptyStrings)
                    .map(row -> MAPPER.convertValue(row, type))
                    .collect(Collectors.toList());
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException(
                    "그리드 행 → " + type.getSimpleName() + " 변환 실패: " + e.getMessage(), e);
        }
    }

    /**
     * DTO 리스트를 Map 리스트로 변환한다.
     * CactusResponse에 그리드를 담을 때 사용한다.
     */
    @SuppressWarnings("unchecked")
    public static <T> List<Map<String, Object>> toMapList(List<T> dtoList) {
        return dtoList.stream()
                .map(dto -> MAPPER.convertValue(dto, Map.class))
                .map(map -> (Map<String, Object>) map)
                .collect(Collectors.toList());
    }

    /**
     * 빈문자열("")을 null로 정규화한다.
     * 숫자/날짜/불린 필드에 ""이 들어오면 DTO 변환 시 예외가 발생하므로,
     * 변환 전에 "" → null로 치환한다.
     */
    private static Map<String, Object> normalizeEmptyStrings(Map<String, Object> row) {
        Map<String, Object> normalized = new HashMap<>(row);
        normalized.replaceAll((key, value) -> "".equals(value) ? null : value);
        return normalized;
    }
}
