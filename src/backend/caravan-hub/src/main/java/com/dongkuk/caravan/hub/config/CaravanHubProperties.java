package com.dongkuk.caravan.hub.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * caravan-hub 애플리케이션 설정 프로퍼티.
 *
 * <p>{@code application.yml}의 {@code caravan-hub.*} 설정을 자바 객체로 바인딩한다.</p>
 *
 * <pre>{@code
 * caravan-hub:
 *   inbound:
 *     db:
 *       enabled: true
 *       thread-pool-size: 10
 *       batch-size: 100
 *     file:
 *       enabled: true
 *       thread-pool-size: 5
 *   outbound:
 *     http:
 *       connect-timeout: 10000
 *       read-timeout: 30000
 * }</pre>
 *
 * @see com.dongkuk.caravan.hub.inbound.db.DbInboundRouteManager
 * @see com.dongkuk.caravan.hub.inbound.file.FileInboundRouteManager
 * @see com.dongkuk.caravan.hub.outbound.http.HttpOutboundHandler
 */
@Data
@Component
@ConfigurationProperties(prefix = "caravan-hub")
public class CaravanHubProperties {

    /** INBOUND(외부→Kafka) 관련 설정 */
    private Inbound inbound = new Inbound();

    /** OUTBOUND(Kafka→외부) 관련 설정 */
    private Outbound outbound = new Outbound();

    /**
     * INBOUND 설정.
     *
     * <p>DB 폴링과 FILE(SFTP) 폴링 관련 설정을 포함한다.</p>
     */
    @Data
    public static class Inbound {
        /** DB 폴링 설정 */
        private Db db = new Db();
        /** FILE(SFTP) 폴링 설정 */
        private File file = new File();

        /**
         * DB INBOUND 폴링 설정.
         *
         * <p>{@link com.dongkuk.caravan.hub.inbound.db.DbInboundRouteManager}와
         * {@link com.dongkuk.caravan.hub.inbound.db.DbInboundHandler}에서 사용한다.</p>
         */
        @Data
        public static class Db {
            /** DB 폴링 활성화 여부 (기본값: {@code true}) */
            private boolean enabled = true;
            /** {@code ScheduledExecutorService} 스레드 풀 크기 (기본값: 10) */
            private int threadPoolSize = 10;
            /** 1회 조회 건수, {@code FETCH FIRST N ROWS ONLY} (기본값: 100) */
            private int batchSize = 100;
            /**
             * Kafka 발행 재시도 횟수 (기본값: 3). 소진 시 {@code IF_FLAG='E'} 로 마킹하고
             * 해당 토픽 폴링을 큐막기(운영자 개입 전까지 정지)한다.
             */
            private int maxAttempts = 3;
            /** 발행 재시도 간격 (ms, 기본값: 2000) */
            private long retryDelayMs = 2000;
        }

        /**
         * FILE(SFTP) INBOUND 폴링 설정.
         *
         * <p>{@link com.dongkuk.caravan.hub.inbound.file.FileInboundRouteManager}에서 사용한다.</p>
         */
        @Data
        public static class File {
            /** FILE 폴링 활성화 여부 (기본값: {@code true}) */
            private boolean enabled = true;
            /** {@code ScheduledExecutorService} 스레드 풀 크기 (기본값: 5) */
            private int threadPoolSize = 5;
        }
    }

    /**
     * OUTBOUND 설정.
     *
     * <p>HTTP OUTBOUND 전송 관련 설정을 포함한다.</p>
     */
    @Data
    public static class Outbound {
        /** HTTP OUTBOUND 설정 */
        private Http http = new Http();

        /**
         * HTTP OUTBOUND 전송 설정.
         *
         * <p>{@link com.dongkuk.caravan.hub.outbound.http.HttpOutboundHandler}에서 사용한다.</p>
         */
        @Data
        public static class Http {
            /** HTTP 연결 타임아웃 (ms, 기본값: 10000) */
            private int connectTimeout = 10000;
            /** HTTP 읽기 타임아웃 (ms, 기본값: 30000) */
            private int readTimeout = 30000;
        }
    }
}
