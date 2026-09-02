package com.dongkuk.caravan.core.handler;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 기본 Kafka 핸들러
 *
 * <p>등록되지 않은 TRANSACTION_CODE에 대해 사용되는 기본 핸들러입니다.</p>
 *
 * <h3>동작 방식</h3>
 * <ul>
 *   <li>미등록 TRANSACTION_CODE에 대한 경고 로그 출력</li>
 *   <li>핸들러 구현 가이드 로그 출력</li>
 *   <li>메시지를 성공 처리하여 다음 메시지로 진행 (메시지 스킵)</li>
 * </ul>
 *
 * <h3>핸들러 구현 가이드</h3>
 * <p>새 TRANSACTION_CODE에 대한 핸들러를 구현하려면:</p>
 * <pre>{@code
 * package com.myproject.handler.PQR02012;
 *
 * @Component("PQR02012")  // Bean 이름 = TRANSACTION_CODE
 * public class BusinessStart implements KafkaInterfaceHandler {
 *     @Override
 *     public HandleResult businessHandle(KafkaMessageContext context) {
 *         // 비즈니스 로직 구현
 *         return HandleResult.success();
 *     }
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see KafkaInterfaceHandler
 * @see KafkaInterfaceHandlerRegistry
 */
@Component
public class DefaultKafkaInterfaceHandler implements KafkaInterfaceHandler {

    private static final Logger log = LoggerFactory.getLogger(DefaultKafkaInterfaceHandler.class);

    /**
     * 미등록 TRANSACTION_CODE에 대한 기본 처리를 수행합니다.
     *
     * <p>경고 로그를 출력하고 성공 처리하여 메시지를 스킵합니다.</p>
     *
     * @param context 메시지 컨텍스트
     * @return 성공 결과 (메시지 커밋, 다음 메시지 처리)
     */
    @Override
    public HandleResult businessHandle(KafkaMessageContext context) {
        log.warn("========================================");
        log.warn("미등록 TRANSACTION_CODE: {}", context.getTransactionCode());
        log.warn("Topic: {}, Offset: {}", context.getTopic(), context.getOffset());
        log.warn("해당 핸들러를 구현하세요:");
        log.warn("  패키지: com.xxx.handler.{}", context.getTransactionCode());
        log.warn("  클래스: BusinessStart");
        log.warn("  Bean명: @Component(\"{}\")", context.getTransactionCode());
        log.warn("========================================");

        // 기본 핸들러는 성공 처리 (메시지 스킵)
        return HandleResult.success();
    }
}
