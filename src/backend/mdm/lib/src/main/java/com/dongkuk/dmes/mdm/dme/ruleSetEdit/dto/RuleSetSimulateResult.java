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
    /** 케이스 일괄 실행({@code runCases})의 케이스별 결과. 단건 실행이면 null. */
    private List<Map<String, Object>> cases;
    /**
     * 실행 중 부른 세트(하위 세트 spec §8, 디버거 들어가기) — 세트 ID → {@code {setId, setName, flow(판정 시각 RELEASED 버전(MY_DRAFT 면 내 DRAFT 세트 행)의 FLOW_JSON 맵, view 포함,
     * 없으면 null), ruleIds, rules(RuleIo 목록)}}. 단건 실행에만 싣고, 부른 세트가 없거나 케이스 일괄 실행이면 빈 맵.
     */
    private Map<String, Object> calledFlows = Map.of();
    /** 실제로 쓴 룰 버전 모드(spec 2026-10-06 §4.5) — 사용자를 몰라 되돌렸으면 RELEASED. */
    private String ruleVersions = "RELEASED";
    /** 흐름(하위 세트 포함)에 든 내 DRAFT 룰·세트 — {@code {rules: {룰 ID: VER}, sets: {세트 ID: VER}}}, VER 는 scale 3 글자. 키는 늘 있다. 케이스 일괄 실행은 한 묶음. */
    private Map<String, Object> draftVersions = Map.of("rules", Map.of(), "sets", Map.of());

    public RuleSetSimulateResult() {
    }

    public RuleSetSimulateResult(Map<String, Object> trace, List<Map<String, Object>> warnings) {
        this.trace = trace;
        this.warnings = warnings;
    }

    public RuleSetSimulateResult(Map<String, Object> trace, List<Map<String, Object>> warnings, List<Map<String, Object>> cases) {
        this.trace = trace;
        this.warnings = warnings;
        this.cases = cases;
    }

    public List<Map<String, Object>> getCases() { return cases; }

    public void setCases(List<Map<String, Object>> v) { this.cases = v; }

    public Map<String, Object> getTrace() { return trace; }
    public List<Map<String, Object>> getWarnings() { return warnings; }

    public void setTrace(Map<String, Object> v) { this.trace = v; }
    public void setWarnings(List<Map<String, Object>> v) { this.warnings = v; }

    public Map<String, Object> getCalledFlows() { return calledFlows; }
    public void setCalledFlows(Map<String, Object> v) { this.calledFlows = v; }

    public String getRuleVersions() { return ruleVersions; }
    public void setRuleVersions(String v) { this.ruleVersions = v; }
    public Map<String, Object> getDraftVersions() { return draftVersions; }
    public void setDraftVersions(Map<String, Object> v) { this.draftVersions = v; }
}
