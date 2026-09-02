package com.dongkuk.caravan.hub.outbound.http;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.config.CaravanHubProperties;
import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.io.InputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

/**
 * TC-OHTTP-001 ~ TC-OHTTP-010: OUTBOUND HTTP 핸들러 테스트
 */
@ExtendWith(MockitoExtension.class)
class HttpOutboundHandlerTest {

    @Mock
    private CaravanHubProperties properties;

    @InjectMocks
    private HttpOutboundHandler httpOutboundHandler;

    @BeforeEach
    void setUp() {
        CaravanHubProperties.Outbound outbound = new CaravanHubProperties.Outbound();
        CaravanHubProperties.Outbound.Http http = new CaravanHubProperties.Outbound.Http();
        http.setConnectTimeout(5000);
        http.setReadTimeout(10000);
        outbound.setHttp(http);
        lenient().when(properties.getOutbound()).thenReturn(outbound);
    }

    // ========== TC-OHTTP-002: HTTP_METHOD 기본값 ==========

    @Nested
    @DisplayName("TC-OHTTP-002: HTTP_METHOD 기본값")
    class DefaultHttpMethod {

        @Test
        @DisplayName("HTTP_METHOD가 null이면 기본값 POST 사용 (URL 연결 시 확인)")
        void shouldDefaultToPostWhenMethodIsNull() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_HTTP");
            Map<String, Object> rawMap = new HashMap<>();
            rawMap.put("INTERFACE_MSG", "test");
            when(context.getRawMessageMap()).thenReturn(rawMap);

            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", "http://invalid-host-for-test:9999/api");
            config.put("HTTP_METHOD", null);

            // when & then - URL이 유효하지 않으므로 연결 예외 발생
            assertThatThrownBy(() -> httpOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class);
        }

        @Test
        @DisplayName("HTTP_METHOD가 빈 문자열이면 기본값 POST 사용")
        void shouldDefaultToPostWhenMethodIsEmpty() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_HTTP");
            Map<String, Object> rawMap = new HashMap<>();
            rawMap.put("INTERFACE_MSG", "test");
            when(context.getRawMessageMap()).thenReturn(rawMap);

            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", "http://invalid-host-for-test:9999/api");
            config.put("HTTP_METHOD", "");

            // when & then
            assertThatThrownBy(() -> httpOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class);
        }
    }

    // ========== TC-OHTTP-003: HTTP_URL 미설정 ==========

    @Nested
    @DisplayName("TC-OHTTP-003: HTTP_URL 미설정")
    class MissingHttpUrl {

        @Test
        @DisplayName("HTTP_URL이 null이면 IllegalStateException")
        void shouldThrowWhenUrlIsNull() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", null);

            // when & then
            assertThatThrownBy(() -> httpOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("HTTP_URL");
        }

        @Test
        @DisplayName("HTTP_URL이 빈 문자열이면 IllegalStateException")
        void shouldThrowWhenUrlIsEmpty() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", "");

            // when & then
            assertThatThrownBy(() -> httpOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("HTTP_URL");
        }
    }

    // ========== TC-OHTTP-006: 대상 시스템 연결 타임아웃 ==========

    @Nested
    @DisplayName("TC-OHTTP-006: 연결 타임아웃")
    class ConnectionTimeout {

        @Test
        @DisplayName("연결 불가능한 호스트에 전송 시 타임아웃 후 IllegalStateException")
        void shouldThrowOnConnectionTimeout() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_HTTP");
            Map<String, Object> rawMap = new HashMap<>();
            rawMap.put("MSG", "data");
            when(context.getRawMessageMap()).thenReturn(rawMap);

            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", "http://192.0.2.1:9999/timeout-test"); // RFC 5737 TEST-NET
            config.put("HTTP_METHOD", "POST");

            CaravanHubProperties.Outbound outbound = new CaravanHubProperties.Outbound();
            CaravanHubProperties.Outbound.Http http = new CaravanHubProperties.Outbound.Http();
            http.setConnectTimeout(1000); // 1초 타임아웃
            http.setReadTimeout(1000);
            outbound.setHttp(http);
            when(properties.getOutbound()).thenReturn(outbound);

            // when & then
            assertThatThrownBy(() -> httpOutboundHandler.handle(context, config))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("HTTP 전송 오류");
        }
    }

    // ========== 메시지 직렬화 ==========

    @Nested
    @DisplayName("메시지 직렬화")
    class MessageSerialization {

        @Test
        @DisplayName("getRawMessageMap이 null이면 직렬화 실패 → 예외")
        void shouldThrowWhenRawMessageMapIsNull() {
            // given
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("TOPIC_HTTP");
            when(context.getRawMessageMap()).thenReturn(null);

            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", "http://localhost:8080/api");
            config.put("HTTP_METHOD", "POST");

            // when & then - null 직렬화는 "null" 문자열이 되므로 실제 HTTP 연결 시 에러
            assertThatThrownBy(() -> httpOutboundHandler.handle(context, config))
                    .isInstanceOf(Exception.class);
        }
    }

    // ========== HTTP_HEADERS 파싱 / ${ENV} 치환 ==========

    @Nested
    @DisplayName("HTTP_HEADERS 파싱 및 환경변수 치환")
    class HttpHeaders {

        @Test
        @DisplayName("HTTP_HEADERS가 null이면 빈 Map (헤더 0개 = 기존 동작)")
        void shouldReturnEmptyWhenNull() {
            assertThat(httpOutboundHandler.parseHeaders(null)).isEmpty();
        }

        @Test
        @DisplayName("HTTP_HEADERS가 빈/공백 문자열이면 빈 Map")
        void shouldReturnEmptyWhenBlank() {
            assertThat(httpOutboundHandler.parseHeaders("   ")).isEmpty();
        }

        @Test
        @DisplayName("placeholder 없는 JSON은 값 그대로 파싱 (삽입 순서 보존)")
        void shouldParseLiteralHeaders() {
            Map<String, String> headers = httpOutboundHandler.parseHeaders(
                    "{\"X-Authenticated-User\":\"CARAVANHUB\",\"X-Authenticated-Role\":\"SYSTEM\"}");

            assertThat(headers)
                    .containsEntry("X-Authenticated-User", "CARAVANHUB")
                    .containsEntry("X-Authenticated-Role", "SYSTEM");
        }

        @Test
        @DisplayName("잘못된 JSON이면 IllegalStateException")
        void shouldThrowOnInvalidJson() {
            assertThatThrownBy(() -> httpOutboundHandler.parseHeaders("not-a-json"))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining("HTTP_HEADERS");
        }

        @Test
        @DisplayName("placeholder 없는 값은 resolveEnv가 그대로 반환")
        void shouldResolveLiteralAsIs() {
            assertThat(httpOutboundHandler.resolveEnv("plain-value")).isEqualTo("plain-value");
        }

        @Test
        @DisplayName("null 값은 resolveEnv가 null 반환")
        void shouldResolveNullAsNull() {
            assertThat(httpOutboundHandler.resolveEnv(null)).isNull();
        }

        @Test
        @DisplayName("미설정 환경변수 ${...}는 빈 문자열로 치환")
        void shouldResolveMissingEnvToEmpty() {
            // 존재하지 않는 환경변수명 — 빈 문자열 치환 (리터럴 prefix 는 보존)
            assertThat(httpOutboundHandler.resolveEnv("key-${CARAVANHUB_NONEXISTENT_ENV_XYZ}"))
                    .isEqualTo("key-");
        }
    }

    // ========== A안: HTTP_HEADERS 와이어 전송 실증 (로컬 HttpServer) ==========

    @Nested
    @DisplayName("HTTP_HEADERS 실제 전송 (로컬 HttpServer 통합)")
    class WireTransmission {

        private HttpServer server;
        private final AtomicReference<Headers> receivedHeaders = new AtomicReference<>();
        private final AtomicReference<String> receivedBody = new AtomicReference<>();

        @org.junit.jupiter.api.AfterEach
        void tearDown() {
            if (server != null) {
                server.stop(0);
            }
        }

        /** 임의 포트에 200 응답 서버를 띄우고, 도착 요청의 헤더/본문을 캡처한다. @return 수신 URL */
        private String startCapturingServer() throws Exception {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            server.createContext("/dmomApi/v1/receive", exchange -> {
                receivedHeaders.set(exchange.getRequestHeaders());
                try (InputStream is = exchange.getRequestBody()) {
                    receivedBody.set(new String(is.readAllBytes(), StandardCharsets.UTF_8));
                }
                byte[] resp = "{\"resultCode\":\"SUCCESS\"}".getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, resp.length);
                exchange.getResponseBody().write(resp);
                exchange.close();
            });
            server.start();
            return "http://127.0.0.1:" + server.getAddress().getPort() + "/dmomApi/v1/receive";
        }

        private KafkaMessageContext contextWithMessage() {
            KafkaMessageContext context = mock(KafkaMessageContext.class);
            when(context.getInterfaceId()).thenReturn("MMCMMERPTT02");
            Map<String, Object> rawMap = new HashMap<>();
            rawMap.put("TRANSACTION_CODE", "PILOT_TC");
            rawMap.put("INTERFACE_ID", "MMCMMERPTT02");
            rawMap.put("INTERFACE_MSG", "PQR02012|P|S");
            when(context.getRawMessageMap()).thenReturn(rawMap);
            return context;
        }

        @Test
        @DisplayName("HTTP_HEADERS의 고정키 헤더가 실제 요청에 실려 전송된다")
        void shouldSendConfiguredHeadersOverWire() throws Exception {
            // given — cactus 수신 인증 고정키 헤더 (X-Client-Key 는 ${ENV} 치환, 미설정이므로 빈값)
            String url = startCapturingServer();
            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", url);
            config.put("HTTP_METHOD", "POST");
            config.put("HTTP_HEADERS",
                    "{\"X-Authenticated-User\":\"CARAVANHUB\","
                    + "\"X-Authenticated-Role\":\"SYSTEM\","
                    + "\"X-Client-Key\":\"fixed-${CARAVANHUB_NONEXISTENT_ENV_XYZ}\"}");

            // when
            httpOutboundHandler.handle(contextWithMessage(), config);

            // then — 도착 요청에 헤더가 실제로 실렸는지 + Content-Type 공존 + 본문 전달
            Headers headers = receivedHeaders.get();
            assertThat(headers).as("요청이 서버에 도착해야 함").isNotNull();
            assertThat(headers.getFirst("X-Authenticated-User")).isEqualTo("CARAVANHUB");
            assertThat(headers.getFirst("X-Authenticated-Role")).isEqualTo("SYSTEM");
            // ${ENV} 미설정 → 빈 문자열 치환된 채 전송 ("fixed-")
            assertThat(headers.getFirst("X-Client-Key")).isEqualTo("fixed-");
            assertThat(headers.getFirst("Content-Type")).isEqualTo("application/json; charset=UTF-8");
            assertThat(receivedBody.get()).contains("MMCMMERPTT02").contains("PQR02012|P|S");
        }

        @Test
        @DisplayName("HTTP_HEADERS가 NULL이면 추가 헤더 없이 전송된다 (기존 동작)")
        void shouldSendWithoutExtraHeadersWhenNull() throws Exception {
            // given
            String url = startCapturingServer();
            Map<String, Object> config = new HashMap<>();
            config.put("HTTP_URL", url);
            config.put("HTTP_METHOD", "POST");
            // HTTP_HEADERS 미설정

            // when
            httpOutboundHandler.handle(contextWithMessage(), config);

            // then — 기본 헤더만, 커스텀 헤더 부재
            Headers headers = receivedHeaders.get();
            assertThat(headers).isNotNull();
            assertThat(headers.getFirst("X-Authenticated-User")).isNull();
            assertThat(headers.getFirst("Content-Type")).isEqualTo("application/json; charset=UTF-8");
        }
    }
}
