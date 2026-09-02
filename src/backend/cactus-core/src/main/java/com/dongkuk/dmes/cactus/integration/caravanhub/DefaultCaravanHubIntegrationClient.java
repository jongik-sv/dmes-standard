package com.dongkuk.dmes.cactus.integration.caravanhub;

import com.dongkuk.dmes.cactus.integration.caravanhub.exception.CaravanHubIntegrationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * {@link CaravanHubIntegrationClient} 의 RestClient 기반 기본 구현.
 *
 * <p>{@link CaravanHubClientProperties}의 retry 정책 (max-attempts / delay-ms) 에 따라 실패 시 재시도.
 * 모든 시도 실패 시 {@link CaravanHubIntegrationException} 전파.
 *
 * <p>v4 caravan-hub-EAI 마이그레이션 Phase 4-A (2026-05-13).
 */
public class DefaultCaravanHubIntegrationClient implements CaravanHubIntegrationClient {

    private static final Logger log = LoggerFactory.getLogger(DefaultCaravanHubIntegrationClient.class);
    private static final String SEND_PATH = "/caravanHubApi/v1/send";

    private final RestClient restClient;
    private final CaravanHubClientProperties props;

    public DefaultCaravanHubIntegrationClient(RestClient restClient, CaravanHubClientProperties props) {
        this.restClient = restClient;
        this.props = props;
    }

    @Override
    public CaravanHubSendResult send(String topicId, String transactionCode, String interfaceMsg) {
        CaravanHubSendRequest body = new CaravanHubSendRequest(topicId, transactionCode, interfaceMsg);
        int maxAttempts = Math.max(1, props.getRetry().getMaxAttempts());
        long delayMs = Math.max(0, props.getRetry().getDelayMs());

        RestClientException lastException = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                CaravanHubSendResult result = restClient.post()
                        .uri(props.getBaseUrl() + SEND_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(CaravanHubSendResult.class);

                if (result == null) {
                    throw new CaravanHubIntegrationException("caravan-hub 응답 본문 null — topic: " + topicId);
                }
                if (attempt > 1) {
                    log.info("caravan-hub 호출 재시도 성공 - attempt={}/{}, topic={}, kafkaKeyData={}",
                            attempt, maxAttempts, topicId, result.kafkaKeyData());
                }
                return result;

            } catch (RestClientException e) {
                lastException = e;
                log.warn("caravan-hub 호출 실패 - attempt={}/{}, topic={}, msg={}",
                        attempt, maxAttempts, topicId, e.getMessage());
                if (attempt < maxAttempts && delayMs > 0) {
                    try {
                        Thread.sleep(delayMs);
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new CaravanHubIntegrationException("caravan-hub 호출 재시도 중 인터럽트", ie);
                    }
                }
            }
        }
        throw new CaravanHubIntegrationException(
                "caravan-hub 호출 실패 (max attempts=" + maxAttempts + ", topic=" + topicId + ")",
                lastException);
    }
}
