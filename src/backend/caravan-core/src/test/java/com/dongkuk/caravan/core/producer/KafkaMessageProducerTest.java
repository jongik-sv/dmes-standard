package com.dongkuk.caravan.core.producer;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.exception.KafkaSendException;
import com.dongkuk.caravan.core.model.KafkaMessage;
import com.dongkuk.caravan.core.repository.KafkaErrorRepository;
import com.dongkuk.caravan.core.util.JsonUtil;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * TC-PROD-001 ~ TC-PROD-008, TC-PROD-011: KafkaMessageProducer 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class KafkaMessageProducerTest {

    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    @Mock
    private CaravanProperties properties;

    @Mock
    private KafkaErrorRepository errorRepository;

    @Captor
    private ArgumentCaptor<String> jsonCaptor;

    private KafkaMessageProducer producer;

    @Before
    public void setUp() {
        producer = new KafkaMessageProducer(kafkaTemplate, properties, errorRepository);

        CaravanProperties.Producer producerProps = new CaravanProperties.Producer();
        producerProps.setTimeoutSeconds(10);
        when(properties.getProducer()).thenReturn(producerProps);
    }

    private CompletableFuture<SendResult<String, String>> createSuccessFuture(
            String topic, int partition, long offset) {
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        TopicPartition tp = new TopicPartition(topic, partition);
        RecordMetadata metadata = new RecordMetadata(tp, offset, 0, System.currentTimeMillis(), 0, 0);
        SendResult<String, String> sendResult = new SendResult<>(null, metadata);
        future.complete(sendResult);
        return future;
    }

    // TC-PROD-001: 동기 전송 성공 - 간단 API
    @Test
    public void TC_PROD_001_send_simple_success() {
        CompletableFuture<SendResult<String, String>> future =
                createSuccessFuture("MMPPMERPTT01", 0, 10);
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), anyString())).thenReturn(future);

        com.dongkuk.caravan.core.producer.SendResult result =
                producer.send("MMPPMERPTT01", "PQR02012", "PQR02012|P|S");

        assertTrue(result.isSuccess());
        assertEquals(0, result.getPartition());
        assertEquals(10, result.getOffset());
        verify(kafkaTemplate, times(1)).send(eq("MMPPMERPTT01"), anyString());
    }

    // TC-PROD-002: 동기 전송 성공 - KafkaMessage API
    @Test
    public void TC_PROD_002_send_kafkaMessage_success() {
        CompletableFuture<SendResult<String, String>> future =
                createSuccessFuture("MMPPMERPTT01", 0, 10);
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), anyString())).thenReturn(future);

        KafkaMessage message = KafkaMessage.builder()
                .transactionCode("PQR02012")
                .interfaceMsg("A|B")
                .build();

        com.dongkuk.caravan.core.producer.SendResult result = producer.send("MMPPMERPTT01", message);

        assertTrue(result.isSuccess());
    }

    // TC-PROD-003: 동기 전송 성공 - 표준 메시지 포맷 검증
    @Test
    public void TC_PROD_003_send_standardFormat() {
        CompletableFuture<SendResult<String, String>> future =
                createSuccessFuture("MMPPMERPTT01", 0, 10);
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), jsonCaptor.capture())).thenReturn(future);

        producer.send("MMPPMERPTT01", "PQR02012", "A|B|C");

        String json = jsonCaptor.getValue();
        Map<String, Object> map = JsonUtil.parseMap(json);

        assertEquals("PQR02012", map.get("TRANSACTION_CODE"));
        assertEquals("MMPPMERPTT01", map.get("INTERFACE_ID"));
        assertEquals("A|B|C", map.get("INTERFACE_MSG"));
        assertEquals("IF_KAFKA", map.get("INTERFACE_PROTOCOL"));

        // KAFKA_KEYDATA: UUID 형식 (36자, 하이픈 4개)
        String kafkaKeyData = (String) map.get("KAFKA_KEYDATA");
        assertNotNull(kafkaKeyData);
        assertEquals(36, kafkaKeyData.length());
        assertEquals(4, kafkaKeyData.chars().filter(c -> c == '-').count());
    }

    // TC-PROD-004: 동기 전송 실패 - 타임아웃
    @Test(expected = KafkaSendException.class)
    public void TC_PROD_004_send_timeout() {
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        future.completeExceptionally(new TimeoutException("timeout"));
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), anyString())).thenReturn(future);

        try {
            producer.send("MMPPMERPTT01", "PQR02012", "msg");
        } finally {
            verify(errorRepository, times(1)).logSendError(
                    eq("MMPPMERPTT01"), eq("PQR02012"), anyString(), anyString(), anyString());
        }
    }

    // TC-PROD-005: 동기 전송 실패 - 브로커 오류
    @Test(expected = KafkaSendException.class)
    public void TC_PROD_005_send_executionError() {
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        future.completeExceptionally(new RuntimeException("broker error"));
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), anyString())).thenReturn(future);

        try {
            producer.send("MMPPMERPTT01", "PQR02012", "msg");
        } finally {
            verify(errorRepository, times(1)).logSendError(
                    eq("MMPPMERPTT01"), eq("PQR02012"), anyString(), anyString(), anyString());
        }
    }

    // TC-PROD-006: 동기 전송 실패 - 에러 로그 DB 기록도 실패
    @Test(expected = KafkaSendException.class)
    public void TC_PROD_006_send_errorLogFails() {
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        future.completeExceptionally(new RuntimeException("broker error"));
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), anyString())).thenReturn(future);
        doThrow(new RuntimeException("DB error")).when(errorRepository)
                .logSendError(anyString(), anyString(), anyString(), anyString(), anyString());

        // 에러 로그 저장 실패해도 KafkaSendException이 전파됨 (에러 로그 실패는 무시됨)
        producer.send("MMPPMERPTT01", "PQR02012", "msg");
    }

    // TC-PROD-007: 비동기 전송 성공
    @Test
    public void TC_PROD_007_sendAsync_success() {
        CompletableFuture<SendResult<String, String>> future =
                createSuccessFuture("MMPPMERPTT01", 0, 10);
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), anyString())).thenReturn(future);

        ProducerCallback callback = mock(ProducerCallback.class);

        producer.sendAsync("MMPPMERPTT01", "PQR02012", "msg", callback);

        verify(callback, times(1)).onSuccess(any(com.dongkuk.caravan.core.producer.SendResult.class));
        verify(callback, never()).onFailure(any());
    }

    // TC-PROD-008: 비동기 전송 실패
    @Test
    public void TC_PROD_008_sendAsync_failure() {
        CompletableFuture<SendResult<String, String>> future = new CompletableFuture<>();
        future.completeExceptionally(new RuntimeException("send failed"));
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), anyString())).thenReturn(future);

        ProducerCallback callback = mock(ProducerCallback.class);

        producer.sendAsync("MMPPMERPTT01", "PQR02012", "msg", callback);

        verify(callback, times(1)).onFailure(any(KafkaSendException.class));
        verify(callback, never()).onSuccess(any());
        verify(errorRepository, times(1)).logSendError(
                eq("MMPPMERPTT01"), eq("PQR02012"), anyString(), anyString(), anyString());
    }

    // TC-PROD-011: 연속 전송 시 UUID 중복 없음
    @Test
    public void TC_PROD_011_uuid_uniqueness() {
        CompletableFuture<SendResult<String, String>> future =
                createSuccessFuture("MMPPMERPTT01", 0, 10);
        when(kafkaTemplate.send(eq("MMPPMERPTT01"), jsonCaptor.capture())).thenReturn(future);

        for (int i = 0; i < 10; i++) {
            producer.send("MMPPMERPTT01", "PQR02012", "msg");
        }

        List<String> allJsons = jsonCaptor.getAllValues();
        Set<String> uuids = new HashSet<>();
        for (String json : allJsons) {
            Map<String, Object> map = JsonUtil.parseMap(json);
            uuids.add((String) map.get("KAFKA_KEYDATA"));
        }

        assertEquals(10, uuids.size());
    }
}
