package com.dongkuk.caravan.console.caravanhub;

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
 * caravan-console caravan-hub 통합 클라이언트 자동 설정 (0.2.0 신규 — cactus 의존 제거 패턴 B).
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@link RestClient} classpath</li>
 *   <li>{@code caravan-console.caravanhub.enabled=true} (default true)</li>
 * </ul>
 *
 * <p>등록 빈:
 * <ul>
 *   <li>{@code consoleCaravanHubRestClient} — {@link RestClient} (X-Client-Key default header + X-Tx-Id/X-Request-Id interceptor)</li>
 *   <li>{@code consoleCaravanHubClient} — {@link DefaultConsoleCaravanHubClient}</li>
 * </ul>
 */
@AutoConfiguration
@ConditionalOnClass(RestClient.class)
@ConditionalOnProperty(prefix = "caravan-console.caravanhub", name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(ConsoleCaravanHubProperties.class)
public class ConsoleCaravanHubAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(ConsoleCaravanHubAutoConfiguration.class);

    @Bean(name = "consoleCaravanHubRestClient")
    @ConditionalOnMissingBean(name = "consoleCaravanHubRestClient")
    public RestClient consoleCaravanHubRestClient(ConsoleCaravanHubProperties props) {
        log.info("[caravan-console caravan-hub] RestClient — baseUrl={}, connectTimeout={}ms, readTimeout={}ms, clientKey={}",
                props.getBaseUrl(), props.getConnectTimeoutMs(), props.getReadTimeoutMs(),
                maskClientKey(props.getAuth().getClientKey()));

        RestClient.Builder builder = RestClient.builder()
                .requestFactory(jdkRequestFactory(props))
                .requestInterceptor((request, body, execution) -> {
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
    public ConsoleCaravanHubClient consoleCaravanHubClient(
            @Qualifier("consoleCaravanHubRestClient") RestClient restClient,
            ConsoleCaravanHubProperties props) {
        return new DefaultConsoleCaravanHubClient(restClient, props);
    }

    private ClientHttpRequestFactory jdkRequestFactory(ConsoleCaravanHubProperties props) {
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
