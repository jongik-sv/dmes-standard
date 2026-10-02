package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/** 4단계 spec §2.3 — 실행 기록 JSON 의 edits 칸. 없으면 키를 빼서 기존 골든이 그대로다. */
class RunTraceJsonTest {

    private static final Instant TS = LocalDateTime.of(2026, 6, 1, 9, 0).atZone(MdmClockConfig.KST).toInstant();

    @Test
    void edits_가_null_이면_키를_싣지_않는다() {
        Map<String, Object> m = RunTraceJson.toMap(new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, null, null));
        assertFalse(m.containsKey("edits"));
        assertEquals(List.of("setId", "evalTs", "input", "nodes", "finalValues", "violations"), List.copyOf(m.keySet()));
    }

    @Test
    void edits_는_violations_뒤에_beforeSeq_nodeId_TypedValue_values_로_싣고_NULL_을_지킨다() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("GT_G", "B");
        values.put("GT_F", new BigDecimal("1.50"));
        values.put("GT_X", null);
        RunTrace t = new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, List.of(new RunTrace.TraceEdit(3, "if1", values)), null);

        Map<String, Object> m = RunTraceJson.toMap(t);

        assertEquals(List.of("setId", "evalTs", "input", "nodes", "finalValues", "violations", "edits"), List.copyOf(m.keySet()));
        Map<String, Object> typed = new LinkedHashMap<>();
        typed.put("GT_G", Map.of("type", "STRING", "value", "B"));
        typed.put("GT_F", Map.of("type", "NUMBER", "value", "1.50"));
        typed.put("GT_X", Map.of("type", "NULL"));
        assertEquals(List.of(Map.of("beforeSeq", 3, "nodeId", "if1", "values", typed)), m.get("edits"));
    }

    @Test
    void endedBy_는_있으면_마지막_키이고_없으면_싣지_않는다() {
        RunTrace ended = new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, null, "c1");
        assertEquals(List.of("setId", "evalTs", "input", "nodes", "finalValues", "violations", "endedBy"),
                List.copyOf(RunTraceJson.toMap(ended).keySet()));
        assertEquals("c1", RunTraceJson.toMap(ended).get("endedBy"));
        RunTrace plain = new RunTrace("S", TS, Map.of(), List.of(), Map.of(), null, null, null);
        assertFalse(RunTraceJson.toMap(plain).containsKey("endedBy"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void CATCH_노드_기록은_violations_뒤에_catchKind_code_message_를_싣고_다른_노드는_싣지_않는다() {
        RunTrace.NodeTrace caught = new RunTrace.NodeTrace(2, "r1", NodeKind.RULE, RunTrace.NodeStatus.CAUGHT, "R1", new BigDecimal("1.000"), Map.of(), null,
                null, null, null, null, null, List.of(), null, null, null);
        RunTrace.NodeTrace c = new RunTrace.NodeTrace(3, "c1", NodeKind.CATCH, RunTrace.NodeStatus.OK, "R1", null, null, null,
                null, null, null, null, null, null, CatchKind.NO_RESULT, "NO_RESULT", "맞는 행과 기본 행이 없다");
        Map<String, Object> m = RunTraceJson.toMap(new RunTrace("S", TS, Map.of(), List.of(caught, c), Map.of(), null, null, null));
        List<Map<String, Object>> nodes = (List<Map<String, Object>>) m.get("nodes");
        assertEquals("CAUGHT", nodes.get(0).get("status"));
        assertFalse(nodes.get(0).containsKey("catchKind"));
        assertEquals(List.of("seq", "nodeId", "kind", "status", "ruleId", "ver", "reads", "branches", "chosenEdgeId", "order", "splitId", "merged",
                "violations", "catchKind", "code", "message"), List.copyOf(nodes.get(1).keySet()));
        assertEquals("NO_RESULT", nodes.get(1).get("catchKind"));
        assertTrue(nodes.get(1).containsKey("message"));
    }
}
