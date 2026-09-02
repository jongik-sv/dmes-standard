package com.dongkuk.caravan.core.config;

import com.dongkuk.caravan.core.util.KafkaConstants;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.TopicPartition;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.kafka.listener.CommonErrorHandler;
import org.springframework.kafka.listener.ContainerProperties;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

import java.util.HashMap;
import java.util.Map;

/**
 * Kafka Consumer 설정
 *
 * <p>Kafka 메시지 수신을 위한 ConsumerFactory와 ListenerContainerFactory를 설정합니다.</p>
 *
 * <h3>생성되는 Bean</h3>
 * <ul>
 *   <li>{@code kafkaConsumerFactory}: Kafka Consumer 인스턴스 생성 팩토리</li>
 *   <li>{@code kafkaListenerContainerFactory}: Listener 컨테이너 생성 팩토리</li>
 * </ul>
 *
 * <h3>주요 설정</h3>
 * <table border="1">
 *   <tr><th>설정</th><th>프로퍼티</th><th>기본값</th></tr>
 *   <tr><td>auto-offset-reset</td><td>{@code caravan.kafka.consumer.auto-offset-reset}</td><td>earliest</td></tr>
 *   <tr><td>enable-auto-commit</td><td>{@code caravan.kafka.consumer.enable-auto-commit}</td><td>false</td></tr>
 *   <tr><td>max-poll-records</td><td>{@code caravan.kafka.consumer.max-poll-records}</td><td>1</td></tr>
 *   <tr><td>concurrency</td><td>{@code caravan.kafka.consumer.concurrency}</td><td>1</td></tr>
 * </table>
 *
 * <h3>Ack 모드</h3>
 * <p>MANUAL_IMMEDIATE 모드를 사용하여 핸들러에서 명시적으로 Offset을 커밋합니다.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see CaravanProperties.Consumer
 */
@Configuration
@EnableConfigurationProperties(CaravanProperties.class)
public class KafkaConsumerConfig {

    private static final Logger log = LoggerFactory.getLogger(KafkaConsumerConfig.class);

    /**
     * Kafka ConsumerFactory Bean을 생성합니다.
     *
     * <p>String key, String value 타입의 Consumer를 생성하는 팩토리입니다.</p>
     *
     * @param props Caravan 설정 프로퍼티
     * @return ConsumerFactory 인스턴스
     */
    @Bean("caravanKafkaConsumerFactory")
    @Primary
    public ConsumerFactory<String, String> kafkaConsumerFactory(CaravanProperties props) {
        CaravanProperties.Consumer c = props.getConsumer();

        Map<String, Object> config = new HashMap<>();
        config.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, props.getBootstrapServers());
        config.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
        config.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, c.getAutoOffsetReset());
        config.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, c.isEnableAutoCommit());
        config.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, c.getMaxPollRecords());

        log.info("Kafka Consumer 설정 - servers: {}, autoOffsetReset: {}, maxPollRecords: {}",
            props.getBootstrapServers(), c.getAutoOffsetReset(), c.getMaxPollRecords());

        return new DefaultKafkaConsumerFactory<>(config);
    }

    /**
     * Kafka ListenerContainerFactory Bean을 생성합니다.
     *
     * <p>동적 Listener 등록 및 컨테이너 생성에 사용되는 팩토리입니다.
     * MANUAL_IMMEDIATE Ack 모드로 설정되어 있습니다.</p>
     *
     * @param consumerFactory ConsumerFactory 인스턴스
     * @param props           Caravan 설정 프로퍼티
     * @return ConcurrentKafkaListenerContainerFactory 인스턴스
     */
    @Bean("kafkaListenerContainerFactory")
    @Primary
    public ConcurrentKafkaListenerContainerFactory<String, String> kafkaListenerContainerFactory(
            ConsumerFactory<String, String> consumerFactory,
            CaravanProperties props,
            CommonErrorHandler caravanCommonErrorHandler) {

        CaravanProperties.Consumer c = props.getConsumer();

        ConcurrentKafkaListenerContainerFactory<String, String> factory =
            new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setConcurrency(c.getConcurrency());
        factory.getContainerProperties().setPollTimeout(c.getPollTimeoutMs());
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        factory.setCommonErrorHandler(caravanCommonErrorHandler);

        log.info("Kafka ListenerContainerFactory 설정 - concurrency: {}, pollTimeout: {}ms, parentAckMode={}, errorHandler=DLT",
            c.getConcurrency(), c.getPollTimeoutMs(), factory.getContainerProperties().getAckMode());

        return factory;
    }

    /**
     * Kafka Listener 공통 에러 핸들러 — DLT 게시 + 재시도 없음.
     *
     * <p>{@link com.dongkuk.caravan.core.consumer.KafkaMessageConsumer} 본문에 진입조차 못한 catastrophic 케이스
     * (예: payload 디시리얼라이즈 실패, MethodArgumentResolutionException) <b>에만</b> 도달하는 안전망이다.
     * 정상 비즈니스 실패는 <b>DLT 로 가지 않는다</b> — 핸들러 내부에서 큐막기(재시도 소진 시
     * {@code markError}=STATUS 'ERROR' + CONTROL 토픽 publish + {@code pause}/{@code seek})로 처리되어
     * 메시지가 원본 토픽에 보존되고 운영자가 skip/resume 을 결정한다. 즉 이 DLT 경로는 비즈니스 포이즌을
     * 잡지 못하며(설계상 의도), 실제 실패 가시성은 큐막기(STATUS='ERROR')와 알림으로 확보한다.</p>
     *
     * <h4>동작</h4>
     * <ul>
     *   <li>실패 record 를 {@code <원본토픽>.dlt} 로 publish</li>
     *   <li>{@link FixedBackOff#FixedBackOff(long, long) FixedBackOff(0,0)} — 재시도 없음, 즉시 recover</li>
     *   <li>partition 보존 (원본 partition → DLT 동일 partition)</li>
     * </ul>
     *
     * @param template DLT 게시용 KafkaTemplate (caravan {@code kafkaTemplate} 빈)
     */
    @Bean("caravanCommonErrorHandler")
    public CommonErrorHandler caravanCommonErrorHandler(KafkaOperations<String, String> template) {
        DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(
            template,
            (record, ex) -> new TopicPartition(
                record.topic() + KafkaConstants.DLT_SUFFIX,
                record.partition()
            )
        );
        DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, new FixedBackOff(0L, 0L));
        log.info("Caravan CommonErrorHandler 활성 - DLT recoverer + FixedBackOff(0,0)");
        return handler;
    }
}
