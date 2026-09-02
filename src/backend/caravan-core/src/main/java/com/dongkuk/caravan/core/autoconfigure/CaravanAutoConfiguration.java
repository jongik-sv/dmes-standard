package com.dongkuk.caravan.core.autoconfigure;

import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.alert.LoggingAlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.config.KafkaAdminConfig;
import com.dongkuk.caravan.core.config.KafkaConsumerConfig;
import com.dongkuk.caravan.core.config.KafkaJpaConfig;
import com.dongkuk.caravan.core.config.KafkaProducerConfig;
import com.dongkuk.caravan.core.consumer.KafkaDltConsumer;
import com.dongkuk.caravan.core.consumer.KafkaListenerConfig;
import com.dongkuk.caravan.core.consumer.KafkaMessageConsumer;
import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.controller.KafkaStatusController;
import com.dongkuk.caravan.core.handler.DefaultKafkaInterfaceHandler;
import com.dongkuk.caravan.core.handler.KafkaInterfaceHandlerRegistry;
import com.dongkuk.caravan.core.offset.KafkaOffsetManager;
import com.dongkuk.caravan.core.offset.MessageBrowser;
import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.core.repository.KafkaErrorRepository;
import com.dongkuk.caravan.core.repository.KafkaTopicRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.kafka.core.KafkaTemplate;

import jakarta.annotation.PostConstruct;

/**
 * Caravan Spring Boot AutoConfiguration
 *
 * <p>Spring Boot 환경에서 Caravan 라이브러리를 자동으로 설정합니다.</p>
 *
 * <h3>활성화 조건</h3>
 * <ul>
 *   <li>{@code KafkaTemplate} 클래스가 classpath에 존재</li>
 *   <li>{@code caravan.kafka.enabled=true} (기본값: true)</li>
 * </ul>
 *
 * <h3>자동 등록되는 Bean</h3>
 * <ul>
 *   <li><b>Config</b>: DataSource, Producer, Consumer, Admin</li>
 *   <li><b>Handlers</b>: DefaultKafkaInterfaceHandler, KafkaInterfaceHandlerRegistry</li>
 *   <li><b>Services</b>: ContainerController, KafkaOffsetManager, MessageBrowser, Producer, Consumer</li>
 *   <li><b>Repositories</b>: KafkaTopicRepository, KafkaErrorRepository</li>
 *   <li><b>Controller</b>: KafkaStatusController (/kafkaApi/*)</li>
 * </ul>
 *
 * <h3>비활성화 방법</h3>
 * <pre>{@code
 * caravan:
 *   kafka:
 *     enabled: false
 * }</pre>
 *
 * <h3>수동 설정 (Spring Framework)</h3>
 * <p>Spring Boot를 사용하지 않는 환경에서는
 * {@link com.dongkuk.caravan.core.config.CaravanConfiguration}을 Import하세요.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.config.CaravanConfiguration
 * @see CaravanProperties
 */
@Configuration
@ConditionalOnClass({KafkaTemplate.class})
@EnableConfigurationProperties(CaravanProperties.class)
@ConditionalOnProperty(prefix = "caravan.kafka", name = "enabled", matchIfMissing = true)
@Import({
    // Config
    KafkaJpaConfig.class,
    KafkaProducerConfig.class,
    KafkaConsumerConfig.class,
    KafkaAdminConfig.class,
    // Handlers
    DefaultKafkaInterfaceHandler.class,
    KafkaInterfaceHandlerRegistry.class,
    // Services
    ContainerController.class,
    KafkaOffsetManager.class,
    MessageBrowser.class,
    KafkaMessageProducer.class,
    KafkaMessageConsumer.class,
    KafkaDltConsumer.class,
    KafkaListenerConfig.class,
    // Repositories
    KafkaTopicRepository.class,
    KafkaErrorRepository.class,
    // Controller
    KafkaStatusController.class
})
public class CaravanAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(CaravanAutoConfiguration.class);

    /**
     * AutoConfiguration 초기화 메서드.
     *
     * <p>애플리케이션 시작 시 Caravan 라이브러리 활성화 로그를 출력합니다.</p>
     */
    @PostConstruct
    public void init() {
        log.info("========================================");
        log.info("Caravan Kafka Library AutoConfiguration");
        log.info("========================================");
    }

    /**
     * 기본 알림 구현(WARN 로그). 앱(caravan-hub)이 {@link AlertNotifier} 구현 빈(예: SMS)을
     * 등록하면 이 fallback 은 물러난다({@code @ConditionalOnMissingBean}).
     */
    @Bean
    @ConditionalOnMissingBean(AlertNotifier.class)
    public AlertNotifier caravanLoggingAlertNotifier() {
        return new LoggingAlertNotifier();
    }
}
