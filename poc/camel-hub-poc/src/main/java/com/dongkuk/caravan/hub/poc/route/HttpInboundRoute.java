package com.dongkuk.caravan.hub.poc.route;

import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.model.rest.RestBindingMode;
import org.springframework.stereotype.Component;

/**
 * PoC-2 — camel-servlet 기반 HTTP 인바운드.
 *
 * <p>{@code restConfiguration().component("servlet")} → {@code CamelHttpTransportServlet}
 * ({@link com.dongkuk.caravan.hub.poc.config.CamelServletConfig}, 매핑 {@code /caravanHubApi/*})
 * 로 수신한다.</p>
 *
 * <p>서블릿 매핑이 {@code /caravanHubApi/*} 이므로 REST 경로는 그 하위 {@code /v1/send}.
 * 최종 URL = {@code {context-root=/}/caravanHubApi/v1/send}.</p>
 *
 * <p>바인딩은 {@code off}(원문 echo)로 두어 JSON 바인딩 이슈를 배제하고 <b>서블릿 라우팅 성립 자체</b>만 본다.</p>
 */
@Component
public class HttpInboundRoute extends RouteBuilder {

    @Override
    public void configure() {
        restConfiguration()
                .component("servlet")
                .bindingMode(RestBindingMode.off);

        rest("/v1")
                .post("/send")
                .to("direct:httpEcho");

        from("direct:httpEcho").routeId("in-http")
                .log("PoC-2 HTTP inbound OK - body=${body}")
                .setHeader("Content-Type", constant("application/json"))
                .setBody(constant("{\"resultCode\":\"SUCCESS\",\"echo\":\"received\"}"));
    }
}
