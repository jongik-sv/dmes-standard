package com.dongkuk.caravan.console.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestClient;

/**
 * caravan-console 의 인프라 빈 정의 — RestClient 만 자체 정의. AdminClient / KafkaTemplate 은 caravan 재사용.
 *
 * <p>v3 빈 재사용 전략: caravan 의 {@code kafkaAdminClient} / {@code kafkaTemplate} 빈을 caravan-console 가 그대로 받음.
 * caravan-console 별도 ProducerFactory / AdminClient 정의 시 caravan 측 빈 메서드 (type 만 받음) 와 모호성 발생 →
 * 빈 충돌 회피 차원에서 caravan default 재사용. caravan-console client_id 분리 필요 시 caravan 측 {@code @Qualifier}
 * 명시 패치 후 caravan-console 별 빈 추가 가능 (별 트랙).</p>
 *
 * <p>{@code ConsoleProperties} 는 {@code console.works-code} / {@code console.message.max-browse-count} 등의
 * caravan-console 자체 설정 바인딩에 사용. caravan 측 broker URL 은 caravan.kafka.bootstrap-servers 가 SoT.</p>
 */
@Configuration
@EnableConfigurationProperties(ConsoleProperties.class)
public class ConsoleInfraConfig {

    /**
     * caravan-hub 호스트의 {@code /kafkaApi/*} REST 호출용 RestClient (v4 §3 — caravan-console 가 caravan-hub VIP 한 곳만 호출).
     *
     * <p>v4 Phase 4-B (2026-05-13) — caravan-hub 의 {@code ClientKeyFilter} 가 모든 backend-backend 호출에
     * {@code X-Client-Key} 검증. 누락 시 401. {@code cactus.security.client-key} yml property 를 받아
     * default header 로 자동 부착 (v3 검증 시 발견된 401 이슈 해결, v4 §8-2).
     *
     * <p>timeout 은 Spring 6 RestClient 기본값 사용 (HttpURLConnection — connect 무한, read 무한).
     * 운영 환경에선 ClientHttpRequestFactory 명시로 5/30s timeout 권장. (별 트랙)
     */
    @Bean
    public RestClient consoleRestClient(@Value("${cactus.security.client-key:}") String clientKey) {
        RestClient.Builder builder = RestClient.builder();
        if (clientKey != null && !clientKey.isBlank()) {
            builder.defaultHeader("X-Client-Key", clientKey);
        }
        return builder.build();
    }
}
