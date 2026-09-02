package com.dongkuk.caravan.hub.outbound;

import java.util.Map;

import org.apache.camel.Exchange;
import org.apache.camel.builder.RouteBuilder;
import org.springframework.stereotype.Component;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.camel.CamelRouteIds;
import com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper;
import com.dongkuk.caravan.hub.outbound.db.DbOutboundHandler;
import com.dongkuk.caravan.hub.outbound.file.FileOutboundHandler;
import com.dongkuk.caravan.hub.outbound.http.HttpOutboundHandler;

import lombok.RequiredArgsConstructor;

/**
 * OUTBOUND 디스패치 라우트 (구 {@code OutboundRouter} 대체, P4).
 *
 * <p>{@code BusinessStart} 가 {@code direct:outbound-dispatch} 로 {@link KafkaMessageContext} 를 보내면,
 * OUTBOUND 설정({@code TB_CARAVAN_HUB_CONFIG})을 조회하여 {@code INTEGRATION_TYPE} 에 따라
 * HTTP/DB/FILE 송신 핸들러로 {@code choice()} 분기한다. 실제 전송 로직은 검증된 기존 핸들러
 * ({@link HttpOutboundHandler}/{@link DbOutboundHandler}/{@link FileOutboundHandler})를 재사용한다.</p>
 *
 * <h3>큐막기 보존</h3>
 * <p>{@code direct:} 동기 라우트이며 <b>onException 을 두지 않는다</b>. 핸들러가 던지는
 * {@code IllegalStateException} 은 그대로 전파되어 {@code BusinessStart} 의 catch → {@code failRetryable}
 * 로 변환되고, caravan-core 가 재시도 후 초과 시 컨테이너 pause + offset 롤백(큐 블로킹)을 수행한다.</p>
 */
@Component
@RequiredArgsConstructor
public class OutboundDispatchRoute extends RouteBuilder {

    /** 조회한 OUTBOUND 설정을 담는 Exchange property 키. */
    static final String PROP_CONFIG = "outboundConfig";
    /** INTEGRATION_TYPE 분기 헤더 키. */
    static final String HEADER_TYPE = "integrationType";

    private final CaravanHubConfigMapper configMapper;
    private final HttpOutboundHandler httpOutboundHandler;
    private final DbOutboundHandler dbOutboundHandler;
    private final FileOutboundHandler fileOutboundHandler;

    @Override
    public void configure() {
        from("direct:" + CamelRouteIds.OUTBOUND_DISPATCH)
                .routeId(CamelRouteIds.OUTBOUND_DISPATCH)
                .process(this::resolveConfig)
                .choice()
                    .when(header(HEADER_TYPE).isEqualToIgnoreCase("HTTP"))
                        .process(ex -> httpOutboundHandler.handle(context(ex), config(ex)))
                    .when(header(HEADER_TYPE).isEqualToIgnoreCase("DB"))
                        .process(ex -> dbOutboundHandler.handle(context(ex), config(ex)))
                    .when(header(HEADER_TYPE).isEqualToIgnoreCase("FILE"))
                        .process(ex -> fileOutboundHandler.handle(context(ex), config(ex)))
                    .otherwise()
                        .process(ex -> {
                            throw new IllegalStateException(
                                    "알 수 없는 INTEGRATION_TYPE: " + ex.getIn().getHeader(HEADER_TYPE));
                        })
                .end();
    }

    /** OUTBOUND 설정 조회 → property/header 세팅. 설정 없으면 예외(→큐막기). */
    private void resolveConfig(Exchange exchange) {
        KafkaMessageContext ctx = context(exchange);
        String topicId = ctx.getInterfaceId();
        Map<String, Object> config = configMapper.selectOutboundConfig(topicId);
        if (config == null) {
            throw new IllegalStateException("OUTBOUND 설정 없음 - Topic: " + topicId);
        }
        exchange.setProperty(PROP_CONFIG, config);
        exchange.getIn().setHeader(HEADER_TYPE, String.valueOf(config.get("INTEGRATION_TYPE")));
    }

    private static KafkaMessageContext context(Exchange exchange) {
        return exchange.getIn().getBody(KafkaMessageContext.class);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> config(Exchange exchange) {
        return exchange.getProperty(PROP_CONFIG, Map.class);
    }
}
