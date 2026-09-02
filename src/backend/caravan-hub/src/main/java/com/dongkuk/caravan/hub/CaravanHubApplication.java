package com.dongkuk.caravan.hub;

import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.kafka.annotation.EnableKafka;

/**
 * caravan-hub(Kafka Integration Service) 애플리케이션 진입점.
 *
 * <p>외부 시스템과 내부 시스템 간의 메시지를 중개하는 통합 서비스로,
 * HTTP, DB 테이블, SFTP 파일 세 가지 프로토콜을 지원하며 Kafka를 메시지 허브로 사용한다.</p>
 *
 * <p>{@code DataSourceAutoConfiguration}과 {@code MybatisAutoConfiguration}을 제외(exclude)하여
 * MST/IF 듀얼 DataSource를 {@link com.dongkuk.caravan.hub.config.DataSourceConfig}에서 수동 구성한다.
 * 자동 설정을 사용하면 DataSource가 하나만 등록되므로 반드시 제외해야 한다.</p>
 *
 * <p>{@code scanBasePackages} 에 caravan 패키지 추가 — caravan 의 @Configuration / @Component 들을
 * 스캔하여 ContainerController, KafkaListenerConfig 등이 등록되도록.</p>
 *
 * @see com.dongkuk.caravan.hub.config.DataSourceConfig
 * @see com.dongkuk.caravan.hub.config.CaravanHubProperties
 */
@EnableKafka
@SpringBootApplication(
    scanBasePackages = {"com.dongkuk.caravan.hub", "com.dongkuk.caravan.core"},
    exclude = {
        org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration.class,
        org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration.class
        // KafkaAutoConfiguration exclude 는 application.yml 의 spring.autoconfigure.exclude 에서 처리
        // (compile classpath 에 spring-boot-autoconfigure-kafka 가 직접 의존이 아니라 클래스 참조 불가).
    }
)
public class CaravanHubApplication {

    /**
     * 애플리케이션 메인 메서드.
     *
     * @param args 커맨드 라인 인수
     */
    public static void main(String[] args) {
        SpringApplication application = new SpringApplication(CaravanHubApplication.class);
        // 프로파일 미지정 bootRun/IDE 폴백 → local (2026-07-09 JNDI 전환, mcm 패턴).
        // defaultProperties 는 최저 우선순위 — -Dspring.profiles.active 지정 시 무시된다.
        // main() 경로 전용이라 WAR(ServletInitializer) 배포에서 -D 누락 시엔 폴백 없이 fail-fast.
        application.setDefaultProperties(Map.of("spring.profiles.default", "local"));
        application.run(args);
    }
}
