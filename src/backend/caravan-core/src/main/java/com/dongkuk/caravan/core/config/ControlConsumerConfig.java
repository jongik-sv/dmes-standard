package com.dongkuk.caravan.core.config;

import com.dongkuk.caravan.core.service.ControlGroupIdResolver;
import java.util.HashMap;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;

/**
 * caravan.control 토픽 전용 Consumer 설정.
 *
 * <p>각 caravan 인스턴스가 unique groupId 로 구독 → broadcast 효과.
 * {@code auto.offset.reset=latest} — 부팅 직전의 명령은 무시 (DB 가 source of truth).
 * 자동 commit (메시지 손실 시 약간의 message 손실 가능하나 control 명령은 멱등이라 OK).</p>
 *
 * <p>토픽 메시지 컨슈머 (caravan 의 비즈니스 메시지) 와는 완전히 분리된 ConsumerFactory /
 * ContainerFactory 사용. 비즈니스 토픽의 컨슈머 설정과 충돌하지 않음.</p>
 */
@Configuration
@RequiredArgsConstructor
public class ControlConsumerConfig {

    public static final String CONTROL_LISTENER_CONTAINER_FACTORY = "controlKafkaListenerContainerFactory";

    private final CaravanProperties props;
    private final ControlGroupIdResolver groupIdResolver;

    @Bean
    public ConsumerFactory<String, String> controlConsumerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, props.getBootstrapServers());
        config.put(ConsumerConfig.GROUP_ID_CONFIG, groupIdResolver.get());
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        // 부팅 직전의 과거 명령은 무시. 부팅 시 DB STATUS 가 이미 RUNNING 으로 reset 됨 (Phase 7).
        config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "latest");
        // 자동 commit OK. control 명령은 멱등 (ensurePaused/ensureRunning/ensureStopped).
        config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, true);
        config.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 10);
        return new DefaultKafkaConsumerFactory<>(config);
    }

    @Bean(CONTROL_LISTENER_CONTAINER_FACTORY)
    public ConcurrentKafkaListenerContainerFactory<String, String> controlKafkaListenerContainerFactory(
            ConsumerFactory<String, String> controlConsumerFactory) {
        ConcurrentKafkaListenerContainerFactory<String, String> factory =
                new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(controlConsumerFactory);
        factory.setConcurrency(1);  // 단일 파티션이라 1
        return factory;
    }
}
