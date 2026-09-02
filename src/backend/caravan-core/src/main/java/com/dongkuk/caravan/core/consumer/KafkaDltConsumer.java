package com.dongkuk.caravan.core.consumer;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

/**
 * Dead Letter Topic (DLT) Consumer
 *
 * <p>메인 토픽에서 처리 실패한 메시지가 이동되는 Dead Letter Topic을 처리합니다.</p>
 *
 * <h3>DLT 동작 방식</h3>
 * <p>Spring Kafka의 DLT 기능에 의해 메인 토픽에서 처리 실패한 메시지는
 * 자동으로 {@code {원본토픽}.dlt} 토픽으로 이동됩니다.</p>
 *
 * <h3>DLT 메시지 헤더</h3>
 * <ul>
 *   <li>{@code DLT_EXCEPTION_MESSAGE}: 예외 메시지</li>
 *   <li>{@code DLT_EXCEPTION_FQCN}: 예외 클래스 전체 이름</li>
 *   <li>{@code DLT_ORIGINAL_TOPIC}: 원본 토픽명</li>
 *   <li>{@code DLT_ORIGINAL_PARTITION}: 원본 파티션 번호</li>
 *   <li>{@code DLT_ORIGINAL_OFFSET}: 원본 오프셋</li>
 * </ul>
 *
 * <h3>확장 방법</h3>
 * <p>이 클래스는 기본적으로 로그만 출력합니다. 실제 프로젝트에서는 다음과 같은
 * 로직을 추가할 수 있습니다:</p>
 * <ul>
 *   <li>알림 전송 (이메일, Slack 등)</li>
 *   <li>재처리 큐에 등록</li>
 *   <li>모니터링 시스템에 기록</li>
 *   <li>수동 검토 대기열에 추가</li>
 * </ul>
 *
 * @author Caravan
 * @version 1.0.0
 */
@Component
@RequiredArgsConstructor
public class KafkaDltConsumer {

    private static final Logger log = LoggerFactory.getLogger(KafkaDltConsumer.class);

    private final AlertNotifier alertNotifier;
    private final CaravanProperties properties;

    /**
     * Dead Letter Topic 메시지를 수신하여 처리합니다.
     *
     * <p>기본 구현은 로그 출력 후 Offset을 커밋합니다. 실제 프로젝트에서는
     * 알림 전송, 재처리 등의 로직을 추가할 수 있습니다.</p>
     *
     * <h4>처리 정책</h4>
     * <ul>
     *   <li>DLT 메시지 처리 실패 시에도 Offset을 커밋하여 무한 루프를 방지합니다.</li>
     *   <li>처리 실패 시 경고 로그가 출력됩니다.</li>
     * </ul>
     *
     * <h4>확장 예시</h4>
     * <pre>{@code
     * // 알림 전송
     * alertService.sendDltAlert(originalTopic, originalOffset, exceptionMessage);
     *
     * // 재처리 큐 등록
     * reprocessQueue.add(message, originalTopic);
     * }</pre>
     *
     * @param message           DLT에 저장된 원본 메시지 (JSON 문자열)
     * @param ack               Acknowledgment 객체 (Manual Commit에 사용)
     * @param exceptionMessage  메인 토픽에서 발생한 예외 메시지
     * @param exceptionClass    예외 클래스의 Fully Qualified Class Name
     * @param originalTopic     원본 메시지가 있던 토픽명
     * @param originalPartition 원본 메시지의 파티션 번호
     * @param originalOffset    원본 메시지의 오프셋
     */
    public void consume(String message,
                        Acknowledgment ack,
                        @Header(KafkaHeaders.DLT_EXCEPTION_MESSAGE) String exceptionMessage,
                        @Header(KafkaHeaders.DLT_EXCEPTION_FQCN) String exceptionClass,
                        @Header(KafkaHeaders.DLT_ORIGINAL_TOPIC) String originalTopic,
                        @Header(KafkaHeaders.DLT_ORIGINAL_PARTITION) Integer originalPartition,
                        @Header(KafkaHeaders.DLT_ORIGINAL_OFFSET) Long originalOffset) {

        log.info("========== DLT 메시지 수신 ==========");
        log.info("Original Topic: {}", originalTopic);
        log.info("Original Partition: {}", originalPartition);
        log.info("Original Offset: {}", originalOffset);
        log.info("Exception Class: {}", exceptionClass);
        log.info("Exception Message: {}", exceptionMessage);
        log.info("Message: {}", message);
        log.info("======================================");

        try {
            // 프레임 레벨로 DLT 에 밀려난 건 → 운영자 알림(SMS 등). DLT 는 예외적 스킵 경로이므로
            // 여기서 offset 을 커밋(drain)하되, 반드시 알림으로 사람이 인지하도록 한다.
            safeAlert(AlertEvent.dlt(properties.getBizSystem(), originalTopic, originalOffset,
                    exceptionClass, exceptionMessage));

            log.info("[DLT] 메시지 처리 완료 - originalTopic: {}, originalOffset: {}",
                originalTopic, originalOffset);

            ack.acknowledge();
            log.info("[DLT] Offset 커밋 완료");

        } catch (Exception e) {
            log.error("[DLT] 메시지 처리 실패 - originalTopic: {}, error: {}",
                originalTopic, e.getMessage());

            // DLT 처리 실패해도 커밋 (무한 루프 방지)
            ack.acknowledge();
            log.warn("[DLT] 처리 실패했지만 Offset 커밋 (무한 루프 방지)");
        }
    }

    /** 알림 발송(never-throw) — 알림 실패가 DLT drain 을 막지 않도록 예외를 삼킨다. */
    private void safeAlert(AlertEvent event) {
        try {
            alertNotifier.send(event);
        } catch (Exception e) {
            log.warn("[ALERT] DLT 알림 발송 실패: {}", e.getMessage());
        }
    }
}
