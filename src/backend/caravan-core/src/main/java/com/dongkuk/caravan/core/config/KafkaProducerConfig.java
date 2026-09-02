package com.dongkuk.caravan.core.config;

import org.apache.kafka.clients.producer.ProducerConfig;
import org.apache.kafka.common.serialization.StringSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.core.DefaultKafkaProducerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.core.ProducerFactory;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka Producer 설정
 *
 * <p>Kafka 메시지 전송을 위한 ProducerFactory와 KafkaTemplate을 설정합니다.</p>
 *
 * <h3>생성되는 Bean</h3>
 * <ul>
 *   <li>{@code kafkaProducerFactory}: Kafka Producer 인스턴스 생성 팩토리</li>
 *   <li>{@code kafkaTemplate}: 메시지 전송에 사용하는 템플릿</li>
 * </ul>
 *
 * <h3>주요 설정</h3>
 * <table border="1">
 *   <tr><th>설정</th><th>프로퍼티</th><th>기본값</th></tr>
 *   <tr><td>acks</td><td>{@code caravan.kafka.producer.acks}</td><td>all</td></tr>
 *   <tr><td>retries</td><td>{@code caravan.kafka.producer.retries}</td><td>3</td></tr>
 *   <tr><td>idempotence</td><td>{@code caravan.kafka.producer.idempotence}</td><td>true</td></tr>
 *   <tr><td>max-in-flight</td><td>{@code caravan.kafka.producer.max-in-flight-requests}</td><td>5</td></tr>
 * </table>
 *
 * @author Caravan
 * @version 1.0.0
 * @see CaravanProperties.Producer
 */
@Configuration
@EnableConfigurationProperties(CaravanProperties.class)
public class KafkaProducerConfig {

    private static final Logger log = LoggerFactory.getLogger(KafkaProducerConfig.class);

    /**
     * Kafka ProducerFactory Bean을 생성합니다.
     *
     * <p>String key, String value 타입의 Producer를 생성하는 팩토리입니다.</p>
     *
     * @param props Caravan 설정 프로퍼티
     * @return ProducerFactory 인스턴스
     */
    @Bean
    @ConditionalOnMissingBean
    public ProducerFactory<String, String> kafkaProducerFactory(CaravanProperties props) {
        CaravanProperties.Producer p = props.getProducer();

        Map<String, Object> config = new HashMap<>();
        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, props.getBootstrapServers());
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.ACKS_CONFIG, p.getAcks());
        config.put(ProducerConfig.RETRIES_CONFIG, p.getRetries());
        config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, p.isIdempotence());
        config.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, p.getMaxInFlightRequests());

        log.info("Kafka Producer 설정 - servers: {}, acks: {}, retries: {}",
            props.getBootstrapServers(), p.getAcks(), p.getRetries());

        return new DefaultKafkaProducerFactory<>(config);
    }

    /**
     * KafkaTemplate Bean을 생성합니다.
     *
     * <p>메시지 전송에 사용하는 주요 템플릿입니다.
     * {@link com.dongkuk.caravan.core.producer.KafkaMessageProducer}에서 사용됩니다.</p>
     *
     * @param factory ProducerFactory 인스턴스
     * @return KafkaTemplate 인스턴스
     */
    @Bean
    @ConditionalOnMissingBean
    public KafkaTemplate<String, String> kafkaTemplate(ProducerFactory<String, String> factory) {
        return new KafkaTemplate<>(factory);
    }
}
