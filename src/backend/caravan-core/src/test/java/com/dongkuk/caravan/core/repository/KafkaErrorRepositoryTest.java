package com.dongkuk.caravan.core.repository;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.entity.KafkaErrorLogEntity;
import com.dongkuk.caravan.core.jpa.KafkaErrorLogJpaRepository;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.MockitoJUnitRunner;

import static org.junit.Assert.*;
import static org.mockito.Mockito.*;

/**
 * TC-REPO-001 ~ TC-REPO-006: KafkaErrorRepository 단위 테스트
 */
@RunWith(MockitoJUnitRunner.class)
public class KafkaErrorRepositoryTest {

    @Mock
    private KafkaErrorLogJpaRepository errorLogJpaRepository;

    @Mock
    private CaravanProperties properties;

    @Captor
    private ArgumentCaptor<KafkaErrorLogEntity> entityCaptor;

    private KafkaErrorRepository repository;

    @Before
    public void setUp() {
        repository = new KafkaErrorRepository(errorLogJpaRepository, properties);
        when(properties.getBizSystem()).thenReturn("DMES");
    }

    // TC-REPO-001: logSendError() - 정상 기록
    @Test
    public void TC_REPO_001_logSendError_normal() {
        repository.logSendError("MMPPMERPTT01", "PQR02012", "msg-body", "TIMEOUT", "브로커 응답 없음");

        verify(errorLogJpaRepository, times(1)).save(entityCaptor.capture());
        KafkaErrorLogEntity entity = entityCaptor.getValue();

        assertEquals("KAFKA", entity.getInterfaceProtocol());
        assertEquals("PQR02012", entity.getTransactionCode());
        assertEquals("MMPPMERPTT01", entity.getInterfaceId());
        assertEquals("msg-body", entity.getInterfaceMsg());
        assertEquals("S", entity.getErrorType());
        assertEquals("TIMEOUT", entity.getErrorCode());
        assertEquals("브로커 응답 없음", entity.getErrorMsg());
        // {CLIENT} audit 컨벤션: CREATED_BY = "CARAVAN:{bizSystem}" (20자 절삭)
        assertEquals("CARAVAN:DMES", entity.getCreatedBy());
    }

    // TC-REPO-002: logConsumeError() - 원문(payload) 저장 + offset 보존
    @Test
    public void TC_REPO_002_logConsumeError_normal() {
        repository.logConsumeError("MMPPMERPTT01", "PQR02012", 42, "PQR02012|P|S|5A", "HANDLER_ERR", "처리 실패");

        verify(errorLogJpaRepository, times(1)).save(entityCaptor.capture());
        KafkaErrorLogEntity entity = entityCaptor.getValue();

        assertEquals("R", entity.getErrorType());
        // 원문(payload)이 INTERFACE_MSG 에 그대로 적재되어 실패 아카이브/재처리 근거가 된다.
        assertEquals("PQR02012|P|S|5A", entity.getInterfaceMsg());
        // offset 은 별도 컬럼이 없으므로 ERROR_MSG 에 접두 보존.
        assertTrue(entity.getErrorMsg().startsWith("[offset=42] "));
        assertTrue(entity.getErrorMsg().contains("처리 실패"));
    }

    // TC-REPO-002b: logConsumeError() - 원문 65000자 초과 시 절삭
    @Test
    public void TC_REPO_002b_logConsumeError_truncatePayload() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 70000; i++) {
            sb.append("X");
        }
        repository.logConsumeError("T", "TX", 1, sb.toString(), "ERR", "에러");

        verify(errorLogJpaRepository, times(1)).save(entityCaptor.capture());
        assertEquals(65000, entityCaptor.getValue().getInterfaceMsg().length());
    }

    // TC-REPO-003: logSendError() - interfaceMsg 65000자 초과 시 절삭
    @Test
    public void TC_REPO_003_logSendError_truncateMessage() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 70000; i++) {
            sb.append("X");
        }
        String longMsg = sb.toString();

        repository.logSendError("T", "TX", longMsg, "ERR", "에러");

        verify(errorLogJpaRepository, times(1)).save(entityCaptor.capture());
        KafkaErrorLogEntity entity = entityCaptor.getValue();

        assertEquals(65000, entity.getInterfaceMsg().length());
    }

    // TC-REPO-004: logSendError() - errorMsg 1000자 초과 시 절삭
    @Test
    public void TC_REPO_004_logSendError_truncateErrorMsg() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 2000; i++) {
            sb.append("E");
        }
        String longErrorMsg = sb.toString();

        repository.logSendError("T", "TX", "msg", "ERR", longErrorMsg);

        verify(errorLogJpaRepository, times(1)).save(entityCaptor.capture());
        KafkaErrorLogEntity entity = entityCaptor.getValue();

        assertEquals(1000, entity.getErrorMsg().length());
    }

    // TC-REPO-005: logSendError() - errorCode 100자 초과 시 절삭
    @Test
    public void TC_REPO_005_logSendError_truncateErrorCode() {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 200; i++) {
            sb.append("C");
        }
        String longErrorCode = sb.toString();

        repository.logSendError("T", "TX", "msg", longErrorCode, "에러");

        verify(errorLogJpaRepository, times(1)).save(entityCaptor.capture());
        KafkaErrorLogEntity entity = entityCaptor.getValue();

        assertEquals(100, entity.getErrorCode().length());
    }

    // TC-REPO-006: logSendError() - null 필드 처리
    @Test
    public void TC_REPO_006_logSendError_nullFields() {
        repository.logSendError("T", null, null, null, null);

        verify(errorLogJpaRepository, times(1)).save(any(KafkaErrorLogEntity.class));
    }
}
