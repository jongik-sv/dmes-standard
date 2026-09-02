package com.dongkuk.caravan.console.caravanhub;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * caravan-console caravan-hub 통합 클라이언트 설정 프로퍼티 (0.2.0 신규 — cactus 의존 제거 패턴 B).
 *
 * <pre>
 * console:
 * caravan-hub:
 *     enabled: true
 *     base-url: http://localhost:8200
 *     connect-timeout-ms: 5000
 *     read-timeout-ms: 10000
 *     retry:
 *       max-attempts: 3
 *       delay-ms: 1000
 *     auth:
 *       client-key: dmes-bff-local-client-key-2026
 * </pre>
 */
@ConfigurationProperties(prefix = "caravan-console.caravanhub")
public class ConsoleCaravanHubProperties {

    private boolean enabled = true;
    private String baseUrl = "http://localhost:8200";
    private int connectTimeoutMs = 5000;
    private int readTimeoutMs = 10000;
    private final Retry retry = new Retry();
    private final Auth auth = new Auth();

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }

    public int getConnectTimeoutMs() { return connectTimeoutMs; }
    public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }

    public int getReadTimeoutMs() { return readTimeoutMs; }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }

    public Retry getRetry() { return retry; }
    public Auth getAuth() { return auth; }

    public static class Retry {
        private int maxAttempts = 3;
        private long delayMs = 1000;

        public int getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }

        public long getDelayMs() { return delayMs; }
        public void setDelayMs(long delayMs) { this.delayMs = delayMs; }
    }

    public static class Auth {
        private String clientKey;

        public String getClientKey() { return clientKey; }
        public void setClientKey(String clientKey) { this.clientKey = clientKey; }
    }
}
