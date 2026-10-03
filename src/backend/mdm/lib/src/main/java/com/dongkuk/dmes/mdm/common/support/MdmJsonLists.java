package com.dongkuk.dmes.mdm.common.support;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * DB 칸에 담긴 JSON 배열(문자열 목록·ID 목록)을 읽고 쓰는 공용 코덱.
 *
 * <p>서비스마다 따로 두던 파서를 모았다. 읽는 방식이 호출부마다 달라서 메서드를 나눠 둔다. 호출부가 쓰던 방식 그대로 고른다.
 * <ul>
 *   <li>{@link #readStrings} — 엄격 문자열 목록. 용어 관리 검색·추천 캐시가 쓴다.</li>
 *   <li>{@link #readArrayElements} — 원소 단위 관대 읽기. 원소를 어떻게 쓸지는 호출부가 정한다(용어 사전 표면형).</li>
 *   <li>{@link #readLongs} — ID 목록. 컬럼의 TERM_IDS 가 쓴다.</li>
 * </ul>
 *
 * <p>Spring Boot 4 는 기본 JSON 스택으로 tools.jackson(Jackson 3)을 쓰고 classic {@link ObjectMapper} 빈을 자동 등록하지 않는다.
 * 그래서 기본 설정의 classic {@link ObjectMapper} 를 직접 만들어 쓴다. 기본 설정이어야 한다 — 배열 뒤에 남은 글자를 무시하고
 * (FAIL_ON_TRAILING_TOKENS 꺼짐) 스칼라 원소를 문자열로 바꾸는 지금 동작이 이 설정에 묶여 있다.
 */
public final class MdmJsonLists {

    private static final Logger log = LoggerFactory.getLogger(MdmJsonLists.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() { };

    private MdmJsonLists() {
    }

    /**
     * 엄격 문자열 목록 — {@code readValue(json, List<String>)}.
     *
     * <ul>
     *   <li>null·공백({@code isBlank})이면 {@code List.of()}. 파싱 예외(깨진 JSON·배열이 아닌 값)도 {@code List.of()} 이고 경고 로그를
     *       남긴다.</li>
     *   <li>JSON {@code null} 리터럴은 {@code null} 을 돌려준다(빈 목록 아님).</li>
     *   <li>숫자·불린 원소는 문자열로 바뀌고, 원소의 공백·빈 문자열·null 은 그대로 남는다. 배열 뒤에 남은 글자는 무시한다.</li>
     * </ul>
     *
     * @param logLabel 파싱 실패 경고 로그 앞머리에 붙일 호출부 이름
     */
    public static List<String> readStrings(String json, String logLabel) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return MAPPER.readValue(json, STRING_LIST);
        } catch (Exception e) {
            log.warn("[{}] JSON 파싱 실패 — 빈 목록으로 대체: {}", logLabel, json, e);
            return List.of();
        }
    }

    /**
     * 원소 단위 관대 읽기 — 루트 배열의 원소 노드를 순서대로 돌려준다. null·공백·파싱 오류·배열이 아닌 루트는 빈 목록이다(로그 없음).
     * 돌려주는 목록은 새 {@link ArrayList} 다.
     */
    public static List<JsonNode> readArrayElements(String json) {
        List<JsonNode> out = new ArrayList<>();
        if (json == null || json.isBlank()) {
            return out;
        }
        JsonNode root;
        try {
            root = MAPPER.readTree(json);
        } catch (Exception e) {
            return out;
        }
        if (root == null || !root.isArray()) {
            return out;
        }
        for (JsonNode element : root) {
            out.add(element);
        }
        return out;
    }

    /**
     * ID 목록 — JSON 숫자 배열을 {@code Long} 목록으로 읽는다. JSON {@code null} 원소는 자리를 지키도록 null 로 남기고,
     * {@code canConvertToLong} 인 숫자 원소만 읽는다(소수는 버림). 문자열·불린·객체·배열 원소는 건너뛴다. 루트가 배열이 아니거나 파싱이
     * 안 되면 빈 목록이다. 돌려주는 목록은 새 {@link ArrayList} 다.
     */
    public static List<Long> readLongs(String json) {
        List<Long> ids = new ArrayList<>();
        for (JsonNode node : readArrayElements(json)) {
            if (node.isNull()) {
                ids.add(null);
            } else if (node.canConvertToLong()) {
                ids.add(node.asLong());
            }
        }
        return ids;
    }

    /** 문자열 목록을 공백 없는 JSON 배열로 쓴다. null·빈 목록이면 null. 한글은 이스케이프하지 않는다. */
    public static String writeStrings(List<String> list) {
        if (list == null || list.isEmpty()) {
            return null;
        }
        try {
            return MAPPER.writeValueAsString(list);
        } catch (Exception e) {
            throw new IllegalStateException("JSON 직렬화 실패", e);
        }
    }
}
