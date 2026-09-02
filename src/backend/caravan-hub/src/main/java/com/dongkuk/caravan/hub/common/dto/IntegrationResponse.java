package com.dongkuk.caravan.hub.common.dto;

import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * HTTP INBOUND 통합 응답 DTO.
 *
 * <p>{@code POST /caravanHubApi/v1/send} 엔드포인트의 응답 본문을 구성한다.
 * {@code @Builder} 패턴을 사용하며, {@link #success(String, String)} / {@link #error(String, String)}
 * 정적 팩토리 메서드를 제공한다.</p>
 *
 * <p>성공 응답 예시:</p>
 * <pre>{@code
 * {
 *   "resultCode": "SUCCESS",
 *   "KAFKA_KEYDATA": "TOPIC_ID",
 *   "INTERFACE_ID": "TOPIC_ID",
 *   "timestamp": "2026-02-05T10:30:00"
 * }
 * }</pre>
 *
 * <p>실패 응답 예시:</p>
 * <pre>{@code
 * {
 *   "resultCode": "ERROR",
 *   "errorCode": "INVALID_PARAMETER",
 *   "errorMessage": "INTERFACE_ID는 필수입니다.",
 *   "timestamp": "2026-02-05T10:30:00"
 * }
 * }</pre>
 *
 * @see IntegrationRequest
 * @see com.dongkuk.caravan.hub.inbound.http.controller.HttpIntegrationController
 */
@Data
@Builder
// 필드 @JsonProperty 만으로 직렬화(대문자 키). getter 자동탐지를 끄지 않으면 camel-jackson 이
// getter 파생 소문자 키(interface_ID 등)를 중복 생성한다. (Spring MVC 경로와 동일 계약 유지)
@JsonAutoDetect(
        fieldVisibility = JsonAutoDetect.Visibility.ANY,
        getterVisibility = JsonAutoDetect.Visibility.NONE,
        isGetterVisibility = JsonAutoDetect.Visibility.NONE)
public class IntegrationResponse {

    /** 결과 코드 ({@code "SUCCESS"} 또는 {@code "ERROR"}) */
    @JsonProperty("resultCode")
    private String resultCode;

    /** Kafka 메시지 Key (성공 시 토픽 ID) */
    @JsonProperty("KAFKA_KEYDATA")
    private String KAFKA_KEYDATA;

    /** 인터페이스 ID (성공 시 토픽 ID) */
    @JsonProperty("INTERFACE_ID")
    private String INTERFACE_ID;

    /** 처리 시간 (ISO 8601 형식) */
    @JsonProperty("timestamp")
    private String timestamp;

    /** 에러 코드 (실패 시, 예: {@code "INVALID_PARAMETER"}, {@code "SYSTEM_ERROR"}) */
    @JsonProperty("errorCode")
    private String errorCode;

    /** 에러 메시지 (실패 시 상세 설명) */
    @JsonProperty("errorMessage")
    private String errorMessage;

    /**
     * 성공 응답을 생성하는 정적 팩토리 메서드.
     *
     * @param kafkaKeydata Kafka 메시지 키
     * @param interfaceId  인터페이스 ID (토픽 ID)
     * @return {@code resultCode}가 {@code "SUCCESS"}인 응답 객체
     */
    public static IntegrationResponse success(String kafkaKeydata, String interfaceId) {
        return IntegrationResponse.builder()
                .resultCode("SUCCESS")
                .KAFKA_KEYDATA(kafkaKeydata)
                .INTERFACE_ID(interfaceId)
                .timestamp(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                .build();
    }

    /**
     * 실패 응답을 생성하는 정적 팩토리 메서드.
     *
     * <p>파라미터 오류 시 {@code errorCode}에 {@code "INVALID_PARAMETER"} (HTTP 400),
     * 시스템 오류 시 {@code "SYSTEM_ERROR"} (HTTP 500)를 사용한다.</p>
     *
     * @param errorCode    에러 코드
     * @param errorMessage 에러 상세 메시지
     * @return {@code resultCode}가 {@code "ERROR"}인 응답 객체
     */
    public static IntegrationResponse error(String errorCode, String errorMessage) {
        return IntegrationResponse.builder()
                .resultCode("ERROR")
                .errorCode(errorCode)
                .errorMessage(errorMessage)
                .timestamp(LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
                .build();
    }
}
