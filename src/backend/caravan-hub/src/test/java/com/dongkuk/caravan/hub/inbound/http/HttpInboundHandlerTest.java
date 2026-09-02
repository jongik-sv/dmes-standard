package com.dongkuk.caravan.hub.inbound.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.core.producer.SendResult;
import com.dongkuk.caravan.hub.common.dto.IntegrationRequest;
import com.dongkuk.caravan.hub.common.dto.IntegrationResponse;

/**
 * HTTP INBOUND 핸들러 단위 테스트 (구 HttpIntegrationControllerTest 이식).
 *
 * <p>검증·발행 로직을 직접 검증한다. HTTP 상태코드 매핑(400/500)은 {@link HttpInboundRoute} 의
 * onException 이 담당하며 localKafka E2E 로 확인한다.</p>
 */
@ExtendWith(MockitoExtension.class)
class HttpInboundHandlerTest {

    @Mock
    private KafkaMessageProducer kafkaMessageProducer;

    @InjectMocks
    private HttpInboundHandler handler;

    private static IntegrationRequest request(String id, String tc, String msg) {
        IntegrationRequest r = new IntegrationRequest();
        r.setINTERFACE_ID(id);
        r.setTRANSACTION_CODE(tc);
        r.setINTERFACE_MSG(msg);
        return r;
    }

    @Nested
    @DisplayName("TC-HTTP-001: 정상 전송")
    class NormalSend {

        @Test
        @DisplayName("필수 파라미터 모두 포함 시 SUCCESS 응답 + 올바른 인자로 발행")
        void shouldReturnSuccess() {
            SendResult sendResult = mock(SendResult.class);
            when(sendResult.getKafkaKeyData()).thenReturn("11111111-2222-3333-4444-555555555555");
            when(kafkaMessageProducer.send(eq("MMPPMMCMTT01"), eq("CaravanHubConsumeHandler"), anyString()))
                    .thenReturn(sendResult);

            IntegrationResponse res = handler.handle(
                    request("MMPPMMCMTT01", "CaravanHubConsumeHandler", "PQR02012|P|S|5A|20260130|JCM_TEST"));

            assertThat(res.getResultCode()).isEqualTo("SUCCESS");
            assertThat(res.getKAFKA_KEYDATA()).isEqualTo("11111111-2222-3333-4444-555555555555");
            assertThat(res.getINTERFACE_ID()).isEqualTo("MMPPMMCMTT01");
            assertThat(res.getTimestamp()).isNotEmpty();
            verify(kafkaMessageProducer).send(
                    "MMPPMMCMTT01", "CaravanHubConsumeHandler", "PQR02012|P|S|5A|20260130|JCM_TEST");
        }
    }

    @Nested
    @DisplayName("TC-HTTP-002~004: 필수 파라미터 누락")
    class MissingParameters {

        @Test
        @DisplayName("INTERFACE_ID null → IllegalArgumentException, 발행 안 함")
        void missingInterfaceId() {
            assertThatThrownBy(() -> handler.handle(
                    request(null, "CaravanHubConsumeHandler", "PQR02012|P|S|5A")))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("INTERFACE_ID");
            verify(kafkaMessageProducer, never()).send(anyString(), anyString(), anyString());
        }

        @Test
        @DisplayName("TRANSACTION_CODE null → IllegalArgumentException")
        void missingTransactionCode() {
            assertThatThrownBy(() -> handler.handle(
                    request("MMPPMMCMTT01", null, "PQR02012|P|S|5A")))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("TRANSACTION_CODE");
        }

        @Test
        @DisplayName("INTERFACE_MSG null → IllegalArgumentException")
        void missingInterfaceMsg() {
            assertThatThrownBy(() -> handler.handle(
                    request("MMPPMMCMTT01", "CaravanHubConsumeHandler", null)))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("INTERFACE_MSG");
        }
    }

    @Nested
    @DisplayName("TC-HTTP-005/007: 빈 문자열·null 요청")
    class BlankOrNull {

        @Test
        @DisplayName("INTERFACE_ID 빈 문자열 → IllegalArgumentException")
        void emptyInterfaceId() {
            assertThatThrownBy(() -> handler.handle(
                    request("", "CaravanHubConsumeHandler", "PQR02012|P|S|5A")))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("TRANSACTION_CODE 공백만 → IllegalArgumentException")
        void blankTransactionCode() {
            assertThatThrownBy(() -> handler.handle(
                    request("MMPPMMCMTT01", "   ", "PQR02012|P|S|5A")))
                    .isInstanceOf(IllegalArgumentException.class);
        }

        @Test
        @DisplayName("null 요청 → IllegalArgumentException")
        void nullRequest() {
            assertThatThrownBy(() -> handler.handle(null))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @Nested
    @DisplayName("TC-HTTP-006: Kafka 발행 실패")
    class KafkaFailure {

        @Test
        @DisplayName("KafkaMessageProducer 예외 → 그대로 전파(라우트에서 500 매핑)")
        void kafkaSendFails() {
            when(kafkaMessageProducer.send(anyString(), anyString(), anyString()))
                    .thenThrow(new RuntimeException("Kafka broker unavailable"));

            assertThatThrownBy(() -> handler.handle(
                    request("MMPPMMCMTT01", "CaravanHubConsumeHandler", "PQR02012|P|S|5A")))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("Kafka broker unavailable");
        }
    }
}
