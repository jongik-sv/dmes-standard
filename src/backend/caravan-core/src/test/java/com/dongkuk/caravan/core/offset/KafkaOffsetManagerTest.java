package com.dongkuk.caravan.core.offset;

import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.exception.KafkaOffsetException;
import com.dongkuk.caravan.core.service.KafkaGroupQueryService;
import com.dongkuk.caravan.core.service.TopicControlService;
import org.apache.kafka.clients.admin.*;
import org.apache.kafka.clients.consumer.OffsetAndMetadata;
import org.apache.kafka.common.KafkaFuture;
import org.apache.kafka.common.TopicPartition;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

import java.util.Collections;
import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * TC-OFS-001 ~ TC-OFS-006: KafkaOffsetManager 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class KafkaOffsetManagerTest {

    @Mock
    private AdminClient adminClient;

    @Mock
    private ContainerController containerController;

    @Mock
    private ListConsumerGroupOffsetsResult listOffsetsResult;

    @Mock
    private ListOffsetsResult listOffsetsResultAdmin;

    @Mock
    private AlterConsumerGroupOffsetsResult alterResult;

    @Mock
    private TopicControlService topicControlService;

    @Mock
    private KafkaGroupQueryService groupQueryService;

    @Mock
    private CaravanProperties properties;

    private KafkaOffsetManager offsetManager;

    @Before
    public void setUp() {
        offsetManager = new KafkaOffsetManager(adminClient, topicControlService, groupQueryService, properties);
    }

    @SuppressWarnings("unchecked")
    private void mockCurrentOffset(String groupId, String topic, long offset) throws Exception {
        TopicPartition tp = new TopicPartition(topic, 0);
        Map<TopicPartition, OffsetAndMetadata> offsets = new HashMap<>();
        offsets.put(tp, new OffsetAndMetadata(offset));

        when(adminClient.listConsumerGroupOffsets(groupId)).thenReturn(listOffsetsResult);
        KafkaFuture<Map<TopicPartition, OffsetAndMetadata>> future = KafkaFuture.completedFuture(offsets);
        when(listOffsetsResult.partitionsToOffsetAndMetadata()).thenReturn(future);
    }

    @SuppressWarnings("unchecked")
    private void mockCurrentOffsetNull(String groupId, String topic) throws Exception {
        TopicPartition tp = new TopicPartition(topic, 0);
        Map<TopicPartition, OffsetAndMetadata> offsets = new HashMap<>();
        // offset이 null인 경우 (커밋된 offset 없음)

        when(adminClient.listConsumerGroupOffsets(groupId)).thenReturn(listOffsetsResult);
        KafkaFuture<Map<TopicPartition, OffsetAndMetadata>> future = KafkaFuture.completedFuture(offsets);
        when(listOffsetsResult.partitionsToOffsetAndMetadata()).thenReturn(future);
    }

    @SuppressWarnings("unchecked")
    private void mockMaxOffset(String topic, long offset) throws Exception {
        TopicPartition tp = new TopicPartition(topic, 0);

        when(adminClient.listOffsets(anyMap())).thenReturn(listOffsetsResultAdmin);
        ListOffsetsResult.ListOffsetsResultInfo resultInfo = mock(ListOffsetsResult.ListOffsetsResultInfo.class);
        when(resultInfo.offset()).thenReturn(offset);
        KafkaFuture<ListOffsetsResult.ListOffsetsResultInfo> future = KafkaFuture.completedFuture(resultInfo);
        when(listOffsetsResultAdmin.partitionResult(any(TopicPartition.class))).thenReturn(future);
    }

    // TC-OFS-001: getCurrentOffset() - 커밋된 offset 존재
    @Test
    public void TC_OFS_001_getCurrentOffset_exists() throws Exception {
        mockCurrentOffset("my-group", "MMPPMERPTT01", 42);

        long offset = offsetManager.getCurrentOffset("my-group", "MMPPMERPTT01");

        assertEquals(42, offset);
    }

    // TC-OFS-002: getCurrentOffset() - 커밋된 offset 없음
    @Test
    public void TC_OFS_002_getCurrentOffset_notExists() throws Exception {
        mockCurrentOffsetNull("my-group", "MMPPMERPTT01");

        long offset = offsetManager.getCurrentOffset("my-group", "MMPPMERPTT01");

        assertEquals(0, offset);
    }

    // TC-OFS-003: getMaxOffset() - 정상 조회
    @Test
    public void TC_OFS_003_getMaxOffset() throws Exception {
        mockMaxOffset("MMPPMERPTT01", 150);

        long offset = offsetManager.getMaxOffset("MMPPMERPTT01");

        assertEquals(150, offset);
    }

    // TC-OFS-004: skipOffset() - 1건 스킵
    @Test
    public void TC_OFS_004_skipOffset_one() throws Exception {
        mockCurrentOffset("my-group", "T", 100);
        mockMaxOffset("T", 150);
        when(properties.getBizSystem()).thenReturn("DMES");
        when(groupQueryService.describe("my-group", "T"))
                .thenReturn(KafkaGroupQueryService.GroupInfo.builder().state("EMPTY").build());

        KafkaFuture<Void> voidFuture = KafkaFuture.completedFuture(null);
        when(adminClient.alterConsumerGroupOffsets(anyString(), anyMap())).thenReturn(alterResult);
        when(alterResult.all()).thenReturn(voidFuture);

        OffsetInfo info = offsetManager.skipOffset("listener-T", "my-group", "T", 1);

        // Phase 8 위임 검증 — STOP/RESUME 은 topicControlService (containerController 직접 제어 아님)
        verify(topicControlService).stop("T", "DMES");
        verify(topicControlService).resume("T", "DMES");

        assertEquals(100, info.getBeforeOffset());
        assertEquals(100, info.getAfterOffset());  // mock은 동일 값 반환
        assertEquals(150, info.getBeforeMaxOffset());
        assertEquals(150, info.getAfterMaxOffset());
        assertEquals(150, info.getMaxOffset());
    }

    // TC-OFS-005: skipOffset() - count가 남은 메시지보다 클 때
    @Test
    public void TC_OFS_005_skipOffset_exceedsMax() throws Exception {
        mockCurrentOffset("my-group", "T", 140);
        mockMaxOffset("T", 150);
        when(properties.getBizSystem()).thenReturn("DMES");
        when(groupQueryService.describe("my-group", "T"))
                .thenReturn(KafkaGroupQueryService.GroupInfo.builder().state("EMPTY").build());

        KafkaFuture<Void> voidFuture = KafkaFuture.completedFuture(null);
        when(adminClient.alterConsumerGroupOffsets(anyString(), anyMap())).thenReturn(alterResult);
        when(alterResult.all()).thenReturn(voidFuture);

        OffsetInfo info = offsetManager.skipOffset("listener-T", "my-group", "T", 100);

        assertEquals(140, info.getAfterOffset()); // mock은 동일 값 반환
        assertEquals(150, info.getBeforeMaxOffset());
        assertEquals(150, info.getAfterMaxOffset());
    }

    // TC-OFS-006: skipOffset() - AdminClient 실패
    @Test(expected = KafkaOffsetException.class)
    public void TC_OFS_006_skipOffset_adminClientFailure() throws Exception {
        when(properties.getBizSystem()).thenReturn("DMES");
        when(groupQueryService.describe("my-group", "T"))
                .thenReturn(KafkaGroupQueryService.GroupInfo.builder().state("EMPTY").build());
        when(adminClient.listConsumerGroupOffsets("my-group")).thenReturn(listOffsetsResult);
        KafkaFuture failedFuture = mock(KafkaFuture.class);
        when(failedFuture.get(anyLong(), any())).thenThrow(new java.util.concurrent.ExecutionException(
                new RuntimeException("Admin error")));
        when(listOffsetsResult.partitionsToOffsetAndMetadata()).thenReturn(failedFuture);

        try {
            offsetManager.skipOffset("listener-T", "my-group", "T", 1);
        } finally {
            // finally 에서 RESUME 은 항상 수행 (Phase 8 — topicControlService 위임)
            verify(topicControlService).resume("T", "DMES");
        }
    }
}
