package com.dongkuk.dmes.cactus.integration.caravanhub;

import com.dongkuk.dmes.cactus.integration.caravanhub.exception.CaravanHubIntegrationException;

/**
 * caravan-hub EAI hub 호출 클라이언트.
 *
 * <p>v4 정본 — caravan 라이브러리에 의존하는 모듈은 caravan-hub 단 하나. 다른 모듈 (mcm/mpn/mpp/mqc) 은
 * 본 클라이언트를 통해 caravan-hub sync REST {@code POST /caravanHubApi/v1/send} 를 호출하여 Kafka 발행을 위임.
 *
 * <p><b>사용 예시</b>:
 * <pre>{@code
 * @Autowired CaravanHubIntegrationClient caravanHubClient;
 * CaravanHubSendResult result = caravanHubClient.send("MMPPMERPTT01", "PQR02012", interfaceMsg);
 * if (result.isSuccess()) {
 *     log.info("발행 완료, kafkaKeyData: {}", result.kafkaKeyData());
 * }
 * }</pre>
 *
 * <p><b>호환 계약</b>:
 * <ul>
 *   <li>응답의 {@code kafkaKeyData} 는 메시지 본문의 KAFKA_KEYDATA 와 동일 UUID (Phase 0-bis)</li>
 *   <li>HTTP 호출 자체 실패 / 재시도 모두 실패 시 {@link CaravanHubIntegrationException} 전파 — 호출 모듈은 자기 트랜잭션 rollback</li>
 * </ul>
 *
 * <p>v4 caravan-hub-EAI 마이그레이션 Phase 4-A (2026-05-13).
 */
public interface CaravanHubIntegrationClient {

    /**
     * 메시지 송신 — caravan-hub 의 {@code POST /caravanHubApi/v1/send} 호출.
     *
     * <p>caravan-hub 가 caravan {@code KafkaMessageProducer.send()} 로 Kafka 발행하고 응답에 KAFKA_KEYDATA 포함.
     *
     * @param topicId         Kafka 토픽 ID (= INTERFACE_ID)
     * @param transactionCode 트랜잭션 코드
     * @param interfaceMsg    인터페이스 메시지 (파이프 구분자 텍스트)
     * @return caravan-hub 응답 ({@link CaravanHubSendResult})
     * @throws CaravanHubIntegrationException 재시도 모두 실패 / 응답 역직렬화 실패 / HTTP 오류 시
     */
    CaravanHubSendResult send(String topicId, String transactionCode, String interfaceMsg);
}
