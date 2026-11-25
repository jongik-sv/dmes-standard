package com.dongkuk.dmes.mqc.qcd.designSimulation.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class CaseEvaluatorTest {

    static Map<String, Object> run(String coatMin, String feas, List<String> errCodes, String anomalySeverity) {
        Map<String, Object> design = new LinkedHashMap<>();
        design.put("common", List.of(List.of("품질설계상태", "B : 설계중", "b"), List.of("도금량코드", "E : 80 g/㎡")));
        design.put("cgl", Map.of("coat", Map.of("min", Integer.parseInt(coatMin))));
        Map<String, Object> s2 = new LinkedHashMap<>();
        s2.put("no", 2);
        s2.put("verdict", errCodes.isEmpty() ? "P" : "F");
        s2.put("detail", Map.of("fired", errCodes.stream().map(c -> Map.of("errCd", c)).toList()));
        Map<String, Object> s4 = new LinkedHashMap<>();
        s4.put("no", 4);
        s4.put("verdict", feas);
        Map<String, Object> run = new LinkedHashMap<>();
        run.put("design", design);
        run.put("stages", List.of(s2, s4));
        run.put("anomalies", anomalySeverity == null ? List.of() : List.of(Map.of("severity", anomalySeverity)));
        return run;
    }

    static final List<Map<String, Object>> PINS = List.of(
            Map.of("path", "cgl.coat.min", "label", "도금 하한", "op", "=", "val", "80"),
            Map.of("path", "common.도금량코드", "label", "도금량코드", "op", "~", "val", "E"));
    static final List<Map<String, Object>> VERDICTS = List.of(Map.of("stage", 4, "expect", "P"), Map.of("stage", 2, "expectErrorCode", "A803"));

    @Test
    void pass_when_pins_and_verdicts_hold_and_only_info_anomalies() {
        Map<String, Object> e = CaseEvaluator.evaluate(run("80", "P", List.of("A803", "A455"), "info"), PINS, VERDICTS, null, null);
        assertThat(e).containsEntry("status", "PASS").containsEntry("pinPass", 2).containsEntry("verdictPass", 2);
    }

    @Test
    void warn_when_warning_anomaly() {
        assertThat(CaseEvaluator.evaluate(run("80", "P", List.of("A803"), "warn"), PINS, VERDICTS, null, null)).containsEntry("status", "WARN");
    }

    @Test
    void fail_on_pin_verdict_or_golden_diff() {
        assertThat(CaseEvaluator.evaluate(run("100", "P", List.of("A803"), null), PINS, VERDICTS, null, null)).containsEntry("status", "FAIL");
        assertThat(CaseEvaluator.evaluate(run("80", null, List.of("A803"), null), PINS, VERDICTS, null, null)).containsEntry("status", "FAIL");
        Map<String, String> golden = Map.of("cgl.coat.min", "120", "common.도금량코드", "E : 80 g/㎡", "common.품질설계상태", "B : 설계중");
        Map<String, Object> e = CaseEvaluator.evaluate(run("80", "P", List.of("A803"), null), PINS, VERDICTS, golden, "2026-11-25 10:00");
        assertThat(e).containsEntry("status", "FAIL");
        assertThat((List<Map<String, Object>>) e.get("goldenDiff")).singleElement()
                .satisfies(d -> assertThat(d).containsEntry("path", "cgl.coat.min").containsEntry("before", "120").containsEntry("after", "80"));
    }
}
