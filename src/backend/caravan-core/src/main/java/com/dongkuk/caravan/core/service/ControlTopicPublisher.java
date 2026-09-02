package com.dongkuk.caravan.core.service;

import com.dongkuk.caravan.core.model.ControlCommand;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * caravan.control 토픽 publisher.
 *
 * <p>트랜잭션 안에서 호출되면 commit 후에 실제 publish (afterCommit hook).
 * 트랜잭션 밖이면 즉시 publish.</p>
 *
 * <p>의도: TopicErrorService.markError 처럼 DB UPDATE 와 함께 publish 할 때,
 * commit 전에 broker 로 메시지가 흘러가면 다른 인스턴스가 “아직 commit 안 된 STATUS” 를
 * 못 보는 문제를 방지. afterCommit 으로 보장.</p>
 *
 * <p>publish 실패는 로그만. DB 영속화가 source of truth 라 다른 인스턴스가 부팅 시점에 동기화됨
 * (Phase 7 boot reset).</p>
 */
@Slf4j
@Component
public class ControlTopicPublisher {

    private final KafkaTemplate<String, String> kafkaTemplate;

    /** LocalDateTime 직렬화 위해 JavaTimeModule 등록. caravan 자체 ObjectMapper. */
    private final ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

    public ControlTopicPublisher(KafkaTemplate<String, String> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
    }

    public void publish(ControlCommand cmd) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    sendNow(cmd);
                }
            });
            log.debug("[CaravanControl] publish 예약 (afterCommit): action={}, topicId={}",
                    cmd.getAction(), cmd.getTopicId());
        } else {
            sendNow(cmd);
        }
    }

    private void sendNow(ControlCommand cmd) {
        try {
            String json = objectMapper.writeValueAsString(cmd);
            kafkaTemplate.send(ControlTopicBootstrap.CONTROL_TOPIC, cmd.getTopicId(), json);
            log.info("[CaravanControl] publish: action={}, topicId={}", cmd.getAction(), cmd.getTopicId());
        } catch (Exception e) {
            log.warn("[CaravanControl] publish 실패: {} ({})", cmd, e.getMessage());
        }
    }
}
