package com.dongkuk.caravan.console.caravanhub;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * caravan-hub {@code POST /caravanHubApi/v1/send} 요청 body (0.2.0 신규 — cactus 의존 제거 패턴 B).
 */
public record ConsoleCaravanHubSendRequest(
        @JsonProperty("INTERFACE_ID") String interfaceId,
        @JsonProperty("TRANSACTION_CODE") String transactionCode,
        @JsonProperty("INTERFACE_MSG") String interfaceMsg
) {
}
