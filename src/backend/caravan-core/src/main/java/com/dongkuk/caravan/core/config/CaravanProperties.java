package com.dongkuk.caravan.core.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import jakarta.validation.constraints.NotBlank;

/**
 * Caravan Kafka 설정 프로퍼티
 *
 * <p>{@code application.yml} 또는 {@code application.properties}에서
 * {@code caravan.kafka.*} 접두사로 설정을 바인딩합니다.</p>
 *
 * <h3>필수 설정</h3>
 * <pre>{@code
 * caravan:
 *   kafka:
 *     bootstrap-servers: localhost:9092
 *     biz-system: MY_SYSTEM
 * }</pre>
 *
 * <h3>전체 설정 예시</h3>
 * <pre>{@code
 * caravan:
 *   kafka:
 *     enabled: true
 *     bootstrap-servers: broker1:9092,broker2:9092
 *     biz-system: PRODUCTION
 *     replication-factor: 3
 *     producer:
 *       acks: all
 *       retries: 3
 *       timeout-seconds: 10
 *       idempotence: true
 *     consumer:
 *       enabled: true
 *       auto-offset-reset: earliest
 *       max-poll-records: 1
 *       concurrency: 1
 *     retry:
 *       max-attempts: 3
 *       delay-ms: 2000
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 */
@ConfigurationProperties(prefix = "caravan.kafka")
@Validated
@Data
public class CaravanProperties {

    /**
     * Kafka 활성화 여부
     */
    private boolean enabled = true;

    /**
     * Kafka 브로커 주소 (필수)
     * 예: localhost:9092, broker1:9092,broker2:9092
     */
    @NotBlank
    private String bootstrapServers;

    /**
     * 비즈니스 시스템 코드 (필수)
     * TB_CARAVAN_TOPICS.BIZ_SYSTEM 컬럼과 매칭
     */
    @NotBlank
    private String bizSystem;

    /**
     * 토픽 생성 시 복제 계수(replication factor). 기본 1(단일 브로커).
     *
     * <p>3브로커 클러스터에서 데이터 HA 를 받으려면 3 으로 설정한다(값은 브로커 수 이하여야 하며,
     * 초과 시 토픽 생성이 {@code InvalidReplicationFactorException} 으로 실패한다).
     * TopicSyncService(원본 + {@code {topic}.dlt}) 와 ControlTopicBootstrap({@code caravan.control})
     * 의 {@code NewTopic} 에 적용된다.</p>
     *
     * <p>기존 토픽에는 소급되지 않는다 — 값 변경 후 신규 생성 토픽부터 반영되며, 기존 토픽은
     * 재생성하거나 {@code kafka-reassign-partitions} 로 RF 를 상향한다.</p>
     */
    private short replicationFactor = 1;

    private Producer producer = new Producer();
    private Consumer consumer = new Consumer();
    private Retry retry = new Retry();

    @Data
    public static class Producer {
        /** ACK 설정 (all, 1, 0) */
        private String acks = "all";
        /** 재시도 횟수 */
        private int retries = 3;
        /** 브로커 응답 대기 시간 (초) */
        private int timeoutSeconds = 10;
        /** 멱등성 활성화 */
        private boolean idempotence = true;
        /** 순서 보장을 위한 in-flight 요청 제한 */
        private int maxInFlightRequests = 5;
    }

    @Data
    public static class Consumer {
        /** Consumer 활성화 여부 */
        private boolean enabled = true;
        /** 오프셋 없을 시 시작 위치 (earliest, latest) */
        private String autoOffsetReset = "earliest";
        /** 자동 커밋 비활성화 (수동 커밋 사용) */
        private boolean enableAutoCommit = false;
        /** poll당 처리할 최대 레코드 수 */
        private int maxPollRecords = 1;
        /** Poll 타임아웃 (ms) */
        private int pollTimeoutMs = 3000;
        /** 병렬 Consumer 수 */
        private int concurrency = 1;
    }

    @Data
    public static class Retry {
        /** 최대 재시도 횟수 */
        private int maxAttempts = 3;
        /** 재시도 간격 (ms) */
        private long delayMs = 2000;
    }

}
