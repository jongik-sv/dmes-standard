package com.dongkuk.caravan.console.dashboard;

import com.dongkuk.caravan.console.dashboard.dto.DashboardSummaryResponse;
import com.dongkuk.caravan.console.dashboard.dto.HostStatusSummary;
import com.dongkuk.caravan.console.dashboard.dto.ProblemTopic;
import com.dongkuk.caravan.console.host.AppHostService;
import com.dongkuk.caravan.console.proxy.CaravanApiClient;
import com.dongkuk.caravan.console.topic.ConsoleTopicInfoEntity;
import com.dongkuk.caravan.console.topic.ConsoleTopicInfoJpaRepository;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.Executor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

/**
 * 카프카 대시보드 서비스 — v3 재플랜.
 *
 * <p>v2 → v3 변경:</p>
 * <ul>
 *   <li>caravan {@code TopicInfoJpaRepository} / {@code KafkaGroupQueryService} 직접 호출 →
 *       {@link AppHostService} + {@link CaravanApiClient} ({@code /kafkaApi/status}) + caravan-console 자체
 *       {@link ConsoleTopicInfoJpaRepository} 로 분리.</li>
 *   <li>BIZ_SYSTEM 단위 그룹핑 → 호스트(BIZ_SYSTEM → URL 매핑) 단위 병렬 호출. 응답 일관성은
 *       caravan 측 DB SoT (KafkaStatusController.java:103) 가 보장.</li>
 *   <li>큐막기(ERROR) 카운트 — 실제 실패 신호는 {@code TB_CARAVAN_TOPICS.STATUS='ERROR'}(caravan {@code markError} 가 세팅)
 *       이므로 DB SoT 에서 직접 집계한다. (구 dltTopicCount=0 하드코딩은 비즈니스 포이즌이 DLT 에 도달하지 않아
 *       항상 0인 안전망 착시였으므로 폐기 — 감사 H-1.)</li>
 * </ul>
 *
 * <p>호스트 다운 시 fallback: alive=false + error 메시지로 그 호스트만 표시. 다른 호스트 응답은 그대로 집계.</p>
 */
@Service("dashboardService")
@Slf4j
public class ConsoleDashboardService {

    private final AppHostService appHostService;
    private final CaravanApiClient caravanApiClient;
    private final ConsoleTopicInfoJpaRepository consoleTopicInfoJpaRepository;
    private final Executor dashboardExecutor;

    public ConsoleDashboardService(AppHostService appHostService,
                               CaravanApiClient caravanApiClient,
                               ConsoleTopicInfoJpaRepository consoleTopicInfoJpaRepository,
                               @Qualifier("consoleDashboardExecutor") Executor dashboardExecutor) {
        this.appHostService = appHostService;
        this.caravanApiClient = caravanApiClient;
        this.consoleTopicInfoJpaRepository = consoleTopicInfoJpaRepository;
        this.dashboardExecutor = dashboardExecutor;
    }

    /** 조회 (BPMN action=summary) — 큐막기(ERROR) + 호스트 병렬 status + 문제토픽 분류 + 토픽 카운트 집계. 무파라미터. */
    public DashboardSummaryResponse summary() {
        // 1. 토픽 메타 SoT (caravan-console entity = caravan TB_CARAVAN_TOPICS read-only 매핑) — STATUS 포함
        List<ConsoleTopicInfoEntity> allTopics = consoleTopicInfoJpaRepository.findAll();

        // 2. 큐막기(ERROR) 토픽 — DB STATUS='ERROR' 가 SoT(caravan markError 세팅). 실제 실패 신호이므로
        //    원인 코드/메시지/offset 까지 문제토픽으로 노출한다(H-1: 가짜 DLT 카운트 대체).
        List<ConsoleTopicInfoEntity> errorTopics = allTopics.stream()
                .filter(t -> "ERROR".equalsIgnoreCase(t.getStatus()))
                .toList();
        Set<String> errorTopicKeys = new HashSet<>();
        ConcurrentLinkedQueue<ProblemTopic> problemTopics = new ConcurrentLinkedQueue<>();
        for (ConsoleTopicInfoEntity t : errorTopics) {
            errorTopicKeys.add(topicKey(t.getTopicId(), t.getBizSystem()));
            problemTopics.add(ProblemTopic.builder()
                    .topicId(t.getTopicId()).bizSystem(t.getBizSystem())
                    .problemType("ERROR").containerStatus("ERROR")
                    .currentOffset(t.getErrorOffset())
                    .description("큐막기 — " + nz(t.getLastErrorCode()) + ": " + nz(t.getLastErrorMsg()))
                    .build());
        }

        // 3. 호스트 매핑(BIZ_SYSTEM → URL) + 호스트별 병렬 status → PAUSED/LAG 수집.
        //    이미 ERROR 로 분류된 토픽은 중복 노출 방지 위해 PAUSED/LAG 에서 제외.
        Map<String, String> hostUrlMap = appHostService.getHostUrlMap();
        List<CompletableFuture<HostStatusSummary>> futures = hostUrlMap.entrySet().stream()
                .map(e -> CompletableFuture.supplyAsync(
                        () -> queryHostStatus(e.getKey(), e.getValue(), problemTopics, errorTopicKeys),
                        dashboardExecutor))
                .toList();
        List<HostStatusSummary> hosts = futures.stream().map(CompletableFuture::join).toList();

        // 4. 카운트
        int totalTopicCount = allTopics.size();
        int activeTopicCount = (int) allTopics.stream()
                .filter(t -> "Y".equals(t.getUseTp()))
                .count();
        int errorTopicCount = errorTopics.size();

        return DashboardSummaryResponse.builder()
                .hosts(hosts)
                .problemTopics(new ArrayList<>(problemTopics))
                .totalTopicCount(totalTopicCount)
                .activeTopicCount(activeTopicCount)
                .errorTopicCount(errorTopicCount)
                .build();
    }

    private static String topicKey(String topicId, String bizSystem) {
        return topicId + "|" + bizSystem;
    }

    private static String nz(String s) {
        return s == null ? "" : s;
    }

    private HostStatusSummary queryHostStatus(String bizSystem, String hostUrl,
                                               ConcurrentLinkedQueue<ProblemTopic> problemTopics,
                                               Set<String> errorTopicKeys) {
        long t0 = System.currentTimeMillis();
        try {
            List<Map<String, Object>> statusList = caravanApiClient.getStatus(hostUrl, null);
            long elapsed = System.currentTimeMillis() - t0;

            if (statusList == null) {
                return HostStatusSummary.builder()
                        .bizSystem(bizSystem).hostUrl(hostUrl)
                        .alive(false).responseTimeMs(elapsed)
                        .error("상태 조회 응답 없음").build();
            }

            int runningCount = 0, pausedCount = 0, stoppedCount = 0, notExistsCount = 0;

            for (Map<String, Object> status : statusList) {
                String containerStatus = normalizeStatus(
                        String.valueOf(status.getOrDefault("CONTAINER_STATUS", "UNKNOWN")));
                String topicId = (String) status.get("TOPIC_ID");
                long currentOffset = toLong(status.get("CURRENT_OFFSET"));
                long maxOffset = toLong(status.get("MAX_OFFSET"));
                // 이미 큐막기(ERROR)로 분류된 토픽은 PAUSED/LAG 중복 노출하지 않음(ERROR 가 더 구체적).
                boolean alreadyError = errorTopicKeys.contains(topicKey(topicId, bizSystem));

                switch (containerStatus) {
                    case "RUNNING" -> runningCount++;
                    case "PAUSED" -> pausedCount++;
                    case "STOPPED" -> stoppedCount++;
                    case "NOT_EXISTS" -> notExistsCount++;
                    default -> {}
                }

                // PAUSED 문제 토픽
                if ("PAUSED".equals(containerStatus) && !alreadyError) {
                    problemTopics.add(ProblemTopic.builder()
                            .topicId(topicId).bizSystem(bizSystem)
                            .problemType("PAUSED").containerStatus(containerStatus)
                            .currentOffset(currentOffset).maxOffset(maxOffset)
                            .lag(maxOffset - currentOffset)
                            .description("컨슈머가 일시정지 상태입니다")
                            .build());
                }
                // LAG 문제 토픽 (currentOffset < maxOffset && PAUSED/ERROR 아닌 경우)
                if (currentOffset < maxOffset && !"PAUSED".equals(containerStatus) && !alreadyError) {
                    long lag = maxOffset - currentOffset;
                    problemTopics.add(ProblemTopic.builder()
                            .topicId(topicId).bizSystem(bizSystem)
                            .problemType("LAG").containerStatus(containerStatus)
                            .currentOffset(currentOffset).maxOffset(maxOffset)
                            .lag(lag)
                            .description("처리 지연 " + lag + "건")
                            .build());
                }
            }

            return HostStatusSummary.builder()
                    .bizSystem(bizSystem).hostUrl(hostUrl)
                    .alive(true).responseTimeMs(elapsed)
                    .runningCount(runningCount)
                    .pausedCount(pausedCount)
                    .stoppedCount(stoppedCount)
                    .notExistsCount(notExistsCount)
                    .build();

        } catch (Exception e) {
            long elapsed = System.currentTimeMillis() - t0;
            log.error("호스트 상태 조회 실패 - bizSystem={}, hostUrl={}", bizSystem, hostUrl, e);
            return HostStatusSummary.builder()
                    .bizSystem(bizSystem).hostUrl(hostUrl)
                    .alive(false).responseTimeMs(elapsed)
                    .error(e.getMessage()).build();
        }
    }

    private String normalizeStatus(String status) {
        if (status == null) return "UNKNOWN";
        return switch (status.toUpperCase()) {
            case "RUN", "RUNNING" -> "RUNNING";
            case "PAUSE", "PAUSED" -> "PAUSED";
            case "STOP", "STOPPED" -> "STOPPED";
            case "NOT_EXISTS" -> "NOT_EXISTS";
            default -> "UNKNOWN";
        };
    }

    private long toLong(Object value) {
        if (value == null) return 0L;
        if (value instanceof Number n) return n.longValue();
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
