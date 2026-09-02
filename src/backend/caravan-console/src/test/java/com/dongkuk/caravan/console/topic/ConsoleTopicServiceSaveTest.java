package com.dongkuk.caravan.console.topic;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.caravan.console.caravanhub.ConsoleCaravanHubClient;
import com.dongkuk.caravan.console.consumer.ConsoleConsumerControlService;
import com.dongkuk.caravan.console.host.AppHostService;
import com.dongkuk.caravan.console.message.ConsoleMessageService;
import com.dongkuk.caravan.console.proxy.CaravanApiClient;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

/**
 * {@link ConsoleTopicService#saveTopics(List)} — rowStatus C/U/D fan-out 회귀 방지.
 *
 * <p>2026-07-09 Q-001 해제: save 액션 활성 — C=createTopic / U=updateTopic(PUT, DB 메타만) / D=deleteTopic.
 * 행 키는 가이드 표준 {@code rowStatus} (구 {@code _rowStatus} 아님).</p>
 */
class ConsoleTopicServiceSaveTest {

    private CaravanApiClient caravanApiClient;
    private AppHostService appHostService;
    private ConsoleTopicService service;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        caravanApiClient = mock(CaravanApiClient.class);
        appHostService = mock(AppHostService.class);
        service = new ConsoleTopicService(
                mock(ConsoleTopicInfoJpaRepository.class),
                appHostService,
                caravanApiClient,
                mock(ConsoleConsumerControlService.class),
                mock(ConsoleMessageService.class),
                (ObjectProvider<ConsoleCaravanHubClient>) mock(ObjectProvider.class));
        when(appHostService.getHostUrl(anyString())).thenReturn("http://host-a:8080");
    }

    private static Map<String, Object> row(String rowStatus, String topicId, String bizSystem) {
        Map<String, Object> m = new HashMap<>();
        m.put("rowStatus", rowStatus);
        m.put("topicId", topicId);
        m.put("bizSystem", bizSystem);
        m.put("topicDesc", "설명");
        m.put("groupId", "g1");
        m.put("sendModuleId", "MPP");
        m.put("recvModuleId", "MERP");
        m.put("useYn", "Y");
        return m;
    }

    @Test
    void saveTopics_C_는_createTopic_fanout_및_useYn을_useTp로_매핑한다() {
        int cnt = service.saveTopics(List.of(row("C", "T1", "hub")));

        assertThat(cnt).isEqualTo(1);
        @SuppressWarnings("unchecked")
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass(Map.class);
        verify(caravanApiClient).createTopic(eq("http://host-a:8080"), captor.capture());
        assertThat(captor.getValue()).containsEntry("topicId", "T1").containsEntry("useTp", "Y");
        verify(caravanApiClient, never()).updateTopic(anyString(), anyMap());
        verify(caravanApiClient, never()).deleteTopic(anyString(), anyString(), anyString());
    }

    @Test
    void saveTopics_U_는_updateTopic_PUT_fanout_한다() {
        int cnt = service.saveTopics(List.of(row("U", "T1", "hub")));

        assertThat(cnt).isEqualTo(1);
        verify(caravanApiClient).updateTopic(eq("http://host-a:8080"), anyMap());
        verify(caravanApiClient, never()).createTopic(anyString(), anyMap());
    }

    @Test
    void saveTopics_D_는_deleteTopic_fanout_한다() {
        int cnt = service.saveTopics(List.of(row("D", "T1", "hub")));

        assertThat(cnt).isEqualTo(1);
        verify(caravanApiClient).deleteTopic("http://host-a:8080", "T1", "hub");
    }

    @Test
    void saveTopics_rowStatus_없거나_미지정은_skip_하고_건수에_안_센다() {
        Map<String, Object> noStatus = row("C", "T9", "hub");
        noStatus.remove("rowStatus");

        int cnt = service.saveTopics(List.of(noStatus, row("X", "T8", "hub")));

        assertThat(cnt).isZero();
        verify(caravanApiClient, never()).createTopic(anyString(), anyMap());
        verify(caravanApiClient, never()).updateTopic(anyString(), anyMap());
        verify(caravanApiClient, never()).deleteTopic(anyString(), anyString(), anyString());
    }

    @Test
    void saveTopics_null_은_0건() {
        assertThat(service.saveTopics(null)).isZero();
    }
}
