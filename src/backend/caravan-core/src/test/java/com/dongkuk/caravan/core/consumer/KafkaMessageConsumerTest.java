package com.dongkuk.caravan.core.consumer;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.container.ContainerController;
import com.dongkuk.caravan.core.handler.DefaultKafkaInterfaceHandler;
import com.dongkuk.caravan.core.handler.HandleResult;
import com.dongkuk.caravan.core.handler.KafkaInterfaceHandler;
import com.dongkuk.caravan.core.handler.KafkaInterfaceHandlerRegistry;
import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.core.repository.KafkaErrorRepository;
import com.dongkuk.caravan.core.service.TopicErrorService;
import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.TopicPartition;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.kafka.support.Acknowledgment;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * TC-CONS-001 ~ TC-CONS-013, TC-CONS-008-1 ~ TC-CONS-008-3:
 * KafkaMessageConsumer 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class KafkaMessageConsumerTest {

    @Mock
    private KafkaInterfaceHandlerRegistry handlerRegistry;

    @Mock
    private ContainerController containerController;

    @Mock
    private KafkaErrorRepository errorRepository;

    @Mock
    private CaravanProperties properties;

    @Mock
    private TopicErrorService topicErrorService;

    @Mock
    private AlertNotifier alertNotifier;

    @Mock
    private Consumer<?, ?> consumer;

    @Mock
    private Acknowledgment ack;

    @Mock
    private KafkaInterfaceHandler mockHandler;

    @Captor
    private ArgumentCaptor<KafkaMessageContext> contextCaptor;

    private KafkaMessageConsumer kafkaMessageConsumer;

    private static final String STANDARD_JSON =
            "{\"TRANSACTION_CODE\":\"PQR02012\",\"KAFKA_KEYDATA\":\"uuid-value\"," +
            "\"INTERFACE_ID\":\"MMPPMERPTT01\",\"INTERFACE_MSG\":\"PQR02012|P|S|5A\"," +
            "\"INTERFACE_PROTOCOL\":\"IF_KAFKA\"}";

    @Before
    public void setUp() {
        kafkaMessageConsumer = new KafkaMessageConsumer(
                handlerRegistry, containerController, errorRepository, properties, topicErrorService, alertNotifier);

        // 기본 properties 설정
        when(properties.getBizSystem()).thenReturn("DMES");

        CaravanProperties.Retry retry = new CaravanProperties.Retry();
        retry.setMaxAttempts(3);
        retry.setDelayMs(0); // 테스트 속도를 위해 0
        when(properties.getRetry()).thenReturn(retry);
    }

    private ConsumerRecord<String, String> createRecord(String topic, int partition, long offset, String value) {
        return new ConsumerRecord<>(topic, partition, offset, null, value);
    }

    // ==================== 정상 처리 ====================

    // TC-CONS-001: 핸들러 성공 - offset 커밋
    @Test
    public void TC_CONS_001_handlerSuccess_acknowledge() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any())).thenReturn(HandleResult.success());

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(ack, times(1)).acknowledge();
        verify(errorRepository, never()).logConsumeError(anyString(), anyString(), anyLong(), anyString(), anyString(), anyString());
        verify(alertNotifier, never()).send(any(AlertEvent.class));
    }

    // TC-CONS-002: 핸들러에 전달되는 KafkaMessageContext 검증
    @Test
    public void TC_CONS_002_contextFields() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(contextCaptor.capture())).thenReturn(HandleResult.success());

        kafkaMessageConsumer.consume(record, consumer, ack);

        KafkaMessageContext context = contextCaptor.getValue();
        assertEquals("PQR02012", context.getTransactionCode());
        assertEquals("MMPPMERPTT01", context.getInterfaceId());
        assertEquals("PQR02012|P|S|5A", context.getInterfaceMsg());
        assertEquals("IF_KAFKA", context.getInterfaceProtocol());
        assertEquals("uuid-value", context.getKafkaKeyData());
        assertEquals("MMPPMERPTT01", context.getTopic());
        assertEquals(0, context.getPartition());
        assertEquals(42, context.getOffset());
        assertEquals(STANDARD_JSON, context.getRawMessage());
        assertNotNull(context.getRawMessageMap());
        assertEquals(5, context.getRawMessageMap().size());
    }

    // ==================== 파싱 실패 ====================

    // TC-CONS-003: 잘못된 JSON - 파싱 실패 → 큐막기(자동 스킵 금지: ack 안 함, pause + seek)
    //   + 원문(payload)을 logConsumeError 로 적재 + 운영자 알림 발송
    @Test
    public void TC_CONS_003_invalidJson_queueBlock() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 7, "invalid-json");

        kafkaMessageConsumer.consume(record, consumer, ack);

        // 자동 스킵 금지 — ack 하지 않고 큐막기
        verify(ack, never()).acknowledge();
        verify(handlerRegistry, never()).getHandler(anyString());
        verify(containerController, times(1)).pause("listener-MMPPMERPTT01");
        verify(consumer, times(1)).seek(eq(new TopicPartition("MMPPMERPTT01", 0)), eq(7L));
        // 원문 그대로 적재(payload = "invalid-json")
        verify(errorRepository, times(1)).logConsumeError(
                eq("MMPPMERPTT01"), eq("PARSE_ERROR"), eq(7L), eq("invalid-json"), eq("PARSE_ERROR"), anyString());
        // 큐막기 진입 → 운영자 알림
        verify(alertNotifier, times(1)).send(any(AlertEvent.class));
    }

    // TC-CONS-004: null TRANSACTION_CODE
    @Test
    public void TC_CONS_004_nullTransactionCode() {
        String json = "{\"INTERFACE_MSG\":\"A|B\"}";
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 0, json);

        DefaultKafkaInterfaceHandler defaultHandler = new DefaultKafkaInterfaceHandler();
        when(handlerRegistry.getHandler(null)).thenReturn(defaultHandler);

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(handlerRegistry, times(1)).getHandler(null);
        verify(ack, times(1)).acknowledge();
    }

    // ==================== 재시도 로직 ====================

    // TC-CONS-005: 재시도 가능 실패 → 2회차에 성공
    @Test
    public void TC_CONS_005_retryable_successOnSecond() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.failRetryable("ERR", "임시 오류"))
                .thenReturn(HandleResult.success());

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(mockHandler, times(2)).businessHandle(any());
        verify(ack, times(1)).acknowledge();
    }

    // TC-CONS-006: 재시도 가능 실패 → 3회 모두 실패 → 최대 재시도 초과
    @Test
    public void TC_CONS_006_retryable_maxRetryExceeded() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.failRetryable("ERR", "지속 오류"));

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(mockHandler, times(3)).businessHandle(any());
        verify(errorRepository, times(1)).logConsumeError(
                eq("MMPPMERPTT01"), eq("PQR02012"), eq(42L), eq(STANDARD_JSON), anyString(), anyString());
        verify(containerController, times(1)).pause("listener-MMPPMERPTT01");
        verify(consumer, times(1)).seek(eq(new TopicPartition("MMPPMERPTT01", 0)), eq(42L));
        verify(ack, never()).acknowledge();
        // 큐막기 진입 → 운영자 알림
        verify(alertNotifier, times(1)).send(any(AlertEvent.class));
    }

    // TC-CONS-007: 재시도 불가 실패 → 에러 기록 후 스킵
    @Test
    public void TC_CONS_007_nonRetryable_skip() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.fail("INVALID", "검증 오류"));

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(mockHandler, times(1)).businessHandle(any());
        // 원문(payload) = STANDARD_JSON 이 함께 적재됨
        verify(errorRepository, times(1)).logConsumeError(
                eq("MMPPMERPTT01"), eq("PQR02012"), eq(42L), eq(STANDARD_JSON), eq("INVALID"), eq("검증 오류"));
        verify(ack, times(1)).acknowledge();
        // 재시도 불가 스킵은 큐막기가 아니므로(핸들러 판단) 알림 없음
        verify(alertNotifier, never()).send(any(AlertEvent.class));
    }

    // TC-CONS-008: maxAttempts=1 설정 시 재시도 없이 바로 초과 처리
    @Test
    public void TC_CONS_008_maxAttempts1() {
        CaravanProperties.Retry retry = new CaravanProperties.Retry();
        retry.setMaxAttempts(1);
        retry.setDelayMs(0);
        when(properties.getRetry()).thenReturn(retry);

        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.failRetryable("ERR", "오류"));

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(mockHandler, times(1)).businessHandle(any());
        verify(containerController, times(1)).pause(anyString());
    }

    // TC-CONS-008-1: failRetryableSkip → 2회차에 성공
    @Test
    public void TC_CONS_008_1_failRetryableSkip_successOnSecond() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.failRetryableSkip("ERR", "임시 오류"))
                .thenReturn(HandleResult.success());

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(mockHandler, times(2)).businessHandle(any());
        verify(ack, times(1)).acknowledge();
        verify(containerController, never()).pause(anyString());
    }

    // TC-CONS-008-2: failRetryableSkip → 3회 모두 실패 → 에러 기록 후 스킵 (컨테이너 유지)
    @Test
    public void TC_CONS_008_2_failRetryableSkip_allFail_skip() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.failRetryableSkip("API_ERR", "외부 API 장애"));

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(mockHandler, times(3)).businessHandle(any());
        verify(errorRepository, times(1)).logConsumeError(
                eq("MMPPMERPTT01"), eq("PQR02012"), eq(42L), eq(STANDARD_JSON), anyString(), anyString());
        verify(ack, times(1)).acknowledge();
        verify(containerController, never()).pause(anyString());
        verify(consumer, never()).seek(any(TopicPartition.class), anyLong());
        // failRetryableSkip 은 의도된 스킵 → 큐막기 아님 → 알림 없음
        verify(alertNotifier, never()).send(any(AlertEvent.class));
    }

    // TC-CONS-008-3: failRetryableSkip과 failRetryable 혼용 → 마지막 결과 기준
    @Test
    public void TC_CONS_008_3_mixed_lastResultDetermines() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.failRetryableSkip("ERR", "오류1"))
                .thenReturn(HandleResult.failRetryable("ERR", "오류2"))
                .thenReturn(HandleResult.failRetryable("ERR", "오류3"));

        kafkaMessageConsumer.consume(record, consumer, ack);

        // 마지막 결과가 failRetryable → containerController.pause() 호출
        verify(containerController, times(1)).pause(anyString());
    }

    // ==================== caravan-hub 시스템 라우팅 ====================

    // TC-CONS-009: bizSystem="hub_prod" → SeraiConsumeHandler 라우팅
    @Test
    public void TC_CONS_009_hubRouting() {
        when(properties.getBizSystem()).thenReturn("hub_prod");
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("CaravanHubConsumeHandler")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any())).thenReturn(HandleResult.success());

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(handlerRegistry, times(1)).getHandler("CaravanHubConsumeHandler");
        verify(handlerRegistry, never()).getHandler("PQR02012");
        verify(mockHandler, times(1)).businessHandle(any());
    }

    // TC-CONS-010: bizSystem="HUB_DEV" → SeraiConsumeHandler 라우팅 (대소문자 무관)
    @Test
    public void TC_CONS_010_hubRouting_caseInsensitive() {
        when(properties.getBizSystem()).thenReturn("HUB_DEV");
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("CaravanHubConsumeHandler")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any())).thenReturn(HandleResult.success());

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(handlerRegistry, times(1)).getHandler("CaravanHubConsumeHandler");
    }

    // TC-CONS-011: bizSystem="DMES" → TRANSACTION_CODE 기반 라우팅
    @Test
    public void TC_CONS_011_dmesRouting() {
        when(properties.getBizSystem()).thenReturn("DMES");
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any())).thenReturn(HandleResult.success());

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(handlerRegistry, times(1)).getHandler("PQR02012");
        verify(handlerRegistry, never()).getHandler("CaravanHubConsumeHandler");
    }

    // TC-CONS-012: bizSystem="hub_prod" + SeraiConsumeHandler 미등록 → DefaultHandler
    @Test
    public void TC_CONS_012_seraiDefaultHandler() {
        when(properties.getBizSystem()).thenReturn("hub_prod");
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);

        DefaultKafkaInterfaceHandler defaultHandler = new DefaultKafkaInterfaceHandler();
        when(handlerRegistry.getHandler("CaravanHubConsumeHandler")).thenReturn(defaultHandler);

        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(ack, times(1)).acknowledge();
    }

    // ==================== 에러 저장 실패 ====================

    // TC-CONS-013: 에러 로그 DB 기록 자체가 실패해도 정상 진행
    @Test
    public void TC_CONS_013_errorLogFailure_noException() {
        ConsumerRecord<String, String> record = createRecord("MMPPMERPTT01", 0, 42, STANDARD_JSON);
        when(handlerRegistry.getHandler("PQR02012")).thenReturn(mockHandler);
        when(mockHandler.businessHandle(any()))
                .thenReturn(HandleResult.fail("ERR", "오류"));
        doThrow(new RuntimeException("DB error")).when(errorRepository)
                .logConsumeError(anyString(), anyString(), anyLong(), anyString(), anyString(), anyString());

        // 예외 전파 안 됨
        kafkaMessageConsumer.consume(record, consumer, ack);

        verify(ack, times(1)).acknowledge();
    }
}
