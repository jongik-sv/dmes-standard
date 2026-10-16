package com.dongkuk.dmes.mdm.common.support;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 검사 문제 응답 map 두 모양 — 키 순서가 화면 JSON 순서다(BE 리팩토링 2회차 C1, 화면 서비스 사본 6곳의 정본). */
class MdmCheckIssueMapsTest {

    private static final MdmCheckIssue ISSUE = new MdmCheckIssue("CODE_X", "문구", "field1", "key1");

    @Test
    void severity_가_있는_모양은_5키를_이_순서로_둔다() {
        Map<String, Object> m = MdmCheckIssueMaps.of("WARNING", ISSUE);
        assertEquals(List.of("severity", "code", "message", "field", "itemKey"), new ArrayList<>(m.keySet()));
        assertEquals(List.of("WARNING", "CODE_X", "문구", "field1", "key1"), new ArrayList<>(m.values()));
    }

    @Test
    void severity_가_없는_모양은_4키이고_severity_키를_넣지_않는다() {
        Map<String, Object> m = MdmCheckIssueMaps.of(ISSUE);
        assertEquals(List.of("code", "message", "field", "itemKey"), new ArrayList<>(m.keySet()));
        assertEquals(List.of("CODE_X", "문구", "field1", "key1"), new ArrayList<>(m.values()));
        assertFalse(m.containsKey("severity"));
    }

    @Test
    void null_칸은_null_값으로_그대로_둔다() {
        Map<String, Object> m = MdmCheckIssueMaps.of(null, new MdmCheckIssue("C", "M", null, null));
        assertEquals(List.of("severity", "code", "message", "field", "itemKey"), new ArrayList<>(m.keySet()));
        assertEquals(null, m.get("severity"));
        assertEquals(null, m.get("field"));
        assertEquals(null, m.get("itemKey"));
    }
}
