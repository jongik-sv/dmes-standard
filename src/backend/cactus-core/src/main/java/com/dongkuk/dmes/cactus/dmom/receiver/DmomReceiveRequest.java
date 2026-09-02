package com.dongkuk.dmes.cactus.dmom.receiver;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * CaravanHub → MES 전문 수신 요청 본문 DTO.
 *
 * <p>CaravanHub 가 Kafka 에서 consume 한 메시지를 {@code HttpOutboundHandler} 로 그대로 POST 한다.
 * body 는 caravan {@code KafkaMessageContext.getRawMessageMap()} 의 JSON 직렬화로, 키는
 * caravan {@code KafkaConstants.FIELD_*}(전부 대문자)와 일치한다:
 * {@code TRANSACTION_CODE / INTERFACE_ID / INTERFACE_MSG / INTERFACE_PROTOCOL / KAFKA_KEYDATA}.
 *
 * <p>{@code rawMessageMap} 은 원본 메시지 전체라 위 5개 외 추가 키가 올 수 있어
 * {@code @JsonIgnoreProperties(ignoreUnknown = true)} 로 방어한다.
 *
 * @param transactionCode  트랜잭션 코드 (= 수신 BPMN serviceId)
 * @param interfaceId      인터페이스 ID (= topicId)
 * @param interfaceMsg     파이프 구분 전문(raw). 역파싱은 BPMN 첫 태스크에서 수행
 * @param interfaceProtocol 송신 프로토콜(예: {@code IF_KAFKA}, {@code HUB_HTTP})
 * @param kafkaKeyData     Kafka 메시지 키(멱등성 식별용, 선택)
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record DmomReceiveRequest(
        @JsonProperty("TRANSACTION_CODE") String transactionCode,
        @JsonProperty("INTERFACE_ID") String interfaceId,
        @JsonProperty("INTERFACE_MSG") String interfaceMsg,
        @JsonProperty("INTERFACE_PROTOCOL") String interfaceProtocol,
        @JsonProperty("KAFKA_KEYDATA") String kafkaKeyData
) {
}
