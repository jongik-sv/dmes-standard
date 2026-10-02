package com.dongkuk.dmes.cactus.mdm;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;

/**
 * MDM 메타 JSON 설정 한 곳 — MDM {@code MetaFeedJson} 과 같은 설정이다(spec §3.4). 모르는 칸은 무시하고(MDM 이 먼저 넓어져도 깨지지 않게),
 * 소수는 {@code BigDecimal} 로 읽어 코드 버전 자리수를 지킨다.
 */
public final class MdmJson {

    public static final ObjectMapper MAPPER = JsonMapper.builder()
            .addModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            // readTree 가 1.000 을 1 로 줄이지 않게 — 코드 버전 자리수를 지킨다.
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();

    private MdmJson() {
    }

    /** 응답 본문으로 내보낼 평범한 값 — 엔진 레코드의 {@code LocalDateTime} 을 ISO 문자열로 바꾼다. */
    public static Object plain(Object value) {
        return value == null ? null : MAPPER.convertValue(value, Object.class);
    }
}
