package com.dongkuk.caravan.core.model;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * TC-UTIL-014 ~ TC-UTIL-019: KafkaMessageContext 단위 테스트
 */
public class KafkaMessageContextTest {

    // TC-UTIL-014: getInterfaceMsgArray() - 정상 파이프 분리
    @Test
    public void TC_UTIL_014_getInterfaceMsgArray_normal() {
        KafkaMessageContext context = KafkaMessageContext.builder()
                .interfaceMsg("PQR02012|P|S|5A|20260130")
                .build();

        String[] arr = context.getInterfaceMsgArray();

        assertEquals(5, arr.length);
        assertEquals("PQR02012", arr[0]);
        assertEquals("P", arr[1]);
        assertEquals("S", arr[2]);
        assertEquals("5A", arr[3]);
        assertEquals("20260130", arr[4]);
    }

    // TC-UTIL-015: getInterfaceMsgArray() - null interfaceMsg
    @Test
    public void TC_UTIL_015_getInterfaceMsgArray_null() {
        KafkaMessageContext context = KafkaMessageContext.builder()
                .interfaceMsg(null)
                .build();

        String[] arr = context.getInterfaceMsgArray();

        assertEquals(0, arr.length);
    }

    // TC-UTIL-016: getInterfaceMsgArray() - 빈 문자열
    @Test
    public void TC_UTIL_016_getInterfaceMsgArray_empty() {
        KafkaMessageContext context = KafkaMessageContext.builder()
                .interfaceMsg("")
                .build();

        String[] arr = context.getInterfaceMsgArray();

        assertEquals(0, arr.length);
    }

    // TC-UTIL-017: getString() - 존재하는 키
    @Test
    public void TC_UTIL_017_getString_existingKey() {
        Map<String, Object> map = new HashMap<>();
        map.put("CUSTOM", "value");

        KafkaMessageContext context = KafkaMessageContext.builder()
                .rawMessageMap(map)
                .build();

        assertEquals("value", context.getString("CUSTOM"));
    }

    // TC-UTIL-018: getString() - 존재하지 않는 키
    @Test
    public void TC_UTIL_018_getString_missingKey() {
        Map<String, Object> map = new HashMap<>();
        map.put("CUSTOM", "value");

        KafkaMessageContext context = KafkaMessageContext.builder()
                .rawMessageMap(map)
                .build();

        assertNull(context.getString("UNKNOWN"));
    }

    // TC-UTIL-019: getString() - rawMessageMap이 null
    @Test
    public void TC_UTIL_019_getString_nullMap() {
        KafkaMessageContext context = KafkaMessageContext.builder()
                .rawMessageMap(null)
                .build();

        assertNull(context.getString("ANY"));
    }
}
