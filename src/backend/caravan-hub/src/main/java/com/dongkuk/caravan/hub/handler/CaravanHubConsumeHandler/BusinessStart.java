package com.dongkuk.caravan.hub.handler.CaravanHubConsumeHandler;

import org.apache.camel.CamelExecutionException;
import org.apache.camel.ProducerTemplate;
import org.springframework.stereotype.Component;

import com.dongkuk.caravan.core.handler.HandleResult;
import com.dongkuk.caravan.core.handler.KafkaInterfaceHandler;
import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.camel.CamelRouteIds;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * OUTBOUND 메시지 수신 핸들러 (caravan-core Consumer 진입점).
 *
 * <p>caravan-core 의 {@code KafkaInterfaceHandler} 를 구현하며, 빈 이름 {@code "CaravanHubConsumeHandler"} 로
 * 등록되어 소비 메시지가 이 핸들러로 디스패치된다. P4 에서 내부 분기(OutboundRouter)를 Camel
 * {@code direct:outbound-dispatch} 라우트로 위임하도록 브릿지화했다.</p>
 *
 * <pre>{@code
 * Kafka 소비 → caravan-core → CaravanHubConsumeHandler.businessHandle(context)
 *   → ProducerTemplate.sendBody("direct:outbound-dispatch", context)
 *   → OutboundDispatchRoute(choice HTTP/DB/FILE) → 외부 송신
 * }</pre>
 *
 * <h3>큐막기(회귀 보존)</h3>
 * <p>{@code direct:} 는 동기 실행이라 라우트 내 예외가 {@link ProducerTemplate#sendBody} 에서
 * {@link CamelExecutionException} 으로 전파된다. 이를 catch 하여 {@code failRetryable} 를 반환하면
 * caravan-core 가 재시도 후 초과 시 컨테이너 pause + offset 롤백(큐 블로킹)을 수행한다. 즉 큐막기
 * 메커니즘은 caravan-core 소관이며 본 브릿지는 실패를 반드시 예외→failRetryable 로 전달한다.</p>
 */
@Component("CaravanHubConsumeHandler")
@RequiredArgsConstructor
@Slf4j
public class BusinessStart implements KafkaInterfaceHandler {

    /** 아웃바운드 디스패치 라우트 진입 엔드포인트. */
    private static final String OUTBOUND_DISPATCH_URI = "direct:" + CamelRouteIds.OUTBOUND_DISPATCH;

    private final ProducerTemplate producerTemplate;

    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        try {
            log.debug("CaravanHubConsumeHandler 시작 - Topic: {}, TC: {}",
                    context.getTopic(), context.getTransactionCode());

            producerTemplate.sendBody(OUTBOUND_DISPATCH_URI, context);

            return HandleResult.success();

        } catch (Exception e) {
            // CamelExecutionException 이면 실제 송신 실패 원인을 풀어 로그/에러메시지에 사용
            Throwable cause = (e instanceof CamelExecutionException && e.getCause() != null) ? e.getCause() : e;
            log.error("CaravanHubConsumeHandler 오류 - Topic: {}", context.getTopic(), cause);
            return HandleResult.failRetryable("CARAVANHUB_OUTBOUND_ERROR", cause.getMessage());
        }
    }
}
