package com.dongkuk.dmes.cactus.integration.caravanhub;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * caravan-hub {@code POST /caravanHubApi/v1/send} 응답 body.
 *
 * <p>caravan-hub 의 {@code IntegrationResponse} 와 동일한 필드명 (대문자 + camelCase 혼재) 으로 역직렬화.
 *
 * <h3>성공 응답 예시</h3>
 * <pre>{@code
 * {
 *   "resultCode": "SUCCESS",
 *   "KAFKA_KEYDATA": "840d4999-196b-4740-a370-bc5eed4b30ae",
 *   "INTERFACE_ID": "MMPPMERPTT01",
 *   "timestamp": "2026-05-13T13:30:00"
 * }
 * }</pre>
 *
 * <h3>실패 응답 예시</h3>
 * <pre>{@code
 * {
 *   "resultCode": "ERROR",
 *   "errorCode": "INVALID_PARAMETER",
 *   "errorMessage": "INTERFACE_ID는 필수입니다.",
 *   "timestamp": "2026-05-13T13:30:00"
 * }
 * }</pre>
 *
 * <p>{@code kafkaKeyData} — 메시지 1건당 UUID (Phase 0-bis 에서 메시지 본문 KAFKA_KEYDATA 와 동일 값 보장).
 * 호출자가 본 값으로 메시지 상태 추적 / 멱등 처리 가능.
 *
 * <p>v4 caravan-hub-EAI 마이그레이션 Phase 4-A (2026-05-13).
 *
 * @param resultCode   결과 코드 ({@code "SUCCESS"} 또는 {@code "ERROR"})
 * @param kafkaKeyData 메시지 1건당 UUID (성공 시)
 * @param interfaceId  인터페이스 ID (= topic ID, 성공 시)
 * @param errorCode    에러 코드 (실패 시)
 * @param errorMessage 에러 메시지 (실패 시)
 * @param timestamp    처리 시각 (ISO 8601)
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record CaravanHubSendResult(
        @JsonProperty("resultCode") String resultCode,
        @JsonProperty("KAFKA_KEYDATA") String kafkaKeyData,
        @JsonProperty("INTERFACE_ID") String interfaceId,
        @JsonProperty("errorCode") String errorCode,
        @JsonProperty("errorMessage") String errorMessage,
        @JsonProperty("timestamp") String timestamp
) {
    /** 성공 응답 여부 — {@code resultCode == "SUCCESS"}. */
    public boolean isSuccess() {
        return "SUCCESS".equals(resultCode);
    }
}
