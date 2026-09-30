package com.dongkuk.dmes.mdm.common.rule.dto;

import java.util.List;
import java.util.Map;

/**
 * 룰 세트 실행 응답 — 결과 변수 전체와 방문 경로(노드 ID·종류·고른 선·결과 자리). 시각은 KST 문자열.
 *
 * <p>{@code warnings} — 판정을 막지 않은 경고 목록({@code {code, ruleId, message}}, 없으면 빈 목록). 먼저 폐기 룰 경고
 * ({@code RULE_DEPRECATED}, 세트 흐름에서 룰 ID 가 처음 나온 순서, 판정에 실제로 쓰였는지와 무관), 다음에 엔진 경고
 * ({@code EXPR_CELL_NULL}·{@code GRP_COND_NULL}·{@code BRANCH_COND_NULL}, 엔진이 낸 순서 — 세트 경고, 이어서 룰 경고).
 * 엔진 경고의 ruleId 는 null 일 수 있다.
 */
public class RuleSetRunResult {

    private String setId;
    private String evalTs;
    private Map<String, Object> finalValues;
    private List<Map<String, Object>> path;
    private List<Map<String, Object>> warnings = List.of();

    public String getSetId() { return setId; }
    public String getEvalTs() { return evalTs; }
    public Map<String, Object> getFinalValues() { return finalValues; }
    public List<Map<String, Object>> getPath() { return path; }

    public List<Map<String, Object>> getWarnings() { return warnings; }

    public void setSetId(String v) { this.setId = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setFinalValues(Map<String, Object> v) { this.finalValues = v; }
    public void setPath(List<Map<String, Object>> v) { this.path = v; }
    public void setWarnings(List<Map<String, Object>> v) { this.warnings = v; }
}
