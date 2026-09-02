package com.dongkuk.caravan.core.consumer;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.model.TopicInfo;
import com.dongkuk.caravan.core.repository.KafkaTopicRepository;
import com.dongkuk.caravan.core.util.KafkaConstants;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.ConfigurableBeanFactory;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.format.support.DefaultFormattingConversionService;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.annotation.KafkaListenerConfigurer;
import org.springframework.kafka.config.KafkaListenerEndpointRegistrar;
import org.springframework.kafka.config.MethodKafkaListenerEndpoint;
import org.springframework.kafka.listener.adapter.KafkaMessageHandlerMethodFactory;
import org.springframework.messaging.converter.GenericMessageConverter;
import org.springframework.messaging.handler.annotation.support.MessageHandlerMethodFactory;

import java.lang.reflect.Method;
import java.util.List;

/**
 * Kafka Listener 동적 등록 설정
 *
 * <p>TB_CARAVAN_TOPICS 테이블에 등록된 토픽을 기반으로 Kafka Listener를 동적으로 등록합니다.</p>
 *
 * <h3>동작 방식</h3>
 * <ol>
 *   <li>애플리케이션 시작 시 {@link KafkaListenerConfigurer}가 호출됨</li>
 *   <li>TB_CARAVAN_TOPICS에서 현재 BIZ_SYSTEM의 토픽 목록 조회</li>
 *   <li>각 토픽에 대해 메인 Listener와 DLT Listener 등록</li>
 * </ol>
 *
 * <h3>Listener ID 규칙</h3>
 * <ul>
 *   <li>메인 Listener: {@code listener-{topicId}}</li>
 *   <li>DLT Listener: {@code listener-{topicId}.dlt}</li>
 * </ul>
 *
 * <h3>Consumer Group ID 규칙</h3>
 * <ul>
 *   <li>메인: TB_CARAVAN_TOPICS.GROUP_ID</li>
 *   <li>DLT: TB_CARAVAN_TOPICS.GROUP_ID + "-dlt"</li>
 * </ul>
 *
 * <h3>Consumer 비활성화</h3>
 * <p>{@code caravan.kafka.consumer.enabled=false}로 설정하면 Listener가 등록되지 않습니다.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see KafkaMessageConsumer
 * @see KafkaDltConsumer
 */
@Configuration
@RequiredArgsConstructor
public class KafkaListenerConfig implements KafkaListenerConfigurer {

    private static final Logger log = LoggerFactory.getLogger(KafkaListenerConfig.class);

    private final KafkaTopicRepository topicRepository;
    private final KafkaMessageConsumer messageConsumer;
    private final KafkaDltConsumer dltConsumer;
    private final CaravanProperties properties;
    private final ConcurrentKafkaListenerContainerFactory<String, String> factory;
    private final ConfigurableApplicationContext applicationContext;

    /**
     * Spring Kafka 의 {@code KafkaListenerAnnotationBeanPostProcessor$KafkaHandlerMethodFactoryAdapter
     * .createDefaultMessageHandlerMethodFactory} 와 동일하게 풀 셋업한 factory:
     * <ul>
     *   <li>{@link KafkaMessageHandlerMethodFactory} ({@code KafkaNullAwarePayloadArgumentResolver}
     *       + {@code ContinuationHandlerMethodArgumentResolver} 내장)</li>
     *   <li>{@code setBeanFactory(...)} — SpEL/리졸버 셋업 핵심. 누락 시 listener method
     *       메타데이터 추론에서 ack 파라미터의 noOpAck 셋업이 일부 누락된다.</li>
     *   <li>{@code setConversionService} + {@code setMessageConverter} — KafkaNull 인식 +
     *       payload conversion</li>
     *   <li>{@code afterPropertiesSet()} — argumentResolvers 초기화</li>
     * </ul>
     */
    private MessageHandlerMethodFactory handlerMethodFactory;

    @PostConstruct
    void initHandlerMethodFactory() {
        DefaultFormattingConversionService cs = new DefaultFormattingConversionService();
        KafkaMessageHandlerMethodFactory f = new KafkaMessageHandlerMethodFactory();
        ConfigurableBeanFactory bf = applicationContext.getBeanFactory();
        f.setBeanFactory(bf);
        f.setConversionService(cs);
        f.setMessageConverter(new GenericMessageConverter(cs));
        f.afterPropertiesSet();
        this.handlerMethodFactory = f;
        log.info("[caravan] MessageHandlerMethodFactory 셋업 완료 - KafkaMessageHandlerMethodFactory + beanFactory + GenericMessageConverter");
    }

    /**
     * Kafka Listener를 동적으로 등록합니다.
     *
     * <p>Spring Kafka가 애플리케이션 시작 시 이 메서드를 호출합니다.</p>
     *
     * @param registrar Listener 등록기
     */
    @Override
    public void configureKafkaListeners(KafkaListenerEndpointRegistrar registrar) {
        if (!properties.getConsumer().isEnabled()) {
            log.warn("========================================");
            log.warn("Kafka Consumer가 비활성화 상태입니다.");
            log.warn("활성화: caravan.kafka.consumer.enabled=true");
            log.warn("========================================");
            return;
        }

        List<TopicInfo> topics = topicRepository.getTopics();
        log.info("Kafka Listener 등록 시작 - 토픽 수: {}", topics.size());

        for (TopicInfo topic : topics) {
            // 원본 토픽 Listener 등록
            registerMainListener(registrar, topic);

            // DLT 토픽 Listener 등록
            registerDltListener(registrar, topic);
        }

        log.info("Kafka Listener 등록 완료");
    }

    private void registerMainListener(KafkaListenerEndpointRegistrar registrar, TopicInfo topic) {
        try {
            MethodKafkaListenerEndpoint<String, String> endpoint = new MethodKafkaListenerEndpoint<>();
            endpoint.setId(KafkaConstants.LISTENER_PREFIX + topic.getTopicId());
            endpoint.setGroupId(topic.getGroupId());
            endpoint.setTopics(topic.getTopicId());
            endpoint.setBean(messageConsumer);
            endpoint.setMethod(getConsumeMethod());
            endpoint.setBeanFactory(applicationContext.getBeanFactory());
            endpoint.setMessageHandlerMethodFactory(handlerMethodFactory);

            registrar.registerEndpoint(endpoint, factory);
            log.info("Listener 등록: {} (groupId: {})", topic.getTopicId(), topic.getGroupId());
        } catch (Exception e) {
            log.error("Listener 등록 실패: {} - {}", topic.getTopicId(), e.getMessage());
        }
    }

    private void registerDltListener(KafkaListenerEndpointRegistrar registrar, TopicInfo topic) {
        try {
            MethodKafkaListenerEndpoint<String, String> endpoint = new MethodKafkaListenerEndpoint<>();
            endpoint.setId(KafkaConstants.LISTENER_PREFIX + topic.getTopicId() + KafkaConstants.DLT_SUFFIX);
            endpoint.setGroupId(topic.getGroupId() + "-dlt");
            endpoint.setTopics(topic.getTopicId() + KafkaConstants.DLT_SUFFIX);
            endpoint.setBean(dltConsumer);
            endpoint.setMethod(getDltConsumeMethod());
            endpoint.setBeanFactory(applicationContext.getBeanFactory());
            endpoint.setMessageHandlerMethodFactory(handlerMethodFactory);

            registrar.registerEndpoint(endpoint, factory);
            log.info("DLT Listener 등록: {}{}", topic.getTopicId(), KafkaConstants.DLT_SUFFIX);
        } catch (Exception e) {
            log.error("DLT Listener 등록 실패: {} - {}", topic.getTopicId(), e.getMessage());
        }
    }

    private Method getConsumeMethod() throws NoSuchMethodException {
        return KafkaMessageConsumer.class.getMethod("consume",
            org.apache.kafka.clients.consumer.ConsumerRecord.class,
            org.apache.kafka.clients.consumer.Consumer.class,
            org.springframework.kafka.support.Acknowledgment.class);
    }

    private Method getDltConsumeMethod() throws NoSuchMethodException {
        return KafkaDltConsumer.class.getMethod("consume",
            String.class,
            org.springframework.kafka.support.Acknowledgment.class,
            String.class,
            String.class,
            String.class,
            Integer.class,
            Long.class);
    }
}
