package com.dongkuk.caravan.core.container;

import com.dongkuk.caravan.core.consumer.KafkaDltConsumer;
import com.dongkuk.caravan.core.consumer.KafkaMessageConsumer;
import com.dongkuk.caravan.core.model.TopicInfo;
import com.dongkuk.caravan.core.repository.KafkaTopicRepository;
import com.dongkuk.caravan.core.util.KafkaConstants;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.format.support.DefaultFormattingConversionService;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.config.KafkaListenerEndpointRegistry;
import org.springframework.kafka.config.MethodKafkaListenerEndpoint;
import org.springframework.kafka.listener.MessageListenerContainer;
import org.springframework.kafka.listener.adapter.KafkaMessageHandlerMethodFactory;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.messaging.converter.GenericMessageConverter;
import org.springframework.messaging.handler.annotation.support.MessageHandlerMethodFactory;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;

import java.lang.reflect.Method;
import java.util.Optional;
import java.util.Set;

/**
 * Kafka 컨테이너 제어 서비스
 *
 * <p>Kafka Listener 컨테이너의 생명주기를 관리합니다.
 * 각 토픽별로 등록된 컨테이너를 시작, 정지, 일시정지, 재개할 수 있습니다.</p>
 *
 * <h3>Listener ID 규칙</h3>
 * <p>Listener ID는 {@code "listener-{topicId}"} 형식으로 구성됩니다.</p>
 * <ul>
 *   <li>일반 토픽: {@code listener-my-topic}</li>
 *   <li>DLT 토픽: {@code listener-my-topic.dlt}</li>
 * </ul>
 *
 * <h3>컨테이너 상태</h3>
 * <ul>
 *   <li>{@link ContainerStatus#RUNNING}: 메시지를 수신 중</li>
 *   <li>{@link ContainerStatus#PAUSED}: 일시정지 상태 (메시지 수신 중단, 컨테이너 유지)</li>
 *   <li>{@link ContainerStatus#STOPPED}: 완전 정지 상태</li>
 *   <li>{@link ContainerStatus#NOT_EXISTS}: 컨테이너가 존재하지 않음</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * @Service
 * public class MyService {
 *     private final ContainerController containerController;
 *
 *     public void handleError() {
 *         // 에러 발생 시 컨테이너 일시정지
 *         containerController.pause("listener-my-topic");
 *
 *         // 문제 해결 후 재개
 *         containerController.resume("listener-my-topic");
 *     }
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see ContainerStatus
 * @see KafkaListenerEndpointRegistry
 */
@Service
@RequiredArgsConstructor
public class ContainerController {

    private static final Logger log = LoggerFactory.getLogger(ContainerController.class);

    private final KafkaListenerEndpointRegistry registry;
    private final ConcurrentKafkaListenerContainerFactory<String, String> containerFactory;
    private final KafkaTopicRepository topicRepository;
    private final ObjectProvider<KafkaMessageConsumer> messageConsumerProvider;
    private final ObjectProvider<KafkaDltConsumer> dltConsumerProvider;
    private final ConfigurableApplicationContext applicationContext;

    /**
     * {@link com.dongkuk.caravan.core.consumer.KafkaListenerConfig#initHandlerMethodFactory} 와 동일 셋업.
     */
    private MessageHandlerMethodFactory handlerMethodFactory;

    @PostConstruct
    void initHandlerMethodFactory() {
        DefaultFormattingConversionService cs = new DefaultFormattingConversionService();
        KafkaMessageHandlerMethodFactory f = new KafkaMessageHandlerMethodFactory();
        f.setBeanFactory(applicationContext.getBeanFactory());
        f.setConversionService(cs);
        f.setMessageConverter(new GenericMessageConverter(cs));
        f.afterPropertiesSet();
        this.handlerMethodFactory = f;
    }

    /**
     * Kafka Listener 컨테이너를 일시정지합니다.
     *
     * <p>일시정지된 컨테이너는 메시지 수신을 중단하지만, 컨테이너 자체는 유지됩니다.
     * 브로커와의 연결은 유지되며, {@link #resume(String)}으로 즉시 재개할 수 있습니다.</p>
     *
     * <h4>일시정지 vs 정지</h4>
     * <ul>
     *   <li>일시정지 (pause): 브로커 연결 유지, 빠른 재개 가능</li>
     *   <li>정지 (stop): 브로커 연결 해제, 재시작 시 재연결 필요</li>
     * </ul>
     *
     * <p>이미 정지되었거나 일시정지된 컨테이너에 대해서는 아무 동작도 하지 않습니다.</p>
     *
     * @param listenerId Listener ID (예: "listener-my-topic")
     * @see #resume(String)
     */
    public void pause(String listenerId) {
        MessageListenerContainer container = getContainer(listenerId);
        if (container != null && container.isRunning()) {
            container.pause();
            log.info("컨테이너 일시정지: {}", listenerId);
        }
    }

    /**
     * 일시정지된 Kafka Listener 컨테이너를 재개합니다.
     *
     * <p>일시정지 상태에서만 동작합니다. 정지된 컨테이너는 {@link #start(String)}를
     * 사용해야 합니다.</p>
     *
     * @param listenerId Listener ID (예: "listener-my-topic")
     * @see #pause(String)
     */
    public void resume(String listenerId) {
        MessageListenerContainer container = getContainer(listenerId);
        if (container != null && container.isContainerPaused()) {
            container.resume();
            log.info("컨테이너 재개: {}", listenerId);
        }
    }

    /**
     * Kafka Listener 컨테이너를 완전히 정지합니다.
     *
     * <p>컨테이너를 정지하면 브로커와의 연결이 해제됩니다.
     * 다시 시작하려면 {@link #start(String)}를 호출해야 합니다.</p>
     *
     * <h4>주의사항</h4>
     * <p>정지 후 재시작 시 Consumer Group의 리밸런싱이 발생할 수 있습니다.</p>
     *
     * @param listenerId Listener ID (예: "listener-my-topic")
     * @see #start(String)
     */
    public void stop(String listenerId) {
        MessageListenerContainer container = getContainer(listenerId);
        if (container != null && container.isRunning()) {
            container.stop();
            log.info("컨테이너 정지: {}", listenerId);
        }
    }

    /**
     * 정지된 Kafka Listener 컨테이너를 시작합니다.
     *
     * <p>이미 실행 중인 컨테이너에 대해서는 아무 동작도 하지 않습니다.</p>
     *
     * <h4>주의사항</h4>
     * <p>컨테이너 시작 시 Consumer Group 리밸런싱이 발생할 수 있으며,
     * 파티션 할당까지 약간의 시간이 소요될 수 있습니다.</p>
     *
     * @param listenerId Listener ID (예: "listener-my-topic")
     * @see #stop(String)
     */
    public void start(String listenerId) {
        MessageListenerContainer container = getContainer(listenerId);
        if (container != null && !container.isRunning()) {
            container.start();
            log.info("컨테이너 시작: {}", listenerId);
        }
    }

    /**
     * Kafka Listener 컨테이너의 현재 상태를 조회합니다.
     *
     * @param listenerId Listener ID (예: "listener-my-topic")
     * @return 컨테이너 상태
     *         <ul>
     *           <li>{@link ContainerStatus#RUNNING}: 실행 중</li>
     *           <li>{@link ContainerStatus#PAUSED}: 일시정지</li>
     *           <li>{@link ContainerStatus#STOPPED}: 정지됨</li>
     *           <li>{@link ContainerStatus#NOT_EXISTS}: 존재하지 않음</li>
     *         </ul>
     */
    public ContainerStatus getStatus(String listenerId) {
        MessageListenerContainer container = getContainer(listenerId);
        if (container == null) {
            return ContainerStatus.NOT_EXISTS;
        }
        if (!container.isRunning()) {
            return ContainerStatus.STOPPED;
        }
        if (container.isContainerPaused()) {
            return ContainerStatus.PAUSED;
        }
        return ContainerStatus.RUNNING;
    }

    /**
     * Kafka Listener 컨테이너의 존재 여부를 확인합니다.
     *
     * @param listenerId Listener ID (예: "listener-my-topic")
     * @return 컨테이너 존재 여부 (true: 존재, false: 미존재)
     */
    public boolean exists(String listenerId) {
        return registry.getListenerContainer(listenerId) != null;
    }

    /**
     * 등록된 모든 Listener ID를 조회합니다.
     *
     * <p>현재 등록된 모든 Kafka Listener의 ID 목록을 반환합니다.
     * 이 목록에는 일반 토픽과 DLT 토픽의 Listener가 모두 포함됩니다.</p>
     *
     * @return 등록된 모든 Listener ID의 Set
     */
    public Set<String> getAllListenerIds() {
        return registry.getListenerContainerIds();
    }

    /**
     * 런타임에 Consumer 컨테이너를 새로 생성합니다.
     *
     * <p>DB에서 토픽 정보를 조회하여 원본 토픽과 DLT 토픽의 Endpoint를 등록합니다.</p>
     *
     * @param topicId 토픽 ID
     * @return 생성된 토픽의 GROUP_ID
     * @throws IllegalStateException 컨테이너가 이미 존재하거나 토픽 정보를 찾을 수 없는 경우
     */
    public String createConsumer(String topicId) {
        String listenerId = KafkaConstants.LISTENER_PREFIX + topicId;

        if (exists(listenerId)) {
            throw new IllegalStateException("컨테이너가 이미 존재합니다. listenerId=" + listenerId);
        }

        Optional<TopicInfo> topicInfoOpt = topicRepository.getTopicById(topicId);
        if (!topicInfoOpt.isPresent()) {
            throw new IllegalStateException("토픽 정보를 찾을 수 없습니다. topicId=" + topicId);
        }

        TopicInfo topicInfo = topicInfoOpt.get();
        String groupId = topicInfo.getGroupId();

        // 원본 토픽 Endpoint 등록
        registerConsumerEndpoint(listenerId, topicId, groupId, false);

        // DLT 토픽 Endpoint 등록
        registerConsumerEndpoint(listenerId + KafkaConstants.DLT_SUFFIX,
                topicId + KafkaConstants.DLT_SUFFIX,
                groupId + "-dlt", true);

        log.info("Consumer 생성 완료 - topicId={}, groupId={}", topicId, groupId);
        return groupId;
    }

    private void registerConsumerEndpoint(String listenerId, String topic, String groupId, boolean isDlt) {
        MethodKafkaListenerEndpoint<String, String> endpoint = new MethodKafkaListenerEndpoint<>();
        endpoint.setId(listenerId);
        endpoint.setGroupId(groupId);
        endpoint.setTopics(topic);
        endpoint.setBeanFactory(applicationContext.getBeanFactory());
        endpoint.setMessageHandlerMethodFactory(handlerMethodFactory);

        if (isDlt) {
            endpoint.setBean(dltConsumerProvider.getObject());
            endpoint.setMethod(getDltConsumeMethod());
        } else {
            endpoint.setBean(messageConsumerProvider.getObject());
            endpoint.setMethod(getConsumeMethod());
        }

        registry.registerListenerContainer(endpoint, containerFactory, true);
        log.info("Endpoint 등록 완료 - listenerId={}, topic={}, groupId={}", listenerId, topic, groupId);
    }

    private Method getConsumeMethod() {
        try {
            return KafkaMessageConsumer.class.getMethod("consume",
                    ConsumerRecord.class, Consumer.class, Acknowledgment.class);
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException("KafkaMessageConsumer.consume 메서드를 찾을 수 없습니다.", e);
        }
    }

    private Method getDltConsumeMethod() {
        try {
            return KafkaDltConsumer.class.getMethod("consume",
                    String.class, Acknowledgment.class,
                    String.class, String.class, String.class, Integer.class, Long.class);
        } catch (NoSuchMethodException e) {
            throw new IllegalStateException("KafkaDltConsumer.consume 메서드를 찾을 수 없습니다.", e);
        }
    }

    /**
     * Listener ID로 컨테이너를 조회합니다.
     *
     * @param listenerId Listener ID
     * @return MessageListenerContainer 또는 null (미존재 시)
     */
    private MessageListenerContainer getContainer(String listenerId) {
        return registry.getListenerContainer(listenerId);
    }
}
