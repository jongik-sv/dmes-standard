package com.dongkuk.caravan.hub.common.dto;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * IntegrationResponse DTO 팩토리 메서드 테스트
 */
class IntegrationResponseTest {

    @Nested
    @DisplayName("success 팩토리 메서드")
    class SuccessFactory {

        @Test
        @DisplayName("success() 호출 시 resultCode=SUCCESS, 필드값 매핑 확인")
        void shouldCreateSuccessResponse() {
            // when
            IntegrationResponse response = IntegrationResponse.success("keydata-123", "TOPIC_01");

            // then
            assertThat(response.getResultCode()).isEqualTo("SUCCESS");
            assertThat(response.getKAFKA_KEYDATA()).isEqualTo("keydata-123");
            assertThat(response.getINTERFACE_ID()).isEqualTo("TOPIC_01");
            assertThat(response.getTimestamp()).isNotNull();
            assertThat(response.getTimestamp()).isNotBlank();
            assertThat(response.getErrorCode()).isNull();
            assertThat(response.getErrorMessage()).isNull();
        }

        @Test
        @DisplayName("timestamp는 ISO 8601 형식")
        void shouldHaveIsoTimestamp() {
            // when
            IntegrationResponse response = IntegrationResponse.success("key", "topic");

            // then
            assertThat(response.getTimestamp()).matches("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}.*");
        }
    }

    @Nested
    @DisplayName("error 팩토리 메서드")
    class ErrorFactory {

        @Test
        @DisplayName("error() 호출 시 resultCode=ERROR, 에러 정보 매핑 확인")
        void shouldCreateErrorResponse() {
            // when
            IntegrationResponse response = IntegrationResponse.error("INVALID_PARAMETER", "INTERFACE_ID는 필수입니다.");

            // then
            assertThat(response.getResultCode()).isEqualTo("ERROR");
            assertThat(response.getErrorCode()).isEqualTo("INVALID_PARAMETER");
            assertThat(response.getErrorMessage()).isEqualTo("INTERFACE_ID는 필수입니다.");
            assertThat(response.getTimestamp()).isNotNull();
            assertThat(response.getKAFKA_KEYDATA()).isNull();
            assertThat(response.getINTERFACE_ID()).isNull();
        }

        @Test
        @DisplayName("SYSTEM_ERROR 에러 응답 생성")
        void shouldCreateSystemErrorResponse() {
            // when
            IntegrationResponse response = IntegrationResponse.error("SYSTEM_ERROR", "Kafka unavailable");

            // then
            assertThat(response.getResultCode()).isEqualTo("ERROR");
            assertThat(response.getErrorCode()).isEqualTo("SYSTEM_ERROR");
            assertThat(response.getErrorMessage()).isEqualTo("Kafka unavailable");
        }
    }
}
