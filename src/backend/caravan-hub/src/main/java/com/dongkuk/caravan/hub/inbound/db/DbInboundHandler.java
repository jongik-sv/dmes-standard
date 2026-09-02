package com.dongkuk.caravan.hub.inbound.db;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.hub.config.CaravanHubProperties;
import com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper;
import com.dongkuk.caravan.hub.mapper.InterfaceMapper;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

/**
 * DB INBOUND 폴 처리 핸들러 (구 {@code DbPollingService} 로직 이식).
 *
 * <p>Camel timer 라우트({@code inbound-db-<topic>})가 주기마다 {@link #pollAndSend(String, String)} 를 호출한다.
 * 폴 스케줄링/생명주기는 {@link DbInboundRouteManager} 가 CamelContext 로 관리하고, 본 핸들러는
 * 검증된 MyBatis SQL(낙관락 {@code updateSuccess}/{@code updateError})을 그대로 유지한다(D7).</p>
 *
 * <h3>큐막기(자동 스킵 금지) — 소비측 대칭</h3>
 * <p>발행이 재시도({@code inbound.db.max-attempts}) 후에도 실패하면 해당 행을 {@code IF_FLAG='E'} 로
 * 마킹하고, 이후 폴에서 <b>가장 오래된(head) 행이 {@code 'E'} 이면 그 뒤를 처리하지 않고 정지(큐막기)</b>한다.
 * 폴 타이머는 계속 돌므로, 운영자가 {@code IF_FLAG} 를 {@code N}/{@code null} 로 바꾸면 재시도되고,
 * {@code Y} 로 바꾸면 스킵되어 자동 재개된다. 시스템이 임의로 스킵하는 경로는 없다.</p>
 *
 * <p>처리 순서: 테이블명 검증 → {@code IF_FLAG IN(N,null,E)} 조회({@code ORDER BY C_AT ASC}) →
 * 오래된 순으로 훑기(head='E' 면 큐막기) → {@code N/null} 은 재시도 발행 →
 * 성공 {@code 'Y'}(+IF_DATE/IF_TIME) / 재시도 소진 {@code 'E'} + 큐막기.</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DbInboundHandler {

    private final KafkaMessageProducer kafkaMessageProducer;
    private final CaravanHubConfigMapper configMapper;
    private final InterfaceMapper interfaceMapper;
    private final CaravanHubProperties properties;
    private final AlertNotifier alertNotifier;
    private final CaravanProperties caravanProperties;

    /** 큐막기 상태인 토픽 (로그/상태 전이 1회만 알리기 위한 in-memory 추적). */
    private final Set<String> blockedTopics = ConcurrentHashMap.newKeySet();

    /**
     * 특정 테이블의 미처리 메시지를 폴링하여 Kafka 로 발행한다.
     *
     * @param topicId   Kafka 토픽 ID
     * @param tableName 인터페이스 테이블명({@code schema.table})
     */
    public void pollAndSend(String topicId, String tableName) {
        try {
            String[] parts = tableName.split("\\.", 2);
            String schema = parts.length > 1 ? parts[0] : "";
            String table = parts.length > 1 ? parts[1] : parts[0];
            if (configMapper.isValidTableName(schema, table) <= 0) {
                log.warn("유효하지 않은 테이블명 - tableName: {}", tableName);
                return;
            }

            int batchSize = properties.getInbound().getDb().getBatchSize();
            List<Map<String, Object>> rows = interfaceMapper.selectPendingMessages(tableName);
            if (rows == null || rows.isEmpty()) {
                clearBlocked(topicId);
                return;
            }

            int processed = 0;
            for (Map<String, Object> row : rows) {
                // head(가장 오래된) 가 'E' → 큐막기: 운영자 개입 전까지 정지, 이후 행 미처리(FIFO 보존).
                if ("E".equals(getString(row, "IF_FLAG"))) {
                    markBlocked(topicId, tableName, row);
                    return;
                }
                // 'N'/null → 재시도 발행. 실패(소진) 시 'E' 마킹 후 큐막기.
                if (!sendWithRetry(topicId, tableName, row)) {
                    markBlocked(topicId, tableName, row);
                    return;
                }
                if (++processed >= batchSize) {
                    break;
                }
            }
            // 'E' 없이 처리 완료 → 큐막기 해제
            clearBlocked(topicId);
        } catch (Exception e) {
            log.error("Polling 실패 - Topic: {}, Table: {}", topicId, tableName, e);
        }
    }

    /**
     * 한 행을 재시도와 함께 Kafka 로 발행한다. 재시도 소진 시 {@code IF_FLAG='E'} 로 마킹한다.
     *
     * @return 발행+상태전이 성공이면 {@code true}, 재시도 소진('E' 마킹)이면 {@code false}
     */
    private boolean sendWithRetry(String topicId, String tableName, Map<String, Object> row) {
        int maxAttempts = Math.max(1, properties.getInbound().getDb().getMaxAttempts());
        long delayMs = Math.max(0, properties.getInbound().getDb().getRetryDelayMs());
        String tc = getString(row, "TRANSACTION_CODE");
        String interfaceMsg = getString(row, "INTERFACE_MSG");

        Exception last = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                kafkaMessageProducer.send(topicId, tc, interfaceMsg);
                int updated = updateIfFlag(tableName, row, "Y");
                if (updated == 0) {
                    // 발행은 됐으나 낙관락 갱신 0행 — 다른 인스턴스 선점 또는 U_AT/플래그 변경. 중복 발행 가능.
                    log.warn("[{}] 발행 성공했으나 IF_FLAG='Y' 갱신 0행 (선점/변경) — 중복 발행 가능", tc);
                }
                log.debug("Kafka 발행 성공 - Topic: {}, TC: {}", topicId, tc);
                return true;
            } catch (Exception e) {
                last = e;
                log.warn("[{}] Kafka 발행 실패 ({}/{}): {}", tc, attempt, maxAttempts, e.getMessage());
                if (attempt < maxAttempts && delayMs > 0) {
                    sleep(delayMs);
                }
            }
        }

        // 재시도 소진 → 'E' 마킹 (큐막기)
        int updated = updateIfFlag(tableName, row, "E");
        if (updated == 0) {
            log.error("[{}] IF_FLAG='E' 마킹 0행 (선점/변경) — 다음 폴에 재평가됨", tc);
        }
        log.error("[{}] 발행 재시도 소진({}) → IF_FLAG='E' (인바운드 큐막기)", tc, maxAttempts, last);
        return false;
    }

    /**
     * IF_FLAG 갱신. {@code (TRANSACTION_CODE, U_AT)} PK + 미처리(N/null) 가드로 정확히 1행 전이한다.
     *
     * @return 갱신된 행 수 (0이면 선점/플래그 변경으로 미전이)
     */
    private int updateIfFlag(String tableName, Map<String, Object> row, String flag) {
        LocalDateTime now = LocalDateTime.now();
        String ifDate = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String ifTime = LocalTime.now().format(DateTimeFormatter.ofPattern("HHmmss"));
        Object updatedAt = row.get("U_AT");
        String transactionCode = getString(row, "TRANSACTION_CODE");

        return "Y".equals(flag)
                ? interfaceMapper.updateSuccess(tableName, updatedAt, transactionCode, ifDate, ifTime, now)
                : interfaceMapper.updateError(tableName, updatedAt, transactionCode, ifDate, ifTime, now);
    }

    /** 큐막기 진입 알림 (상태 전이 시 1회만 — 폴 스팸 방지). 전이 시 운영자 SMS 알림도 1회 발송. */
    private void markBlocked(String topicId, String tableName, Map<String, Object> row) {
        if (blockedTopics.add(topicId)) {
            String tc = getString(row, "TRANSACTION_CODE");
            log.error("[{}] 인바운드 큐막기 — IF_FLAG='E' 감지. 운영자 개입 필요"
                            + " (N/null→재시도, Y→스킵). Table: {}, TC: {}",
                    topicId, tableName, tc);
            // 폴링은 계속되나 알림은 전이 1회만(blockedTopics 로 dedup) — 운영자 개입 요청.
            safeAlert(AlertEvent.inboundBlocked(caravanProperties.getBizSystem(), topicId, tableName,
                    tc, "DB 인바운드 발행 재시도 소진(IF_FLAG='E')"));
        }
    }

    /** 알림 발송(never-throw) — 알림 실패가 폴링을 막지 않도록 예외를 삼킨다. */
    private void safeAlert(AlertEvent event) {
        try {
            alertNotifier.send(event);
        } catch (Exception e) {
            log.warn("[ALERT] 인바운드 알림 발송 실패: {}", e.getMessage());
        }
    }

    /** 큐막기 해제 알림 (이전에 막혀 있었을 때만 1회). */
    private void clearBlocked(String topicId) {
        if (blockedTopics.remove(topicId)) {
            log.info("[{}] 인바운드 큐막기 해제 — 폴링 정상 재개", topicId);
        }
    }

    private String getString(Map<String, Object> map, String key) {
        Object value = map.get(key);
        return value != null ? value.toString() : "";
    }

    private void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
