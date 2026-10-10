package com.dongkuk.dmes.mdm.dma.erdEdit.model;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;

/**
 * MODEL_JSON 읽기·쓰기. 키 순서는 삽입 순서를 지킨다(스냅샷·diff 가 흔들리지 않게).
 *
 * <p>Spring Boot 4 의 HTTP JSON 은 Jackson 3(tools.jackson)이다. 이 코덱은 classic Jackson 2(com.fasterxml)를 직접 만들어 쓴다
 * ({@code MdmJsonLists} 와 같은 이유). OASIS 응답은 {@link #MAPPER} 의 convertValue 로 일반 Map·List 로 바꿔 내보내고,
 * SSE 는 {@link #MAPPER} 로 만든 문자열을 보낸다.
 */
public final class ErdModelCodec {

    public static final ObjectMapper MAPPER = JsonMapper.builder()
            .configure(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS, false)
            .configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, true)
            .build();

    /** 이 코드가 아는 모델 JSON 스키마 버전(ErdModel.schemaVersion). 두 번째 버전이 생기면 여기서 옮겨 읽는다(deferred 32). */
    static final int SCHEMA_VERSION = 1;

    private ErdModelCodec() {
    }

    public static ErdModel read(String json) {
        ErdModel m;
        try {
            m = MAPPER.readValue(json, ErdModel.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("MODEL_JSON 을 읽을 수 없습니다: " + e.getOriginalMessage(), e);
        }
        if (m.schemaVersion != SCHEMA_VERSION) {
            throw new IllegalStateException("모델 JSON schemaVersion 을 모릅니다: " + m.schemaVersion);
        }
        return m;
    }

    public static String write(ErdModel model) {
        try {
            return MAPPER.writeValueAsString(model);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("MODEL_JSON 을 쓸 수 없습니다", e);
        }
    }

    public static ErdModel copy(ErdModel model) {
        return read(write(model));
    }
}
