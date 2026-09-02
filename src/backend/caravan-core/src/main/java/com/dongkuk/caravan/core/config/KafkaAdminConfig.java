package com.dongkuk.caravan.core.config;

import org.apache.kafka.clients.admin.AdminClient;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.apache.kafka.common.TopicPartition;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka AdminClient 및 Dead Letter Topic (DLT) 설정
 *
 * <p>Kafka 관리 작업 및 DLT 처리를 위한 Bean을 설정합니다.</p>
 *
 * <h3>생성되는 Bean</h3>
 * <ul>
 *   <li>{@code kafkaAdminClient}: Offset 조회/변경, 토픽 관리 등에 사용</li>
 *   <li>{@code deadLetterPublishingRecoverer}: 처리 실패 메시지를 DLT로 전송</li>
 * </ul>
 *
 * <h3>Dead Letter Topic 규칙</h3>
 * <p>DLT 토픽명은 원본 토픽명에 {@code .dlt} 접미사가 붙습니다.</p>
 * <ul>
 *   <li>원본 토픽: {@code my-topic}</li>
 *   <li>DLT 토픽: {@code my-topic.dlt}</li>
 * </ul>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.offset.KafkaOffsetManager
 */
@Configuration
@EnableConfigurationProperties(CaravanProperties.class)
public class KafkaAdminConfig {

    private static final Logger log = LoggerFactory.getLogger(KafkaAdminConfig.class);

    /**
     * Kafka AdminClient Bean을 생성합니다.
     *
     * <p>Offset 조회, Offset 변경, Consumer Group 관리 등의 작업에 사용됩니다.</p>
     *
     * @param props Caravan 설정 프로퍼티
     * @return AdminClient 인스턴스
     */
    @Bean
    @ConditionalOnMissingBean
    public AdminClient kafkaAdminClient(CaravanProperties props) {
        Map<String, Object> config = new HashMap<>();
        config.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, props.getBootstrapServers());

        log.info("Kafka AdminClient 설정 - servers: {}", props.getBootstrapServers());

        return AdminClient.create(config);
    }

    /**
     * DeadLetterPublishingRecoverer Bean을 생성합니다.
     *
     * <p>메시지 처리 실패 시 해당 메시지를 DLT(Dead Letter Topic)로 전송하는 Recoverer입니다.
     * DLT 토픽은 원본 토픽명에 {@code .dlt} 접미사가 붙습니다.</p>
     *
     * @param kafkaTemplate 메시지 전송에 사용할 KafkaTemplate
     * @return DeadLetterPublishingRecoverer 인스턴스
     */
    @Bean
    @ConditionalOnMissingBean
    public DeadLetterPublishingRecoverer deadLetterPublishingRecoverer(
            KafkaTemplate<String, String> kafkaTemplate) {
        return new DeadLetterPublishingRecoverer(kafkaTemplate,
            (record, ex) -> new TopicPartition(record.topic() + ".dlt", record.partition()));
    }
}
