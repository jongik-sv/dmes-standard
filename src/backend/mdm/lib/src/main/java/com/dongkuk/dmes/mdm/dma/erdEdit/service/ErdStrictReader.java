package com.dongkuk.dmes.mdm.dma.erdEdit.service;

import com.dongkuk.dmes.mdm.dma.erdEdit.model.ErdModelCodec;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;

/**
 * 클라이언트 명령 JSON 을 엄격하게 읽는 리더(R4-3 이후 통제관 판정). {@link ErdModelCodec#MAPPER} 에서 갈라 만든 사본이라
 * MAPPER 설정은 그대로다. 느슨하게 읽으면 {@code length:3.7} 이 3 으로, {@code notNull:"true"} 가 true 로, {@code position:null} 이 0 으로
 * 조용히 바뀐다 — 명령은 모델을 바꾸므로 모양이 틀리면 예외 대신 INVALID 로 거절한다.
 * <ul>
 *   <li>소수 → 정수 변환 금지(ACCEPT_FLOAT_AS_INT 끔)</li>
 *   <li>문자열 → 불리언·숫자 변환 금지(ALLOW_COERCION_OF_SCALARS 끔)</li>
 *   <li>primitive 에 null 금지(FAIL_ON_NULL_FOR_PRIMITIVES 켬). 빠진 primitive 도 같은 설정으로 거절된다.</li>
 * </ul>
 */
final class ErdStrictReader {

    static final ObjectMapper STRICT = ((JsonMapper) ErdModelCodec.MAPPER).rebuild()
            .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
            .enable(DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES)
            .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
            .build();

    private ErdStrictReader() {
    }

    /**
     * 생략해도 되는 불리언 칸(primitive boolean 이라 빠지면 거절되는 것)을 false 로 채운 사본. 명시한 null·틀린 형은 그대로 두어 INVALID 가 난다.
     * 대상은 {@code ErdCommand} 레코드 중 primitive boolean 인 칸 전부다: addRelation.identifying(스펙 4.1 기본값 false) 하나.
     * 필수 숫자(moveColumn.position, 노드 x·y)는 채우지 않는다.
     */
    static JsonNode withOptionalBooleans(JsonNode n, String op) {
        java.util.List<String> fields = OPTIONAL_BOOLEANS.get(op);
        if (fields == null || !(n instanceof com.fasterxml.jackson.databind.node.ObjectNode o)) return n;
        com.fasterxml.jackson.databind.node.ObjectNode copy = o.deepCopy();
        for (String f : fields) if (!copy.has(f)) copy.put(f, false);
        return copy;
    }

    private static final java.util.Map<String, java.util.List<String>> OPTIONAL_BOOLEANS =
            java.util.Map.of("addRelation", java.util.List.of("identifying"));

    static <T> T read(JsonNode node, Class<T> type) throws JsonProcessingException {
        return STRICT.treeToValue(node, type);
    }

    /** Jackson 메시지는 클래스 이름·위치를 길게 담는다. 첫 줄만 쓴다. */
    static String brief(JsonProcessingException e) {
        String m = e.getOriginalMessage();
        if (m == null) return e.getClass().getSimpleName();
        int nl = m.indexOf('\n');
        return nl > 0 ? m.substring(0, nl) : m;
    }
}
