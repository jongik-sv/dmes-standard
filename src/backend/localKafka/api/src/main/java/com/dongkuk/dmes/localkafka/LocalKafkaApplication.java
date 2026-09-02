package com.dongkuk.dmes.localkafka;

import io.github.embeddedkafka.EmbeddedKafka$;
import io.github.embeddedkafka.EmbeddedKafkaConfig;
import io.github.embeddedkafka.EmbeddedKafkaConfig$;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;
import scala.collection.immutable.Map$;

/**
 * 로컬 개발용 임베디드 Kafka 브로커 (KRaft 모드 + fixed port).
 *
 * <p>spring-kafka 의 {@code EmbeddedKafkaKraftBroker} 는 KRaft 모드에서 fixed port 강제가
 * 안 되므로 (issue #2916), {@code io.github.embeddedkafka} 의 {@code EmbeddedKafka} 를 사용.</p>
 *
 * <p>topics 시드: 부팅 시점에 미리 만들어둘 토픽을 {@code application.yml} 의 {@code localkafka.topics} 에 추가.
 * 자동 생성은 활성 — Kafka 기본값({@code auto.create.topics.enable=true}) 그대로라 시드 외 토픽도
 * 클라이언트 publish/subscribe 시 자동 생성된다(로컬 개발 편의). 시드 목록은 부팅 직후 broker startup race 회피용.</p>
 */
@Slf4j
@SpringBootApplication
@EnableConfigurationProperties(LocalKafkaApplication.LocalKafkaProperties.class)
public class LocalKafkaApplication {

    public static void main(String[] args) {
        SpringApplication.run(LocalKafkaApplication.class, args);
    }

    @Component
    static class EmbeddedKafkaLifecycle {

        private final LocalKafkaProperties props;

        EmbeddedKafkaLifecycle(LocalKafkaProperties props) {
            this.props = props;
        }

        @PostConstruct
        public void start() {
            log.info("[LocalKafka] Starting embedded Kafka — kafkaPort={}, controllerPort={}",
                    props.port(), props.controllerPort());

            // EmbeddedKafkaConfig.apply(kafkaPort, controllerPort, customBrokerProperties,
            //                          customProducerProperties, customConsumerProperties)
            EmbeddedKafkaConfig config = EmbeddedKafkaConfig$.MODULE$.apply(
                    props.port(),
                    props.controllerPort(),
                    Map$.MODULE$.empty(),
                    Map$.MODULE$.empty(),
                    Map$.MODULE$.empty()
            );
            EmbeddedKafka$.MODULE$.start(config);

            // 시드 토픽 생성 (yml 의 localkafka.topics)
            for (String topic : safeList(props.topics())) {
                try {
                    EmbeddedKafka$.MODULE$.createCustomTopic(
                            topic,
                            Map$.MODULE$.empty(),
                            props.partitions(),
                            (short) 1,
                            config
                    );
                    log.info("[LocalKafka] Seeded topic: {}", topic);
                } catch (Exception e) {
                    log.warn("[LocalKafka] Topic seed failed: {} — {}", topic, e.getMessage());
                }
            }

            log.info("[LocalKafka] Embedded Kafka ready at localhost:{}", props.port());
        }

        @PreDestroy
        public void stop() {
            log.info("[LocalKafka] Stopping embedded Kafka");
            EmbeddedKafka$.MODULE$.stop();
        }

        private static List<String> safeList(List<String> list) {
            return list == null ? List.of() : list;
        }
    }

    @ConfigurationProperties(prefix = "localkafka")
    public record LocalKafkaProperties(int port, int controllerPort, int partitions, List<String> topics) {
        public LocalKafkaProperties {
            if (port <= 0) port = 9092;
            if (controllerPort <= 0) controllerPort = 9093;
            if (partitions <= 0) partitions = 1;
        }
    }
}
