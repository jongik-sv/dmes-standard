package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleSetEdit} action={@code execute} 응답(흐름도 2단계 P5). {@code trace} 는 엔진 계약 스키마 {@code $defs/RunTrace} 모양의 맵
 * ({@code RunTraceJson}), {@code warnings} 는 {@code {code, ruleId, message}} 목록(폐기 룰 → 갈래 조건식 NULL → 룰 경고 순).
 */
public class RuleSetSimulateResult {

    private Map<String, Object> trace;
    private List<Map<String, Object>> warnings;

    public RuleSetSimulateResult() {
    }

    public RuleSetSimulateResult(Map<String, Object> trace, List<Map<String, Object>> warnings) {
        this.trace = trace;
        this.warnings = warnings;
    }

    public Map<String, Object> getTrace() { return trace; }
    public List<Map<String, Object>> getWarnings() { return warnings; }

    public void setTrace(Map<String, Object> v) { this.trace = v; }
    public void setWarnings(List<Map<String, Object>> v) { this.warnings = v; }
}
