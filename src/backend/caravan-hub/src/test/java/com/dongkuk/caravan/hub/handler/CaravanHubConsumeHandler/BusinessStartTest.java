package com.dongkuk.caravan.hub.handler.CaravanHubConsumeHandler;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.apache.camel.CamelExecutionException;
import org.apache.camel.ProducerTemplate;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.dongkuk.caravan.core.handler.HandleResult;
import com.dongkuk.caravan.core.model.KafkaMessageContext;

/**
 * BusinessStart(OUTBOUND 진입점) 테스트 — Camel 브릿지 전환 후.
 *
 * <p>direct:outbound-dispatch 로 위임하며, 라우트 성공 → success / 라우트 예외 → failRetryable(큐막기 트리거)
 * 로 변환됨을 검증한다. (실제 라우팅/송신은 OutboundDispatchRoute + 핸들러가 담당, 별도 검증)</p>
 */
@ExtendWith(MockitoExtension.class)
class BusinessStartTest {

    @Mock
    private ProducerTemplate producerTemplate;

    @InjectMocks
    private BusinessStart businessStart;

    private static KafkaMessageContext context(String topic) {
        KafkaMessageContext ctx = mock(KafkaMessageContext.class);
        when(ctx.getTopic()).thenReturn(topic);
        return ctx;
    }

    @Nested
    @DisplayName("정상 처리")
    class SuccessScenario {

        @Test
        @DisplayName("라우트 정상 실행 시 success 반환 + direct:outbound-dispatch 로 전달")
        void shouldReturnSuccess() {
            KafkaMessageContext ctx = context("MMPPMMCMTT01");

            HandleResult result = businessStart.businessHandle(ctx);

            assertThat(result.isSuccess()).isTrue();
            assertThat(result.isRetryable()).isFalse();
            verify(producerTemplate).sendBody("direct:outbound-dispatch", ctx);
        }
    }

    @Nested
    @DisplayName("실패 → failRetryable(큐막기 트리거)")
    class FailureScenario {

        @Test
        @DisplayName("라우트 예외(CamelExecutionException) 시 failRetryable 반환")
        void camelExecutionExceptionMapsToFailRetryable() {
            KafkaMessageContext ctx = context("MMPPMMCMTT01");
            doThrow(new CamelExecutionException("route failed", null,
                    new IllegalStateException("HTTP 전송 실패 - ResponseCode: 500")))
                    .when(producerTemplate).sendBody(anyString(), any());

            HandleResult result = businessStart.businessHandle(ctx);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.isRetryable()).isTrue();
        }

        @Test
        @DisplayName("일반 예외 시에도 failRetryable 반환")
        void genericExceptionMapsToFailRetryable() {
            KafkaMessageContext ctx = context("UNKNOWN_TOPIC");
            doThrow(new RuntimeException("OUTBOUND 설정 없음"))
                    .when(producerTemplate).sendBody(anyString(), any());

            HandleResult result = businessStart.businessHandle(ctx);

            assertThat(result.isSuccess()).isFalse();
            assertThat(result.isRetryable()).isTrue();
        }
    }
}
