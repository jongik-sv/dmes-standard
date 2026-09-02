package com.dongkuk.caravan.console.caravanhub;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * caravan-hub {@code POST /caravanHubApi/v1/send} 응답 body (0.2.0 신규 — cactus 의존 제거 패턴 B).
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record ConsoleCaravanHubSendResult(
        @JsonProperty("resultCode") String resultCode,
        @JsonProperty("KAFKA_KEYDATA") String kafkaKeyData,
        @JsonProperty("INTERFACE_ID") String interfaceId,
        @JsonProperty("errorCode") String errorCode,
        @JsonProperty("errorMessage") String errorMessage,
        @JsonProperty("timestamp") String timestamp
) {
    public boolean isSuccess() {
        return "SUCCESS".equals(resultCode);
    }
}
