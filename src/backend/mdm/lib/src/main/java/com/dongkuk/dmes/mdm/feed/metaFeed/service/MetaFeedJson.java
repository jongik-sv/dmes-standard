package com.dongkuk.dmes.mdm.feed.metaFeed.service;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * 피드 값 직렬화를 한 곳에 고정한다(spec 2026-10-02 §3.4). 엔진 레코드를 MVC 직렬화기(Boot 기본 설정)에 맡기지 않고 여기서 평범한
 * 맵·리스트·문자열·숫자로 바꾼다 — {@code LocalDateTime} 은 ISO 문자열({@code 2026-01-01T00:00:00}), {@code BigDecimal} 은 자리수 그대로,
 * {@code Map<Integer,…>} 키는 문자열. cactus {@code MdmJson} 이 같은 설정으로 되읽는다.
 */
public final class MetaFeedJson {

    private static final ObjectMapper MAPPER = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .build();

    private MetaFeedJson() {
    }

    public static Object plain(Object value) {
        return value == null ? null : MAPPER.convertValue(value, Object.class);
    }
}
