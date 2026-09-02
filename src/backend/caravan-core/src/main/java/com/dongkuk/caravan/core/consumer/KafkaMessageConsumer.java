package com.dongkuk.caravan.core.consumer;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.handler.HandleResult;
import com.dongkuk.caravan.core.handler.KafkaInterfaceHandler;
import com.dongkuk.caravan.core.handler.KafkaInterfaceHandlerRegistry;
import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.core.repository.KafkaErrorRepository;
import com.dongkuk.caravan.core.service.TopicErrorService;
import com.dongkuk.caravan.core.util.JsonUtil;
import com.dongkuk.caravan.core.util.KafkaConstants;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.TopicPartition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * Kafka 메시지 Consumer
 *
 * <p>Kafka 토픽에서 메시지를 수신하고 TRANSACTION_CODE 기반으로 핸들러를 라우팅하여
 * 비즈니스 로직을 실행하는 컴포넌트입니다.</p>
 *
 * <h3>메시지 처리 흐름</h3>
 * <ol>
 *   <li>메시지 수신 및 파싱 ({@link KafkaMessageContext} 생성)</li>
 *   <li>TRANSACTION_CODE 추출</li>
 *   <li>{@link KafkaInterfaceHandlerRegistry}에서 핸들러 조회</li>
 *   <li>재시도 로직과 함께 핸들러 실행</li>
 *   <li>결과에 따른 Offset 커밋 또는 재시도</li>
 * </ol>
 *
 * <h3>재시도 정책</h3>
 * <ul>
 *   <li>최대 재시도 횟수: {@code caravan.kafka.retry.max-attempts} (기본 3회)</li>
 *   <li>재시도 간격: {@code caravan.kafka.retry.delay-ms} (기본 1000ms)</li>
 *   <li>재시도 초과 시: 컨테이너 일시정지, Offset 롤백</li>
 * </ul>
 *
 * <h3>에러 처리</h3>
 * <table border="1">
 *   <tr><th>상황</th><th>동작</th></tr>
 *   <tr><td>파싱 실패</td><td>에러 로그, 메시지 스킵 (Offset 커밋)</td></tr>
 *   <tr><td>핸들러 성공</td><td>Offset 커밋</td></tr>
 *   <tr><td>핸들러 실패 (재시도 불가)</td><td>에러 저장, Offset 커밋</td></tr>
 *   <tr><td>핸들러 실패 (재시도 가능)</td><td>재시도 수행</td></tr>
 *   <tr><td>최대 재시도 초과 (failRetryable)</td><td>에러 저장, 컨테이너 일시정지</td></tr>
 *   <tr><td>최대 재시도 초과 (failRetryableSkip)</td><td>에러 저장, 메시지 스킵 (Offset 커밋)</td></tr>
 * </table>
 *
 * @author Caravan
 * @version 1.0.0
 * @see KafkaInterfaceHandler
 * @see KafkaInterfaceHandlerRegistry
 * @see HandleResult
 */
@Component
@RequiredArgsConstructor
public class KafkaMessageConsumer {

    private static final Logger log = LoggerFactory.getLogger(KafkaMessageConsumer.class);

    private final KafkaInterfaceHandlerRegistry handlerRegistry;
    private final ContainerController containerController;
    private final KafkaErrorRepository errorRepository;
    private final CaravanProperties properties;
    private final TopicErrorService topicErrorService;
    private final AlertNotifier alertNotifier;

    /**
     * Kafka 메시지를 수신하여 처리합니다.
     *
     * <p>이 메서드는 Kafka Listener에서 호출되며, 수신된 메시지를 파싱하고
     * 적절한 핸들러를 찾아 비즈니스 로직을 실행합니다.</p>
     *
     * <h4>처리 순서</h4>
     * <ol>
     *   <li>메시지 파싱 → {@link KafkaMessageContext} 생성</li>
     *   <li>TRANSACTION_CODE 추출 → 핸들러 조회</li>
     *   <li>재시도 로직과 함께 핸들러 실행</li>
     * </ol>
     *
     * <h4>Manual Acknowledgment</h4>
     * <p>MANUAL_IMMEDIATE 모드를 사용하므로, {@code ack.acknowledge()} 호출 시
     * 즉시 Offset이 커밋됩니다.</p>
     *
     * @param record   Kafka ConsumerRecord (메시지 데이터 및 메타데이터 포함)
     *                 <ul>
     *                   <li>{@code value()}: 메시지 본문 (JSON 문자열)</li>
     *                   <li>{@code topic()}: 토픽명</li>
     *                   <li>{@code partition()}: 파티션 번호</li>
     *                   <li>{@code offset()}: 메시지 오프셋</li>
     *                 </ul>
     * @param consumer Kafka Consumer (Offset 조작에 사용)
     * @param ack      Acknowledgment 객체 (Manual Commit에 사용)
     */
    public void consume(ConsumerRecord<String, String> record,
                        Consumer<?, ?> consumer,
                        Acknowledgment ack) {

        String topic = record.topic();

        log.info("========== Kafka 메시지 수신 ==========");
        log.info("Topic: {}, Partition: {}, Offset: {}", topic, record.partition(), record.offset());

        // 1. 메시지 파싱
        KafkaMessageContext context = parseMessage(record);

        if (context == null) {
            // 설계 원칙(자동 스킵 금지): 파싱 실패도 큐막기(pause + offset 롤백)하여 운영자가
            // 원문을 확인하고 스킵(offset-skip) 또는 수정 후 resume 을 직접 결정하도록 한다.
            handleParseFailure(record, consumer);
            return;
        }

        String transactionCode = context.getTransactionCode();
        log.info("TRANSACTION_CODE: {}", transactionCode);

        // 2. 핸들러 조회
        KafkaInterfaceHandler handler;
        String bizSystem = properties.getBizSystem();

        if (bizSystem != null && bizSystem.toLowerCase().startsWith(KafkaConstants.BIZ_SYSTEM_PREFIX_HUB)) {
            // caravan-hub 시스템: SeraiConsumeHandler 전용 핸들러로 라우팅
            handler = handlerRegistry.getHandler(KafkaConstants.HUB_HANDLER_BEAN_NAME);
            log.info("caravan-hub 시스템 라우팅 - Handler: {}", handler.getClass().getSimpleName());
        } else {
            // 일반 시스템: TRANSACTION_CODE 기반 핸들러 라우팅
            handler = handlerRegistry.getHandler(transactionCode);
            log.info("Handler: {}", handler.getClass().getSimpleName());
        }

        // 3. 재시도 로직과 함께 핸들러 실행
        executeWithRetry(record, consumer, ack, context, handler);
    }

    private KafkaMessageContext parseMessage(ConsumerRecord<String, String> record) {
        try {
            Map<String, Object> map = JsonUtil.parseMap(record.value());

            return KafkaMessageContext.builder()
                .transactionCode((String) map.get(KafkaConstants.FIELD_TRANSACTION_CODE))
                .interfaceId((String) map.get(KafkaConstants.FIELD_INTERFACE_ID))
                .interfaceMsg((String) map.get(KafkaConstants.FIELD_INTERFACE_MSG))
                .interfaceProtocol((String) map.get(KafkaConstants.FIELD_INTERFACE_PROTOCOL))
                .kafkaKeyData((String) map.get(KafkaConstants.FIELD_KAFKA_KEYDATA))
                .rawMessage(record.value())
                .rawMessageMap(map)
                .topic(record.topic())
                .partition(record.partition())
                .offset(record.offset())
                .timestamp(record.timestamp())
                .build();

        } catch (Exception e) {
            log.error("메시지 파싱 실패: {}", e.getMessage());
            return null;
        }
    }

    private void executeWithRetry(ConsumerRecord<String, String> record,
                                   Consumer<?, ?> consumer,
                                   Acknowledgment ack,
                                   KafkaMessageContext context,
                                   KafkaInterfaceHandler handler) {

        int maxAttempts = properties.getRetry().getMaxAttempts();
        long delayMs = properties.getRetry().getDelayMs();
        boolean skipOnMaxRetry = false;

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            context.setAttemptCount(attempt);

            try {
                log.info("[{}] 처리 시도 ({}/{})",
                    context.getTransactionCode(), attempt, maxAttempts);

                // 핸들러 실행
                HandleResult result = handler.businessHandle(context);

                if (result.isSuccess()) {
                    ack.acknowledge();
                    log.info("[{}] 처리 성공", context.getTransactionCode());
                    return;
                }

                // 실패 - 재시도 불가
                if (!result.isRetryable()) {
                    log.warn("[{}] 재시도 불가: {}",
                        context.getTransactionCode(), result.getErrorMessage());
                    saveError(context, result);
                    ack.acknowledge();
                    return;
                }

                // 실패 - 재시도 가능 (스킵 여부 보관)
                skipOnMaxRetry = result.isSkipOnMaxRetry();
                throw new RuntimeException(result.getErrorMessage());

            } catch (Exception e) {
                log.error("[{}] 처리 실패 ({}/{}): {}",
                    context.getTransactionCode(), attempt, maxAttempts, e.getMessage());

                if (attempt >= maxAttempts) {
                    if (skipOnMaxRetry) {
                        handleMaxRetrySkip(ack, context, e);
                    } else {
                        handleMaxRetryExceeded(record, consumer, ack, context, e);
                    }
                    return;
                }

                sleep(delayMs);
            }
        }
    }

    private void handleMaxRetryExceeded(ConsumerRecord<String, String> record,
                                         Consumer<?, ?> consumer,
                                         Acknowledgment ack,
                                         KafkaMessageContext context,
                                         Exception e) {
        log.error("[{}] 최대 재시도 초과", context.getTransactionCode());

        // 에러 audit 로그 (TB_CARAVAN_TC_ERROR)
        saveError(context, HandleResult.fail("MAX_RETRY_EXCEEDED", e.getMessage()));

        // Phase 5: STATUS=ERROR + ERROR_* 컬럼 업데이트 + control topic ERROR publish (afterCommit)
        // → 다른 인스턴스가 ensurePaused 호출하여 LB 뒤 모든 인스턴스 정지.
        try {
            topicErrorService.markError(
                    record.topic(),
                    properties.getBizSystem(),
                    record.offset(),
                    "MAX_RETRY_EXCEEDED",
                    e.getMessage());
        } catch (Exception markErr) {
            log.warn("[{}] markError 실패 (DB UPDATE 또는 publish): {}",
                    context.getTransactionCode(), markErr.getMessage());
        }

        // 자기 JVM 즉시 pause (publish 전파 대기 없이)
        String listenerId = KafkaConstants.LISTENER_PREFIX + record.topic();
        containerController.pause(listenerId);

        // Offset 롤백 — resume 시 차단된 메시지부터 재시작 (큐 블로킹 보존)
        TopicPartition tp = new TopicPartition(record.topic(), record.partition());
        consumer.seek(tp, record.offset());

        log.warn("[{}] 컨테이너 일시정지됨 — resume API 호출 필요", context.getTransactionCode());

        // 큐막기 진입(커밋 후) → 운영자 알림. 컨테이너가 pause 되어 재폴이 없으므로 1회 발송.
        safeAlert(AlertEvent.consumeBlocked(properties.getBizSystem(), record.topic(),
                context.getTransactionCode(), record.offset(), "MAX_RETRY_EXCEEDED", e.getMessage()));
    }

    private void handleMaxRetrySkip(Acknowledgment ack,
                                     KafkaMessageContext context,
                                     Exception e) {
        log.error("[{}] 최대 재시도 초과 - 에러 기록 후 스킵", context.getTransactionCode());

        // 에러 저장
        saveError(context, HandleResult.fail("MAX_RETRY_SKIP", e.getMessage()));

        // 메시지 스킵 (Offset 커밋)
        ack.acknowledge();

        log.warn("[{}] 메시지 스킵 완료 - 다음 메시지 처리 계속", context.getTransactionCode());
    }

    /**
     * 파싱 실패 처리 — <b>자동 스킵 금지</b>. 컨테이너 pause + offset 롤백으로 큐막기 하여
     * 운영자 개입(원문 확인 → offset-skip 또는 수정 후 resume)을 강제한다.
     *
     * <p>TC 를 추출할 수 없으므로 {@code PARSE_ERROR} 코드 + topic/offset/원문 일부로 audit 한다.</p>
     */
    private void handleParseFailure(ConsumerRecord<String, String> record, Consumer<?, ?> consumer) {
        log.error("[PARSE_ERROR] 메시지 파싱 실패 - Topic: {}, Partition: {}, Offset: {} — 큐막기(운영자 개입 필요)",
                record.topic(), record.partition(), record.offset());

        // 에러 audit (TC 미상 → PARSE_ERROR 로 기록). 원문(payload)은 INTERFACE_MSG 에 그대로 적재.
        try {
            errorRepository.logConsumeError(record.topic(), "PARSE_ERROR", record.offset(),
                    record.value(), "PARSE_ERROR", "메시지 파싱 실패");
        } catch (Exception e) {
            log.error("에러 로그 저장 실패", e);
        }

        // STATUS=ERROR + ERROR_* + control publish (afterCommit) → 다른 인스턴스 ensurePaused
        try {
            topicErrorService.markError(record.topic(), properties.getBizSystem(), record.offset(),
                    "PARSE_ERROR", "메시지 파싱 실패");
        } catch (Exception markErr) {
            log.warn("[PARSE_ERROR] markError 실패: {}", markErr.getMessage());
        }

        // 자기 JVM 즉시 pause + offset 롤백(큐막기) — ack 하지 않는다.
        containerController.pause(KafkaConstants.LISTENER_PREFIX + record.topic());
        consumer.seek(new TopicPartition(record.topic(), record.partition()), record.offset());
        log.warn("[PARSE_ERROR] 컨테이너 일시정지됨 — 원문 확인 후 skip/수정 resume 필요");

        // 큐막기 진입 → 운영자 알림. 컨테이너 pause 로 재폴 없어 1회 발송.
        safeAlert(AlertEvent.parseError(properties.getBizSystem(), record.topic(),
                record.offset(), "메시지 파싱 실패"));
    }

    /** 알림 발송(never-throw) — 알림 실패가 큐막기 흐름을 막지 않도록 예외를 삼킨다. */
    private void safeAlert(AlertEvent event) {
        try {
            alertNotifier.send(event);
        } catch (Exception e) {
            log.warn("[ALERT] 알림 발송 실패: {}", e.getMessage());
        }
    }

    private void saveError(KafkaMessageContext context, HandleResult result) {
        try {
            errorRepository.logConsumeError(
                context.getTopic(),
                context.getTransactionCode(),
                context.getOffset(),
                context.getRawMessage(),
                result.getErrorCode(),
                result.getErrorMessage()
            );
        } catch (Exception e) {
            log.error("에러 로그 저장 실패", e);
        }
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
