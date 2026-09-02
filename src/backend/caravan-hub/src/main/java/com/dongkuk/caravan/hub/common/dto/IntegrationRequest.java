package com.dongkuk.caravan.hub.common.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

/**
 * HTTP INBOUND 통합 요청 DTO.
 *
 * <p>외부 시스템이 {@code POST /caravanHubApi/v1/send} 엔드포인트로 전송하는 JSON 요청 본문을 매핑한다.
 * Jackson {@code @JsonProperty}로 대문자 JSON 키를 매핑하며, Lombok {@code @Data}로 getter/setter를 자동 생성한다.</p>
 *
 * <p>요청 예시:</p>
 * <pre>{@code
 * {
 *   "INTERFACE_ID": "MMPPMMCMTT01",
 *   "TRANSACTION_CODE": "CaravanHubConsumeHandler",
 *   "INTERFACE_MSG": "PQR02012|P|S|5A|20260130|..."
 * }
 * }</pre>
 *
 * <p>모든 필드는 필수이며, {@link com.dongkuk.caravan.hub.inbound.http.controller.HttpIntegrationController}에서
 * {@code null} 및 빈 문자열 여부를 검증한다.</p>
 *
 * @see IntegrationResponse
 * @see com.dongkuk.caravan.hub.inbound.http.controller.HttpIntegrationController
 */
@Data
public class IntegrationRequest {

    /**
     * 인터페이스 ID (= Kafka 토픽 ID).
     *
     * <p>Caravan {@code KafkaMessageProducer.send()}의 토픽 파라미터로 사용된다.</p>
     */
    @JsonProperty("INTERFACE_ID")
    private String INTERFACE_ID;

    /**
     * 트랜잭션 코드.
     *
     * <p>Caravan이 이 값을 기반으로 OUTBOUND 핸들러 Bean을 라우팅한다.</p>
     */
    @JsonProperty("TRANSACTION_CODE")
    private String TRANSACTION_CODE;

    /**
     * 파이프({@code |}) 구분 메시지 본문.
     *
     * <p>예: {@code "PQR02012|P|S|5A|20251230080141|JCM_TEST|MMPPMMCMTT01|||||20250808|00011|C|"}</p>
     */
    @JsonProperty("INTERFACE_MSG")
    private String INTERFACE_MSG;
}
