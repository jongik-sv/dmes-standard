package com.dongkuk.caravan.hub.inbound.http;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.rest.RestBindingMode;
import org.springframework.stereotype.Component;

import com.dongkuk.caravan.hub.camel.CamelRouteIds;
import com.dongkuk.caravan.hub.common.dto.IntegrationRequest;
import com.dongkuk.caravan.hub.common.dto.IntegrationResponse;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * HTTP INBOUND Camel 라우트 (P3).
 *
 * <p>외부 시스템이 HTTP 로 Kafka 에 메시지를 전송하는 REST 엔드포인트. 구 {@code HttpIntegrationController}
 * (Spring MVC)를 대체하며, 검증·발행·응답/상태코드 로직을 그대로 이식했다.</p>
 *
 * <pre>{@code
 * 외부 시스템 → POST /caravanHubApi/v1/send (camel-servlet)
 *   → validate → KafkaMessageProducer.send(topic, tc, msg) → Kafka
 *   → 200 IntegrationResponse.success / 400 INVALID_PARAMETER / 500 SYSTEM_ERROR
 * }</pre>
 *
 * <p>경로 = {@code camel.servlet.mapping.context-path}(/caravanHubApi/*) + {@code rest("/v1").post("/send")}.
 * UUID·INTERFACE_ID·INTERFACE_PROTOCOL 은 caravan-core 가 자동 생성한다(D12 — 신 경로만 제공, alias 없음).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class HttpInboundRoute extends RouteBuilder {

    private final HttpInboundHandler httpInboundHandler;

    @Override
    public void configure() {
        restConfiguration()
                .component("servlet")
                .bindingMode(RestBindingMode.json);

        // 파라미터 오류 → HTTP 400 (구 컨트롤러 badRequest 동치)
        onException(IllegalArgumentException.class)
                .handled(true)
                .setHeader(Exchange.HTTP_RESPONSE_CODE, constant(400))
                .process(exchange -> {
                    Exception e = exchange.getProperty(Exchange.EXCEPTION_CAUGHT, Exception.class);
                    log.warn("메시지 전송 실패 - 파라미터 오류: {}", e.getMessage());
                    exchange.getIn().setBody(IntegrationResponse.error("INVALID_PARAMETER", e.getMessage()));
                });

        // 시스템 오류 → HTTP 500 (구 컨트롤러 internalServerError 동치)
        onException(Exception.class)
                .handled(true)
                .setHeader(Exchange.HTTP_RESPONSE_CODE, constant(500))
                .process(exchange -> {
                    Exception e = exchange.getProperty(Exchange.EXCEPTION_CAUGHT, Exception.class);
                    log.error("메시지 전송 실패 - 시스템 오류: {}", e.getMessage(), e);
                    exchange.getIn().setBody(IntegrationResponse.error("SYSTEM_ERROR", e.getMessage()));
                });

        rest("/v1")
                .post("/send")
                .type(IntegrationRequest.class)
                .outType(IntegrationResponse.class)
                .to("direct:" + CamelRouteIds.INBOUND_HTTP);

        from("direct:" + CamelRouteIds.INBOUND_HTTP)
                .routeId(CamelRouteIds.INBOUND_HTTP)
                .bean(httpInboundHandler, "handle");
    }
}
