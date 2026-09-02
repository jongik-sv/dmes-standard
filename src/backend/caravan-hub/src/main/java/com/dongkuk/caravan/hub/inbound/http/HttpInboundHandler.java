package com.dongkuk.caravan.hub.inbound.http;

import org.springframework.stereotype.Component;

import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.core.producer.SendResult;
import com.dongkuk.caravan.hub.common.dto.IntegrationRequest;
import com.dongkuk.caravan.hub.common.dto.IntegrationResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * HTTP INBOUND 처리 핸들러.
 *
 * <p>{@link HttpInboundRoute} 가 REST 바인딩/상태코드 매핑을 담당하고, 검증·Kafka 발행 로직은 본 핸들러가
 * 담당한다(단위 테스트 대상). 구 {@code HttpIntegrationController} 의 로직을 그대로 이식했다.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HttpInboundHandler {

    private final KafkaMessageProducer kafkaMessageProducer;

    /**
     * 요청을 검증하고 Kafka 로 발행한다.
     *
     * @param request 통합 요청 DTO
     * @return 성공 응답({@code resultCode=SUCCESS})
     * @throws IllegalArgumentException 필수 파라미터 누락 시(라우트에서 HTTP 400 매핑)
     */
    public IntegrationResponse handle(IntegrationRequest request) {
        validateRequest(request);

        log.info("메시지 전송 요청 - INTERFACE_ID: {}, TRANSACTION_CODE: {}",
                request.getINTERFACE_ID(), request.getTRANSACTION_CODE());

        String topic = request.getINTERFACE_ID();
        SendResult result = kafkaMessageProducer.send(
                topic, request.getTRANSACTION_CODE(), request.getINTERFACE_MSG());

        log.info("메시지 전송 완료 - topic: {}, partition: {}, offset: {}, kafkaKeyData: {}",
                result.getTopic(), result.getPartition(), result.getOffset(), result.getKafkaKeyData());
        return IntegrationResponse.success(result.getKafkaKeyData(), topic);
    }

    private void validateRequest(IntegrationRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("요청 본문이 비어 있습니다.");
        }
        if (request.getINTERFACE_ID() == null || request.getINTERFACE_ID().trim().isEmpty()) {
            throw new IllegalArgumentException("INTERFACE_ID는 필수입니다.");
        }
        if (request.getTRANSACTION_CODE() == null || request.getTRANSACTION_CODE().trim().isEmpty()) {
            throw new IllegalArgumentException("TRANSACTION_CODE는 필수입니다.");
        }
        if (request.getINTERFACE_MSG() == null || request.getINTERFACE_MSG().trim().isEmpty()) {
            throw new IllegalArgumentException("INTERFACE_MSG는 필수입니다.");
        }
    }
}
