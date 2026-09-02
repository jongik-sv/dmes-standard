package com.dongkuk.caravan.core.listener;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.config.ControlConsumerConfig;
import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.container.ContainerStatus;
import com.dongkuk.caravan.core.model.ControlCommand;
import com.dongkuk.caravan.core.service.ControlTopicBootstrap;
import com.dongkuk.caravan.core.util.KafkaConstants;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

/**
 * {@code caravan.control} 토픽을 구독하여 운영자 명령(PAUSE/RESUME/STOP) 과
 * 자동 ERROR 진입 알림을 처리한다.
 *
 * <p>각 caravan 인스턴스가 unique groupId 로 구독 → 모든 인스턴스가 모든 명령 수신 후
 * {@code bizSystem} 필터로 자기 시스템 명령만 처리.</p>
 *
 * <p>ensure* 메서드는 모두 idempotent (컨테이너 미존재 / 이미 같은 상태 → noop).
 * createConsumer 는 호출하지 않음 (Phase 7 의 boot reset 단독 책임).</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ControlTopicListener {

    private final ContainerController containerController;
    private final CaravanProperties props;

    /** LocalDateTime 직렬화 위해 JavaTimeModule 등록. caravan 자체 ObjectMapper. */
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    @KafkaListener(
            topics = ControlTopicBootstrap.CONTROL_TOPIC,
            groupId = "#{@controlGroupIdResolver.get()}",
            containerFactory = ControlConsumerConfig.CONTROL_LISTENER_CONTAINER_FACTORY
    )
    public void onControlCommand(ConsumerRecord<String, String> record) {
        ControlCommand cmd;
        try {
            cmd = objectMapper.readValue(record.value(), ControlCommand.class);
        } catch (Exception e) {
            log.warn("[CaravanControl] 메시지 파싱 실패 — value={}, error={}",
                    record.value(), e.getMessage());
            return;
        }

        // 다른 bizSystem 명령은 무시 (단일 토픽 모든 bizSystem 공유 정책)
        if (!props.getBizSystem().equals(cmd.getBizSystem())) {
            return;
        }

        log.info("[CaravanControl] 수신: action={}, topicId={}", cmd.getAction(), cmd.getTopicId());

        switch (cmd.getAction()) {
            case PAUSE, ERROR -> ensurePaused(cmd.getTopicId());
            case RESUME       -> ensureRunning(cmd.getTopicId());
            case STOP         -> ensureStopped(cmd.getTopicId());
            case START        -> ensureStarted(cmd.getTopicId());
        }
    }

    /**
     * START 전용: 컨테이너 없음 → createConsumer 로 신규 등록(런타임 토픽 동적 등록).
     * 이미 RUNNING → noop. PAUSED → resume. STOPPED → start.
     * (RESUME 과 달리 미존재 케이스를 noop 하지 않고 신규 생성 — 신규 토픽 핫-등록 지원.)
     */
    private void ensureStarted(String topicId) {
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;
        if (!containerController.exists(listenerId)) {
            try {
                String groupId = containerController.createConsumer(topicId);
                log.info("[CaravanControl] CREATE_NEW (START): topicId={}, groupId={}", topicId, groupId);
            } catch (Exception e) {
                log.error("[CaravanControl] createConsumer 실패 (START): topicId={}", topicId, e);
            }
            return;
        }
        ContainerStatus status = containerController.getStatus(listenerId);
        switch (status) {
            case RUNNING -> { /* noop */ }
            case PAUSED -> {
                containerController.resume(listenerId);
                log.info("[CaravanControl] resumed (START): {}", topicId);
            }
            case STOPPED -> {
                containerController.start(listenerId);
                log.info("[CaravanControl] started (START): {}", topicId);
            }
            default -> log.debug("[CaravanControl] ensureStarted unknown status {}: {}", status, topicId);
        }
    }

    /** 컨테이너 없음 → noop. 이미 PAUSED → noop. RUNNING/STOPPED → pause 호출. */
    private void ensurePaused(String topicId) {
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;
        if (!containerController.exists(listenerId)) {
            log.debug("[CaravanControl] ensurePaused noop (컨테이너 미존재): {}", topicId);
            return;
        }
        if (containerController.getStatus(listenerId) == ContainerStatus.PAUSED) {
            return;
        }
        containerController.pause(listenerId);
        log.info("[CaravanControl] paused: {}", topicId);
    }

    /**
     * 컨테이너 없음 → noop (Phase 7 의 boot reset 가 부팅 시 등록 책임).
     * 이미 RUNNING → noop. PAUSED → resume 호출. STOPPED → start 호출.
     */
    private void ensureRunning(String topicId) {
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;
        if (!containerController.exists(listenerId)) {
            log.debug("[CaravanControl] ensureRunning noop (컨테이너 미존재 — Phase 7 책임): {}", topicId);
            return;
        }
        ContainerStatus status = containerController.getStatus(listenerId);
        switch (status) {
            case RUNNING -> { /* noop */ }
            case PAUSED -> {
                containerController.resume(listenerId);
                log.info("[CaravanControl] resumed: {}", topicId);
            }
            case STOPPED -> {
                containerController.start(listenerId);
                log.info("[CaravanControl] started: {}", topicId);
            }
            default -> log.debug("[CaravanControl] ensureRunning unknown status {}: {}", status, topicId);
        }
    }

    /** 컨테이너 없음 → noop. 이미 STOPPED → noop. RUNNING/PAUSED → stop 호출. */
    private void ensureStopped(String topicId) {
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;
        if (!containerController.exists(listenerId)) {
            log.debug("[CaravanControl] ensureStopped noop (컨테이너 미존재): {}", topicId);
            return;
        }
        if (containerController.getStatus(listenerId) == ContainerStatus.STOPPED) {
            return;
        }
        containerController.stop(listenerId);
        log.info("[CaravanControl] stopped: {}", topicId);
    }
}
