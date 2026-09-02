package com.dongkuk.caravan.core.handler;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import org.junit.Test;

import static org.junit.Assert.*;

/**
 * TC-HDL-008 ~ TC-HDL-009: DefaultKafkaInterfaceHandler 단위 테스트
 */
public class DefaultKafkaInterfaceHandlerTest {

    private final DefaultKafkaInterfaceHandler handler = new DefaultKafkaInterfaceHandler();

    // TC-HDL-008: 기본 핸들러 - success 반환하여 메시지 스킵
    @Test
    public void TC_HDL_008_businessHandle_returnsSuccess() {
        KafkaMessageContext context = KafkaMessageContext.builder()
                .transactionCode("UNKNOWN")
                .topic("test-topic")
                .offset(0)
                .build();

        HandleResult result = handler.businessHandle(context);

        assertTrue(result.isSuccess());
    }

    // TC-HDL-009: 기본 핸들러 - 다른 TRANSACTION_CODE에 대해서도 정상 동작
    @Test
    public void TC_HDL_009_businessHandle_logsWarning() {
        KafkaMessageContext context = KafkaMessageContext.builder()
                .transactionCode("MISSING_TX")
                .topic("test-topic")
                .offset(0)
                .build();

        HandleResult result = handler.businessHandle(context);

        // WARN 로그에 "MISSING_TX" 포함 확인은 로그 프레임워크 의존성 필요
        // 여기서는 success 반환만 검증
        assertTrue(result.isSuccess());
        assertFalse(result.isRetryable());
    }
}
