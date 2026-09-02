package com.dongkuk.caravan.core.service;

import com.dongkuk.caravan.core.config.CaravanProperties;
import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.errors.TopicExistsException;
import org.springframework.stereotype.Component;

/**
 * caravan 부팅 시 control topic ({@value #CONTROL_TOPIC}) 의 존재를 보장한다.
 *
 * <p>인스턴스 간 명령 전달용 broadcast 채널. 운영자 pause/resume/stop 명령과 자동 ERROR 진입 알림이
 * 이 토픽으로 흐른다. 모든 caravan 인스턴스가 이 토픽을 unique groupId 로 구독.</p>
 *
 * <p>retention.ms = 1시간. DB 가 source of truth 이므로 토픽은 단기 push 채널로만 사용.
 * broker policy 가 retention 설정을 거부하면 default 값으로 fallback.</p>
 *
 * <p>replicas = {@code caravan.kafka.replication-factor}(기본 1). 3브로커 클러스터에선 3 으로
 * 설정해 명령 채널도 브로커 1대 장애를 견디게 한다.</p>
 *
 * <p>이미 존재하는 토픽은 {@link TopicExistsException} 으로 skip.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ControlTopicBootstrap {

    public static final String CONTROL_TOPIC = "caravan.control";

    private static final int PARTITIONS = 1;
    private static final long ADMIN_TIMEOUT_SECONDS = 10;

    private final AdminClient adminClient;
    private final CaravanProperties caravanProperties;

    @PostConstruct
    public void ensure() {
        try {
            NewTopic topic = new NewTopic(CONTROL_TOPIC, PARTITIONS, caravanProperties.getReplicationFactor());
            // retention 짧게 설정 시도. broker policy 가 거부하면 default 사용.
            try {
                topic.configs(Map.of(
                        "retention.ms", "3600000",   // 1시간
                        "cleanup.policy", "delete"
                ));
            } catch (Exception ignore) {
                // configs() 가 unmodifiable map 등으로 실패 시 fallback to default broker config
            }

            adminClient.createTopics(List.of(topic))
                    .all()
                    .get(ADMIN_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            log.info("[CaravanControl] {} 생성", CONTROL_TOPIC);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof TopicExistsException) {
                log.info("[CaravanControl] {} 이미 존재", CONTROL_TOPIC);
                return;
            }
            throw new IllegalStateException("control topic 생성 실패: " + CONTROL_TOPIC, e.getCause());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("control topic 생성 중단: " + CONTROL_TOPIC, e);
        } catch (TimeoutException e) {
            throw new IllegalStateException("control topic 생성 타임아웃: " + CONTROL_TOPIC, e);
        }
    }
}
