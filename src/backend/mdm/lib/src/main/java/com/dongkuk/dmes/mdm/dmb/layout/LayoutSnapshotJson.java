package com.dongkuk.dmes.mdm.dmb.layout;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import java.util.Map;

/**
 * 스냅샷 JSON 정규화 직렬화(TSK-05-03 design.md §2 — 불변 I15·I22, naming-dialect-rules §3 #3·#6). 키 정렬·공백 없음·UTF-8.
 * 같은 스냅샷은 늘 같은 문자열이 된다. null 칸도 키를 남긴다 —
 * 스키마가 모든 키를 required 로 둔다(F13).
 */
public final class LayoutSnapshotJson {

    private static final ObjectMapper MAPPER = JsonMapper.builder()
            .enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
            .disable(MapperFeature.SORT_CREATOR_PROPERTIES_FIRST)
            .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS)
            .disable(SerializationFeature.INDENT_OUTPUT)
            .build();

    private LayoutSnapshotJson() {
    }

    public static String write(MdmLayoutSnapshot snapshot) {
        try {
            return MAPPER.writeValueAsString(snapshot);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("스냅샷 JSON 을 쓰지 못했다", e);
        }
    }

    public static MdmLayoutSnapshot read(String json) {
        try {
            return MAPPER.readValue(json, MdmLayoutSnapshot.class);
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("스냅샷 JSON 이 아니다", e);
        }
    }

    /** export 응답용 — 정규화 JSON 을 키 순서 그대로 Map 으로. */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> toMap(MdmLayoutSnapshot snapshot) {
        try {
            return MAPPER.readValue(write(snapshot), Map.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    /** 스냅샷이 아닌 값(예: {@link LayoutBodySnapshot})도 같은 정규화로 쓴다 — 키 정렬·공백 없음. */
    public static String writeAny(Object value) {
        try {
            return MAPPER.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("JSON 을 쓰지 못했다", e);
        }
    }
}
