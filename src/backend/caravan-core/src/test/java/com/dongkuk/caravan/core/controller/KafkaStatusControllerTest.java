package com.dongkuk.caravan.core.controller;

import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.container.ContainerStatus;
import com.dongkuk.caravan.core.entity.TopicInfoEntity;
import com.dongkuk.caravan.core.model.BrowseResult;
import com.dongkuk.caravan.core.model.TopicInfo;
import com.dongkuk.caravan.core.offset.KafkaOffsetManager;
import com.dongkuk.caravan.core.offset.MessageBrowser;
import com.dongkuk.caravan.core.offset.OffsetInfo;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.repository.KafkaTopicRepository;
import com.dongkuk.caravan.core.service.KafkaGroupQueryService;
import com.dongkuk.caravan.core.service.TopicControlService;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.*;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * TC-API-001 ~ TC-API-015: KafkaStatusController MockMvc 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class KafkaStatusControllerTest {

    @Mock
    private ContainerController containerController;

    @Mock
    private KafkaOffsetManager offsetManager;

    @Mock
    private MessageBrowser messageBrowser;

    @Mock
    private KafkaTopicRepository topicRepository;

    @Mock
    private KafkaGroupQueryService groupQueryService;

    @Mock
    private TopicControlService topicControlService;

    @Mock
    private CaravanProperties properties;

    private MockMvc mockMvc;

    @Before
    public void setUp() {
        KafkaStatusController controller = new KafkaStatusController(
                containerController, offsetManager, messageBrowser, topicRepository,
                groupQueryService, topicControlService, properties);
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    // ==================== GET /kafkaApi/status ====================

    // TC-API-001: 전체 토픽 상태 조회
    @Test
    public void TC_API_001_getStatus() throws Exception {
        TopicInfoEntity entity = TopicInfoEntity.builder()
                .topicId("T1").topicDesc("테스트 토픽").groupId("G1").bizSystem("DMES")
                .useTp("Y").status("RUNNING").build();
        when(topicRepository.getTopicEntities(null, null, null))
                .thenReturn(Collections.singletonList(entity));
        when(groupQueryService.describe("G1", "T1"))
                .thenReturn(KafkaGroupQueryService.GroupInfo.builder()
                        .state("STABLE").members(1).currentOffset(100).maxOffset(150).lag(50).build());

        mockMvc.perform(get("/kafkaApi/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].TOPIC_ID", is("T1")))
                .andExpect(jsonPath("$[0].CONTAINER_STATUS", is("RUNNING")))
                .andExpect(jsonPath("$[0].CURRENT_OFFSET", is(100)))
                .andExpect(jsonPath("$[0].MAX_OFFSET", is(150)));
    }

    // TC-API-002: topicId 필터로 상태 조회
    @Test
    public void TC_API_002_getStatus_filter() throws Exception {
        when(topicRepository.getTopicEntities("MMP", null, null))
                .thenReturn(Collections.emptyList());

        mockMvc.perform(get("/kafkaApi/status").param("topicId", "MMP"))
                .andExpect(status().isOk());

        verify(topicRepository, times(1)).getTopicEntities("MMP", null, null);
    }

    // TC-API-003: 토픽 없을 때 빈 배열 반환
    @Test
    public void TC_API_003_getStatus_empty() throws Exception {
        when(topicRepository.getTopicEntities(null, null, null))
                .thenReturn(Collections.emptyList());

        mockMvc.perform(get("/kafkaApi/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(0)));
    }

    // ==================== POST /kafkaApi/pause ====================

    // TC-API-004: 컨테이너 일시정지
    @Test
    public void TC_API_004_pause() throws Exception {
        when(containerController.getStatus("listener-MMPPMERPTT01")).thenReturn(ContainerStatus.PAUSED);
        when(properties.getBizSystem()).thenReturn("DMES");

        mockMvc.perform(post("/kafkaApi/pause")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"MMPPMERPTT01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action", is("PAUSE")));

        verify(topicControlService, times(1)).pause("MMPPMERPTT01", "DMES");
    }

    // ==================== POST /kafkaApi/resume ====================

    // TC-API-005: 컨테이너 재개
    @Test
    public void TC_API_005_resume() throws Exception {
        when(containerController.getStatus("listener-MMPPMERPTT01")).thenReturn(ContainerStatus.RUNNING);
        when(properties.getBizSystem()).thenReturn("DMES");

        mockMvc.perform(post("/kafkaApi/resume")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"MMPPMERPTT01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action", is("RESUME")));

        verify(topicControlService, times(1)).resume("MMPPMERPTT01", "DMES");
    }

    // ==================== POST /kafkaApi/stop ====================

    // TC-API-006: 컨테이너 정지
    @Test
    public void TC_API_006_stop() throws Exception {
        when(containerController.getStatus("listener-MMPPMERPTT01")).thenReturn(ContainerStatus.STOPPED);
        when(properties.getBizSystem()).thenReturn("DMES");

        mockMvc.perform(post("/kafkaApi/stop")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"MMPPMERPTT01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action", is("STOP")));

        verify(topicControlService, times(1)).stop("MMPPMERPTT01", "DMES");
    }

    // ==================== POST /kafkaApi/startConsumer (Phase 6-ext broadcast) ====================
    // Phase 6-ext: pause/resume/stop 와 동일한 broadcast 패턴 — 컨트롤러는 topicControlService.start 만 호출.
    // 실제 컨테이너 처리(create/start/resume)는 ControlTopicListener.ensureStarted 의 책임.

    // TC-API-007: startConsumer → topicControlService.start broadcast (컨테이너 STOPPED 케이스)
    @Test
    public void TC_API_007_startConsumer_broadcastsStart_stopped() throws Exception {
        when(containerController.getStatus("listener-MMPPMERPTT01")).thenReturn(ContainerStatus.STOPPED);
        when(properties.getBizSystem()).thenReturn("DMES");

        mockMvc.perform(post("/kafkaApi/startConsumer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"MMPPMERPTT01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action", is("START")));

        verify(topicControlService, times(1)).start("MMPPMERPTT01", "DMES");
    }

    // TC-API-008: startConsumer → broadcast (컨테이너 RUNNING 케이스, 컨트롤러는 상태 검증 없이 위임)
    @Test
    public void TC_API_008_startConsumer_broadcastsStart_alreadyRunning() throws Exception {
        when(containerController.getStatus("listener-MMPPMERPTT01")).thenReturn(ContainerStatus.RUNNING);
        when(properties.getBizSystem()).thenReturn("DMES");

        mockMvc.perform(post("/kafkaApi/startConsumer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"MMPPMERPTT01\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action", is("START")));

        verify(topicControlService, times(1)).start("MMPPMERPTT01", "DMES");
        // 컨트롤러는 containerController.start 직접 호출 안 함 (listener.ensureStarted 책임)
        verify(containerController, never()).start(anyString());
    }

    // TC-API-009: startConsumer → broadcast (미등록 토픽 케이스, listener.ensureStarted 가 createConsumer 호출)
    @Test
    public void TC_API_009_startConsumer_broadcastsStart_notFound() throws Exception {
        when(containerController.getStatus("listener-UNKNOWN")).thenReturn(ContainerStatus.NOT_EXISTS);
        when(properties.getBizSystem()).thenReturn("DMES");

        mockMvc.perform(post("/kafkaApi/startConsumer")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"UNKNOWN\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.action", is("START")));

        verify(topicControlService, times(1)).start("UNKNOWN", "DMES");
        verify(containerController, never()).createConsumer(anyString());
    }

    // ==================== POST /kafkaApi/skipOffset ====================

    // TC-API-010: Offset 1건 스킵
    @Test
    public void TC_API_010_skipOffset() throws Exception {
        OffsetInfo offsetInfo = OffsetInfo.builder()
                .beforeOffset(100).afterOffset(101)
                .beforeMaxOffset(150).afterMaxOffset(150).maxOffset(150)
                .partition(0).topic("T1").groupId("G1").build();
        when(offsetManager.skipOffset("listener-T1", "G1", "T1", 1)).thenReturn(offsetInfo);
        when(containerController.getStatus("listener-T1")).thenReturn(ContainerStatus.RUNNING);

        mockMvc.perform(post("/kafkaApi/skipOffset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"T1\",\"groupId\":\"G1\",\"count\":1}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.beforeCurrentOffset", is(100)))
                .andExpect(jsonPath("$.afterCurrentOffset", is(101)))
                .andExpect(jsonPath("$.beforeMaxOffset", is(150)))
                .andExpect(jsonPath("$.afterMaxOffset", is(150)))
                .andExpect(jsonPath("$.success", is(true)));
    }

    // TC-API-011: count 생략 시 기본값 1
    @Test
    public void TC_API_011_skipOffset_defaultCount() throws Exception {
        OffsetInfo offsetInfo = OffsetInfo.builder()
                .beforeOffset(100).afterOffset(101).maxOffset(150)
                .partition(0).topic("T1").groupId("G1").build();
        when(offsetManager.skipOffset("listener-T1", "G1", "T1", 1)).thenReturn(offsetInfo);
        when(containerController.getStatus("listener-T1")).thenReturn(ContainerStatus.RUNNING);

        mockMvc.perform(post("/kafkaApi/skipOffset")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"topicId\":\"T1\",\"groupId\":\"G1\"}"))
                .andExpect(status().isOk());

        verify(offsetManager, times(1)).skipOffset("listener-T1", "G1", "T1", 1);
    }

    // ==================== GET /kafkaApi/browse ====================

    // TC-API-012: 시간 범위 메시지 조회
    @Test
    public void TC_API_012_browseMessages() throws Exception {
        BrowseResult browse = BrowseResult.builder()
                .offset(10).partition(0).topic("T1").value("test-msg")
                .timestamp(1500).timestampStr("2024-01-01 00:00:01.500").build();
        when(messageBrowser.browseByTimeRange("T1", 1000L, 2000L, 50))
                .thenReturn(Collections.singletonList(browse));

        mockMvc.perform(get("/kafkaApi/browse")
                        .param("topicId", "T1")
                        .param("fromTimestamp", "1000")
                        .param("toTimestamp", "2000")
                        .param("maxCount", "50"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));
    }

    // TC-API-013: maxCount 생략 시 기본값 100
    @Test
    public void TC_API_013_browseMessages_defaultMaxCount() throws Exception {
        when(messageBrowser.browseByTimeRange("T1", 1000L, 2000L, 100))
                .thenReturn(Collections.emptyList());

        mockMvc.perform(get("/kafkaApi/browse")
                        .param("topicId", "T1")
                        .param("fromTimestamp", "1000")
                        .param("toTimestamp", "2000"))
                .andExpect(status().isOk());

        verify(messageBrowser, times(1)).browseByTimeRange("T1", 1000L, 2000L, 100);
    }

    // ==================== GET /kafkaApi/peekOffset ====================

    // TC-API-014: 특정 Offset 메시지 조회 - 존재
    @Test
    public void TC_API_014_peekOffset_found() throws Exception {
        BrowseResult browse = BrowseResult.builder()
                .offset(42).partition(0).topic("T1").value("found-msg")
                .timestamp(1000).timestampStr("2024-01-01 00:00:01.000").build();
        when(messageBrowser.peekAtOffset("T1", 42)).thenReturn(Optional.of(browse));

        mockMvc.perform(get("/kafkaApi/peekOffset")
                        .param("topicId", "T1")
                        .param("offset", "42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found", is(true)))
                .andExpect(jsonPath("$.offset", is(42)));
    }

    // TC-API-015: 특정 Offset 메시지 조회 - 미존재
    @Test
    public void TC_API_015_peekOffset_notFound() throws Exception {
        when(messageBrowser.peekAtOffset("T1", 99999)).thenReturn(Optional.empty());

        mockMvc.perform(get("/kafkaApi/peekOffset")
                        .param("topicId", "T1")
                        .param("offset", "99999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.found", is(false)));
    }
}
