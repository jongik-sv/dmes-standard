package com.dongkuk.caravan.hub.poc.route;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.stereotype.Component;

/**
 * PoC-3 — camel-sql 인바운드 폴링 + 듀얼 DataSource(#ifDataSource) + onConsume 낙관락.
 *
 * <p>검증 포인트:
 * <ul>
 *   <li>{@code dataSource=#ifDataSource} 가 {@code @Primary} 가 아닌 <b>IF DataSource</b> 를 정확히 잡는지</li>
 *   <li>{@code onConsume} 이 폴링 성공 후 {@code IF_FLAG 'N'→'Y'} 로 갱신(낙관락 {@code WHERE ... U_AT})</li>
 *   <li>{@code delay=1000} + 단일 스레드 → 초단위 순차 폴링({@code ORDER BY C_AT ASC})</li>
 *   <li>{@code maxMessagesPerPoll} = 배치 상한(현 subList(100) 대체)</li>
 * </ul>
 * </p>
 *
 * <p>실제 caravan-hub 에선 여기서 {@code KafkaMessageProducer.send(topic, TC, msg)} 를 호출하지만,
 * PoC 는 로그로 대체(카프카 불요).</p>
 */
@Component
public class DbInboundRoute extends RouteBuilder {

    @Override
    public void configure() {
        from("sql:"
                + "SELECT IF_SEQ, TRANSACTION_CODE, INTERFACE_MSG, U_AT "
                + "FROM T_POC_INBOUND WHERE IF_FLAG='N' ORDER BY C_AT ASC"
                + "?dataSource=#ifDataSource"
                + "&delay=1000&useFixedDelay=true"
                + "&maxMessagesPerPoll=100"
                + "&onConsume=UPDATE T_POC_INBOUND SET IF_FLAG='Y', U_AT=:#U_AT "
                + "WHERE IF_SEQ=:#IF_SEQ AND U_AT=:#U_AT")
                .routeId("in-db")
                .log("PoC-3 polled: IF_SEQ=${body[IF_SEQ]} TC=${body[TRANSACTION_CODE]} MSG=${body[INTERFACE_MSG]}");
    }
}
