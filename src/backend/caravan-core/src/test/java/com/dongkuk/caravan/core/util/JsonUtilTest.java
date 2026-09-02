package com.dongkuk.caravan.core.util;

import com.dongkuk.caravan.core.model.KafkaMessage;
import org.junit.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.Assert.*;

/**
 * TC-UTIL-001 ~ TC-UTIL-009: JsonUtil 단위 테스트
 */
public class JsonUtilTest {

    // TC-UTIL-001: JSON → Map 파싱 성공
    @Test
    public void TC_UTIL_001_parseMap_success() {
        String json = "{\"TRANSACTION_CODE\":\"PQR02012\",\"INTERFACE_MSG\":\"A|B|C\"}";

        Map<String, Object> map = JsonUtil.parseMap(json);

        assertNotNull(map);
        assertEquals("PQR02012", map.get("TRANSACTION_CODE"));
        assertEquals("A|B|C", map.get("INTERFACE_MSG"));
    }

    // TC-UTIL-002: JSON → Map 파싱 - 빈 객체
    @Test
    public void TC_UTIL_002_parseMap_emptyObject() {
        Map<String, Object> map = JsonUtil.parseMap("{}");

        assertNotNull(map);
        assertEquals(0, map.size());
    }

    // TC-UTIL-003: JSON → Map 파싱 - 잘못된 JSON
    @Test(expected = RuntimeException.class)
    public void TC_UTIL_003_parseMap_invalidJson() {
        JsonUtil.parseMap("{invalid json");
    }

    // TC-UTIL-004: JSON → Map 파싱 - null 입력
    @Test(expected = Exception.class)
    public void TC_UTIL_004_parseMap_null() {
        JsonUtil.parseMap(null);
    }

    // TC-UTIL-005: Object → JSON 직렬화
    @Test
    public void TC_UTIL_005_toJson_success() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("TRANSACTION_CODE", "PQR02012");
        map.put("INTERFACE_MSG", "A|B");

        String json = JsonUtil.toJson(map);

        assertNotNull(json);
        assertTrue(json.contains("\"TRANSACTION_CODE\""));
        assertTrue(json.contains("\"PQR02012\""));
        assertTrue(json.contains("\"INTERFACE_MSG\""));
    }

    // TC-UTIL-006: Object → JSON 직렬화 - null 입력
    @Test
    public void TC_UTIL_006_toJson_null() {
        String json = JsonUtil.toJson(null);

        assertEquals("null", json);
    }

    // TC-UTIL-007: JSON 유효성 검증 - 유효
    @Test
    public void TC_UTIL_007_isValidJson_valid() {
        assertTrue(JsonUtil.isValidJson("{\"key\":\"value\"}"));
    }

    // TC-UTIL-008: JSON 유효성 검증 - 무효
    @Test
    public void TC_UTIL_008_isValidJson_invalid() {
        assertFalse(JsonUtil.isValidJson("not-json-string"));
    }

    // TC-UTIL-009: JSON → 타입 변환
    @Test
    public void TC_UTIL_009_parse_toType() {
        String json = "{\"transactionCode\":\"PQR02012\",\"interfaceMsg\":\"A|B\"}";

        KafkaMessage msg = JsonUtil.parse(json, KafkaMessage.class);

        assertNotNull(msg);
        assertEquals("PQR02012", msg.getTransactionCode());
        assertEquals("A|B", msg.getInterfaceMsg());
    }
}
