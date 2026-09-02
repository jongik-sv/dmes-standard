package com.dongkuk.caravan.core.producer;

import org.apache.kafka.clients.producer.RecordMetadata;
import org.apache.kafka.common.TopicPartition;
import org.junit.Test;

import static org.junit.Assert.*;

/**
 * TC-PROD-009 ~ TC-PROD-010: SendResult 팩토리 메서드 단위 테스트
 */
public class SendResultTest {

    // TC-PROD-009: SendResult.success()
    @Test
    public void TC_PROD_009_success() {
        TopicPartition tp = new TopicPartition("T", 0);
        RecordMetadata metadata = new RecordMetadata(tp, 0, 42, 123456L, 0, 0);

        SendResult result = SendResult.success(metadata);

        assertTrue(result.isSuccess());
        assertEquals("T", result.getTopic());
        assertEquals(0, result.getPartition());
        assertEquals(42, result.getOffset());
        assertEquals(123456L, result.getTimestamp());
    }

    // TC-PROD-010: SendResult.fail()
    @Test
    public void TC_PROD_010_fail() {
        SendResult result = SendResult.fail("Connection refused");

        assertFalse(result.isSuccess());
        assertEquals("Connection refused", result.getErrorMessage());
    }
}
