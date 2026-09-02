package com.dongkuk.caravan.console.caravanhub;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * {@link ConsoleCaravanHubClient} 의 RestClient 기반 기본 구현 (0.2.0 신규 — cactus 의존 제거 패턴 B).
 */
public class DefaultConsoleCaravanHubClient implements ConsoleCaravanHubClient {

    private static final Logger log = LoggerFactory.getLogger(DefaultConsoleCaravanHubClient.class);
    private static final String SEND_PATH = "/caravanHubApi/v1/send";

    private final RestClient restClient;
    private final ConsoleCaravanHubProperties props;

    public DefaultConsoleCaravanHubClient(RestClient restClient, ConsoleCaravanHubProperties props) {
        this.restClient = restClient;
        this.props = props;
    }

    @Override
    public ConsoleCaravanHubSendResult send(String topicId, String transactionCode, String interfaceMsg) {
        ConsoleCaravanHubSendRequest body = new ConsoleCaravanHubSendRequest(topicId, transactionCode, interfaceMsg);
        int maxAttempts = Math.max(1, props.getRetry().getMaxAttempts());
        long delayMs = Math.max(0, props.getRetry().getDelayMs());

        RestClientException lastException = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                ConsoleCaravanHubSendResult result = restClient.post()
                        .uri(props.getBaseUrl() + SEND_PATH)
                        .contentType(MediaType.APPLICATION_JSON)
                        .accept(MediaType.APPLICATION_JSON)
                        .body(body)
                        .retrieve()
                        .body(ConsoleCaravanHubSendResult.class);

                if (result == null) {
                    throw new ConsoleCaravanHubException("caravan-hub 응답 본문 null — topic: " + topicId);
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
                        throw new ConsoleCaravanHubException("caravan-hub 호출 재시도 중 인터럽트", ie);
                    }
                }
            }
        }
        throw new ConsoleCaravanHubException(
                "caravan-hub 호출 실패 (max attempts=" + maxAttempts + ", topic=" + topicId + ")",
                lastException);
    }
}
