package com.dongkuk.dmes.cactus.integration.caravanhub;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * caravan-hub {@code POST /caravanHubApi/v1/send} 요청 body.
 *
 * <p>caravan-hub 의 {@code IntegrationRequest} 와 정확히 동일한 필드명 (대문자) 으로 JSON 직렬화한다.
 * cactus-core 는 caravan-hub 모듈을 의존하지 않으므로 자체 record 정의.
 *
 * <p>v4 caravan-hub-EAI 마이그레이션 Phase 4-A (2026-05-13).
 *
 * @param interfaceId     인터페이스 ID (= Kafka topic ID)
 * @param transactionCode 트랜잭션 코드
 * @param interfaceMsg    인터페이스 메시지 (파이프 구분자 텍스트)
 */
public record CaravanHubSendRequest(
        @JsonProperty("INTERFACE_ID") String interfaceId,
        @JsonProperty("TRANSACTION_CODE") String transactionCode,
        @JsonProperty("INTERFACE_MSG") String interfaceMsg
) {
}
