package com.dongkuk.caravan.console.dashboard;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.caravan.console.dashboard.dto.DashboardSummaryResponse;
import com.dongkuk.caravan.console.dashboard.dto.ProblemTopic;
import com.dongkuk.caravan.console.host.AppHostService;
import com.dongkuk.caravan.console.proxy.CaravanApiClient;
import com.dongkuk.caravan.console.topic.ConsoleTopicInfoEntity;
import com.dongkuk.caravan.console.topic.ConsoleTopicInfoJpaRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * ConsoleDashboardService — 큐막기(STATUS='ERROR') 집계·문제토픽 노출 검증 (감사 H-1).
 * caravan 의존은 mock, executor 는 동기(Runnable::run)로 병렬 분기를 단순화한다.
 */
class ConsoleDashboardServiceTest {

    private final AppHostService appHostService = mock(AppHostService.class);
    private final CaravanApiClient caravanApiClient = mock(CaravanApiClient.class);
    private final ConsoleTopicInfoJpaRepository topicRepo = mock(ConsoleTopicInfoJpaRepository.class);

    private ConsoleDashboardService service() {
        return new ConsoleDashboardService(appHostService, caravanApiClient, topicRepo, Runnable::run);
    }

    private static ConsoleTopicInfoEntity topic(String id, String biz, String useTp, String status) {
        return ConsoleTopicInfoEntity.builder()
                .topicId(id).bizSystem(biz).useTp(useTp).status(status).build();
    }

    private static Map<String, Object> status(String topicId, String containerStatus, long cur, long max) {
        return Map.of("TOPIC_ID", topicId, "CONTAINER_STATUS", containerStatus,
                "CURRENT_OFFSET", cur, "MAX_OFFSET", max);
    }

    @Test
    void errorTopicCount_counts_STATUS_ERROR_and_lists_as_problem() {
        when(appHostService.getHostUrlMap()).thenReturn(Map.of("HUB1", "http://h:8200"));
        when(topicRepo.findAll()).thenReturn(List.of(
                topic("T1", "HUB1", "Y", "RUNNING"),
                ConsoleTopicInfoEntity.builder().topicId("T2").bizSystem("HUB1").useTp("Y")
                        .status("ERROR").errorOffset(42L).lastErrorCode("MAX_RETRY_EXCEEDED")
                        .lastErrorMsg("타깃 다운").build(),
                topic("T3", "HUB1", "N", "RUNNING")));
        // 큐막기 토픽 T2 는 컨테이너상 PAUSED 로도 보고되지만(중복), ERROR 로만 노출되어야 한다.
        when(caravanApiClient.getStatus(eq("http://h:8200"), any())).thenReturn(List.of(
                status("T1", "RUNNING", 5, 5),
                status("T2", "PAUSED", 41, 50)));

        DashboardSummaryResponse res = service().summary();

        assertThat(res.getTotalTopicCount()).isEqualTo(3);
        assertThat(res.getActiveTopicCount()).isEqualTo(2);      // useTp=Y (T1,T2)
        assertThat(res.getErrorTopicCount()).isEqualTo(1);       // STATUS=ERROR (T2)

        // T2 는 ERROR 로 1건만(PAUSED/LAG 중복 없음), 원인코드·offset 포함
        List<ProblemTopic> t2 = res.getProblemTopics().stream()
                .filter(p -> "T2".equals(p.getTopicId())).toList();
        assertThat(t2).hasSize(1);
        assertThat(t2.get(0).getProblemType()).isEqualTo("ERROR");
        assertThat(t2.get(0).getCurrentOffset()).isEqualTo(42L);
        assertThat(t2.get(0).getDescription()).contains("MAX_RETRY_EXCEEDED").contains("타깃 다운");
    }

    @Test
    void no_error_topics_yields_zero_and_normal_problem_classification() {
        when(appHostService.getHostUrlMap()).thenReturn(Map.of("HUB1", "http://h:8200"));
        when(topicRepo.findAll()).thenReturn(List.of(topic("T1", "HUB1", "Y", "RUNNING")));
        // PAUSED 1건 + LAG 유발(cur<max, RUNNING)
        when(caravanApiClient.getStatus(eq("http://h:8200"), any())).thenReturn(List.of(
                status("T1", "PAUSED", 3, 3)));

        DashboardSummaryResponse res = service().summary();

        assertThat(res.getErrorTopicCount()).isZero();
        assertThat(res.getProblemTopics()).anyMatch(p -> "PAUSED".equals(p.getProblemType()));
    }
}
