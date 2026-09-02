package com.dongkuk.caravan.core.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Kafka 표준 메시지 DTO
 *
 * <p>Kafka로 전송할 메시지의 비즈니스 필드를 담는 객체입니다.
 * {@link com.dongkuk.caravan.core.producer.KafkaMessageProducer}에서 이 객체를 받아
 * 표준 JSON 포맷으로 자동 변환하여 전송합니다.</p>
 *
 * <h3>자동 생성 필드 (라이브러리에서 자동 설정)</h3>
 * <ul>
 *   <li>{@code KAFKA_KEYDATA}: 랜덤 UUID</li>
 *   <li>{@code INTERFACE_ID}: 토픽명과 동일</li>
 *   <li>{@code INTERFACE_PROTOCOL}: "IF_KAFKA" 고정</li>
 * </ul>
 *
 * <h3>전송 시 생성되는 JSON</h3>
 * <pre>{@code
 * {
 *     "TRANSACTION_CODE": "PQR02012",
 *     "KAFKA_KEYDATA": "840d4999-196b-4740-a370-bc5eed4b30ae",
 *     "INTERFACE_ID": "MMPPMERPTT01",
 *     "INTERFACE_MSG": "PQR02012|P|S|5A|20260130111245|JCM_TEST|MMPPMERPTT01|||||20250808|00011|C|",
 *     "INTERFACE_PROTOCOL": "IF_KAFKA"
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.producer.KafkaMessageProducer
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KafkaMessage {
    /** TRANSACTION_CODE - 트랜잭션 코드 (필수) */
    private String transactionCode;
    /** INTERFACE_MSG - 파이프(|) 구분자 메시지 (필수) */
    private String interfaceMsg;
}
