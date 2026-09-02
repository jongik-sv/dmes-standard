package com.dongkuk.caravan.core.config;

import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.alert.LoggingAlertNotifier;
import com.dongkuk.caravan.core.consumer.KafkaDltConsumer;
import com.dongkuk.caravan.core.consumer.KafkaListenerConfig;
import com.dongkuk.caravan.core.consumer.KafkaMessageConsumer;
import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.handler.DefaultKafkaInterfaceHandler;
import com.dongkuk.caravan.core.handler.KafkaInterfaceHandlerRegistry;
import com.dongkuk.caravan.core.offset.KafkaOffsetManager;
import com.dongkuk.caravan.core.offset.MessageBrowser;
import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.core.repository.KafkaErrorRepository;
import com.dongkuk.caravan.core.repository.KafkaTopicRepository;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;

/**
 * Caravan 수동 Import용 통합 설정
 *
 * <p>Spring Boot AutoConfiguration을 사용하지 않는 순수 Spring Framework 환경에서
 * 이 클래스를 Import하여 Caravan 라이브러리의 모든 컴포넌트를 활성화합니다.</p>
 *
 * <h3>사용 방법</h3>
 * <pre>{@code
 * @Configuration
 * @Import(CaravanConfiguration.class)
 * @PropertySource("classpath:caravan.properties")
 * public class AppConfig {
 *     // 추가 설정...
 * }
 * }</pre>
 *
 * <h3>Import되는 컴포넌트</h3>
 * <ul>
 *   <li><b>Config</b>: DataSource, Producer, Consumer, Admin</li>
 *   <li><b>Handlers</b>: DefaultKafkaInterfaceHandler, KafkaInterfaceHandlerRegistry</li>
 *   <li><b>Services</b>: ContainerController, KafkaOffsetManager, MessageBrowser, Producer, Consumer</li>
 *   <li><b>Repositories</b>: KafkaTopicRepository, KafkaErrorRepository</li>
 * </ul>
 *
 * <h3>Spring Boot 환경</h3>
 * <p>Spring Boot를 사용하는 경우 이 클래스 대신
 * {@link com.dongkuk.caravan.core.autoconfigure.CaravanAutoConfiguration}이 자동으로 적용됩니다.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.autoconfigure.CaravanAutoConfiguration
 */
@Configuration
@Import({
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
    KafkaErrorRepository.class
})
public class CaravanConfiguration {
    // 모든 설정 통합 Import

    /**
     * 기본 알림 구현(WARN 로그). 비-Boot(수동 Import) 환경용 fallback.
     * 앱이 별도 {@link AlertNotifier} 빈을 제공하지 않으면 이 빈이 사용된다.
     */
    @Bean
    public AlertNotifier caravanLoggingAlertNotifier() {
        return new LoggingAlertNotifier();
    }
}
