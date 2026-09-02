package com.dongkuk.dmes.cactus.integration.caravanhub;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * caravan-hub 통합 클라이언트 설정 프로퍼티. application.yml 의 {@code cactus.caravan-hub.*} 바인딩.
 *
 * <pre>
 * cactus:
 *   caravan-hub:
 *     enabled: true                              # AutoConfiguration 활성 (default true)
 *     base-url: http://localhost:8200            # caravan-hub LB VIP base URL
 *     connect-timeout-ms: 5000
 *     read-timeout-ms: 10000
 *     retry:
 *       max-attempts: 3
 *       delay-ms: 1000
 *     auth:
 *       client-key: dmes-bff-local-client-key-2026
 * </pre>
 *
 * <p>v4 caravan-hub-EAI 마이그레이션 Phase 4-A (2026-05-13).
 */
@ConfigurationProperties(prefix = "cactus.caravan-hub")
public class CaravanHubClientProperties {

    /** AutoConfiguration 활성 여부 (기본 true). */
    private boolean enabled = true;

    /** caravan-hub LB VIP base URL. 예: {@code http://localhost:8200} (local) / {@code http://caravan-hub-vip.internal:8200} (운영). */
    private String baseUrl = "http://localhost:8200";

    /** HTTP connect timeout (ms). 기본 5000. */
    private int connectTimeoutMs = 5000;

    /** HTTP read timeout (ms). 기본 10000. */
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

    /** 재시도 정책. */
    public static class Retry {
        /** 최대 시도 횟수 (initial attempt 포함). 기본 3. */
        private int maxAttempts = 3;
        /** 재시도 간 대기 (ms). 기본 1000. */
        private long delayMs = 1000;

        public int getMaxAttempts() { return maxAttempts; }
        public void setMaxAttempts(int maxAttempts) { this.maxAttempts = maxAttempts; }

        public long getDelayMs() { return delayMs; }
        public void setDelayMs(long delayMs) { this.delayMs = delayMs; }
    }

    /** 인증 헤더 설정. */
    public static class Auth {
        /** {@code X-Client-Key} 헤더 값 (cactus 4 헤더 표준). yml 에서 명시 또는 환경변수. */
        private String clientKey;

        public String getClientKey() { return clientKey; }
        public void setClientKey(String clientKey) { this.clientKey = clientKey; }
    }
}
