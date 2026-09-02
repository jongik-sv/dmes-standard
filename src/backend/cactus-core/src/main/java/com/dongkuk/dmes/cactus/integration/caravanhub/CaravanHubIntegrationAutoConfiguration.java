package com.dongkuk.dmes.cactus.integration.caravanhub;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.UUID;

/**
 * caravan-hub 통합 클라이언트 자동 설정.
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@link RestClient} classpath (spring-web 가용)</li>
 *   <li>{@code cactus.caravan-hub.enabled=true} (기본 true, {@code matchIfMissing=true})</li>
 * </ul>
 *
 * <p>등록되는 빈:
 * <ul>
 *   <li>{@code cactusCaravanHubRestClient} — {@link RestClient}. {@code X-Client-Key} default header + {@code X-Tx-Id} / {@code X-Request-Id} 매 요청 UUID interceptor + connect/read timeout 적용</li>
 *   <li>{@code caravanHubIntegrationClient} — {@link DefaultCaravanHubIntegrationClient}</li>
 * </ul>
 *
 * <p>cactus 4 헤더 표준:
 * <ul>
 *   <li>{@code X-Client-Key} — yml {@code cactus.caravan-hub.auth.client-key}, default header (정적)</li>
 *   <li>{@code X-Tx-Id} / {@code X-Request-Id} — 호출 시점 UUID, interceptor 로 동적 부착</li>
 *   <li>{@code Authorization} — backend-backend 통신이라 생략</li>
 * </ul>
 *
 * <p>v4 caravan-hub-EAI 마이그레이션 Phase 4-A (2026-05-13).
 */
@AutoConfiguration
@ConditionalOnClass(RestClient.class)
@ConditionalOnProperty(prefix = "cactus.caravan-hub", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(CaravanHubClientProperties.class)
public class CaravanHubIntegrationAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(CaravanHubIntegrationAutoConfiguration.class);

    @Bean(name = "cactusCaravanHubRestClient")
    @ConditionalOnMissingBean(name = "cactusCaravanHubRestClient")
    public RestClient cactusCaravanHubRestClient(CaravanHubClientProperties props) {
        log.info("[Cactus caravan-hub] RestClient 등록 — baseUrl={}, connectTimeout={}ms, readTimeout={}ms, clientKey={}",
                props.getBaseUrl(), props.getConnectTimeoutMs(), props.getReadTimeoutMs(),
                maskClientKey(props.getAuth().getClientKey()));

        RestClient.Builder builder = RestClient.builder()
                .requestFactory(jdkRequestFactory(props))
                .requestInterceptor((request, body, execution) -> {
                    // X-Tx-Id / X-Request-Id — 매 요청 동적 UUID
                    String txId = UUID.randomUUID().toString();
                    request.getHeaders().add("X-Tx-Id", txId);
                    request.getHeaders().add("X-Request-Id", txId);
                    return execution.execute(request, body);
                });

        String clientKey = props.getAuth().getClientKey();
        if (clientKey != null && !clientKey.isBlank()) {
            builder.defaultHeader("X-Client-Key", clientKey);
        }

        return builder.build();
    }

    @Bean
    @ConditionalOnMissingBean
    public CaravanHubIntegrationClient caravanHubIntegrationClient(
            @Qualifier("cactusCaravanHubRestClient") RestClient restClient,
            CaravanHubClientProperties props) {
        return new DefaultCaravanHubIntegrationClient(restClient, props);
    }

    /**
     * Spring Boot 4 의 표준 ClientHttpRequestFactory — {@link java.net.http.HttpClient} 기반.
     * connect timeout 만 직접 적용 (HttpClient 자체), read timeout 은 RequestFactory 에 set.
     */
    private ClientHttpRequestFactory jdkRequestFactory(CaravanHubClientProperties props) {
        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(props.getConnectTimeoutMs()))
                .build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(httpClient);
        factory.setReadTimeout(Duration.ofMillis(props.getReadTimeoutMs()));
        return factory;
    }

    private String maskClientKey(String key) {
        if (key == null || key.length() < 8) return "***";
        return key.substring(0, 4) + "***" + key.substring(key.length() - 4);
    }
}
