package com.dongkuk.caravan.hub.inbound.db;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.dongkuk.caravan.core.alert.AlertEvent;
import com.dongkuk.caravan.core.alert.AlertNotifier;
import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.producer.KafkaMessageProducer;
import com.dongkuk.caravan.hub.config.CaravanHubProperties;
import com.dongkuk.caravan.hub.mapper.CaravanHubConfigMapper;
import com.dongkuk.caravan.hub.mapper.InterfaceMapper;

/**
 * DB INBOUND 핸들러 단위 테스트 (구 DbPollingServiceTest 이식).
 *
 * <p>폴 1회의 핵심 계약을 검증: 테이블명 검증 → IF_FLAG='N' 조회 → 순차 발행 → 성공 IF_FLAG='Y'/실패 'E'
 * (낙관락 인자 U_AT/TRANSACTION_CODE), batchSize 절단. 폴 스케줄링은 DbInboundRouteManager(라우트) 담당.</p>
 */
@ExtendWith(MockitoExtension.class)
class DbInboundHandlerTest {

    @Mock
    private KafkaMessageProducer kafkaMessageProducer;
    @Mock
    private CaravanHubConfigMapper configMapper;
    @Mock
    private InterfaceMapper interfaceMapper;
    @Mock
    private CaravanHubProperties properties;
    @Mock
    private AlertNotifier alertNotifier;
    @Mock
    private CaravanProperties caravanProperties;

    @InjectMocks
    private DbInboundHandler handler;

    private static final String TOPIC = "MMPPMMCMTT01";
    private static final String TABLE = "IFUSER.IF_MMPPMMCMTT01";

    private void stubBatchSize(int size) {
        CaravanHubProperties.Inbound inbound = new CaravanHubProperties.Inbound();
        inbound.getDb().setBatchSize(size);
        when(properties.getInbound()).thenReturn(inbound);
    }

    private static Map<String, Object> row(String tc, String msg, Object uAt) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("TRANSACTION_CODE", tc);
        m.put("INTERFACE_MSG", msg);
        m.put("U_AT", uAt);
        return m;
    }

    @BeforeEach
    void validTableByDefault() {
        // isValidTableName 은 대부분 케이스에서 유효(>0)로 스텁 (invalid 케이스에서 개별 재정의)
    }

    @Test
    @DisplayName("정상: 조회된 메시지를 발행하고 성공 시 updateSuccess(낙관락 U_AT/TC) 호출")
    void pollSendsAndMarksSuccess() {
        when(configMapper.isValidTableName(eq("IFUSER"), eq("IF_MMPPMMCMTT01"))).thenReturn(1);
        stubBatchSize(100);
        LocalDateTime uAt = LocalDateTime.now().minusMinutes(1);
        when(interfaceMapper.selectPendingMessages(TABLE))
                .thenReturn(List.of(row("TC1", "MSG1|A", uAt)));

        handler.pollAndSend(TOPIC, TABLE);

        verify(kafkaMessageProducer).send(TOPIC, "TC1", "MSG1|A");
        verify(interfaceMapper).updateSuccess(eq(TABLE), eq(uAt), eq("TC1"), anyString(), anyString(), any());
        verify(interfaceMapper, never()).updateError(anyString(), any(), anyString(), anyString(), anyString(), any());
    }

    @Test
    @DisplayName("발행 실패: updateError 로 IF_FLAG='E' 표시")
    void pollMarksErrorOnSendFailure() {
        when(configMapper.isValidTableName(anyString(), anyString())).thenReturn(1);
        stubBatchSize(100);
        LocalDateTime uAt = LocalDateTime.now();
        when(interfaceMapper.selectPendingMessages(TABLE))
                .thenReturn(List.of(row("TC1", "MSG1", uAt)));
        when(kafkaMessageProducer.send(anyString(), anyString(), anyString()))
                .thenThrow(new RuntimeException("broker down"));

        handler.pollAndSend(TOPIC, TABLE);

        verify(interfaceMapper).updateError(eq(TABLE), eq(uAt), eq("TC1"), anyString(), anyString(), any());
        verify(interfaceMapper, never()).updateSuccess(anyString(), any(), anyString(), anyString(), anyString(), any());
        // 재시도 소진 → 'E' 큐막기 진입 → 운영자 알림 1회
        verify(alertNotifier, times(1)).send(any(AlertEvent.class));
    }

    @Test
    @DisplayName("유효하지 않은 테이블명이면 조회/발행하지 않음(SQL Injection 방지)")
    void invalidTableSkips() {
        when(configMapper.isValidTableName(anyString(), anyString())).thenReturn(0);

        handler.pollAndSend(TOPIC, TABLE);

        verify(interfaceMapper, never()).selectPendingMessages(anyString());
        verify(kafkaMessageProducer, never()).send(anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("batchSize 초과 시 앞에서부터 batchSize 만큼만 처리")
    void batchSizeLimitsProcessing() {
        when(configMapper.isValidTableName(anyString(), anyString())).thenReturn(1);
        stubBatchSize(2);
        when(interfaceMapper.selectPendingMessages(TABLE)).thenReturn(List.of(
                row("TC1", "M1", LocalDateTime.now()),
                row("TC2", "M2", LocalDateTime.now()),
                row("TC3", "M3", LocalDateTime.now())));

        handler.pollAndSend(TOPIC, TABLE);

        verify(kafkaMessageProducer, times(2)).send(eq(TOPIC), anyString(), anyString());
        verify(kafkaMessageProducer).send(TOPIC, "TC1", "M1");
        verify(kafkaMessageProducer).send(TOPIC, "TC2", "M2");
        verify(kafkaMessageProducer, never()).send(TOPIC, "TC3", "M3");
    }

    @Test
    @DisplayName("미처리 메시지 없으면 발행/갱신 없음")
    void emptyDoesNothing() {
        when(configMapper.isValidTableName(anyString(), anyString())).thenReturn(1);
        stubBatchSize(100);
        when(interfaceMapper.selectPendingMessages(TABLE)).thenReturn(List.of());

        handler.pollAndSend(TOPIC, TABLE);

        verify(kafkaMessageProducer, never()).send(anyString(), anyString(), anyString());
        verify(interfaceMapper, never()).updateSuccess(anyString(), any(), anyString(), anyString(), anyString(), any());
    }
}
