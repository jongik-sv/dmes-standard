package com.dongkuk.dmes.mdm.common.rule.dto;

import java.util.List;
import java.util.Map;

/**
 * 룰 세트 실행 응답 — 결과 변수 전체와 방문 경로(노드 ID·종류·고른 선·결과 자리). 시각은 KST 문자열.
 *
 * <p>{@code path} — 방문한 노드 {@code {nodeId, kind, chosenEdgeId, stepIndex, callIndex}}. {@code callIndex} 는 SET 노드면 그 결과가
 * {@code calls} 의 몇 번째인지, 그 밖은 null(하위 세트 spec §3.1).
 *
 * <p>{@code warnings} — 판정을 막지 않은 경고 목록({@code {code, ruleId, message}}, 없으면 빈 목록). 먼저 폐기 룰 경고
 * ({@code RULE_DEPRECATED}, 세트 흐름에서 룰 ID 가 처음 나온 순서, 판정에 실제로 쓰였는지와 무관, 최상위 세트의 룰만), 다음에 엔진 경고
 * ({@code EXPR_CELL_NULL}·{@code GRP_COND_NULL}·{@code BRANCH_COND_NULL}, 엔진이 낸 순서 — 세트 경고, 이어서 룰 경고, 이어서 부른 하위 세트마다
 * {@code calls} 순서로 같은 순서를 재귀로). 엔진 경고의 ruleId 는 null 일 수 있다.
 *
 * <p>{@code endedBy} — 받는 노드 처리 갈래가 END 로 세트를 끝냈으면 그 CATCH 노드 ID, 아니면 null(받는 노드 spec §7). OASIS BPMN 은 이 값으로
 * 게이트웨이를 나눈다 — 끝냈으면 {@code finalValues} 의 비어 있는 결과를 정상 결과로 쓰지 않는다(X-D10). 하위 세트의 {@code endedBy} 는
 * {@code calls[i].endedBy} 에 있다.
 * {@code caught} — 받는 노드가 받아 처리한 exception {@code {ruleNodeId, ruleId, catchNodeId, kind, code, message, setPath}}, 실행 순서(없으면
 * 빈 목록). 하위 세트에서 받은 것도 들어 있고, {@code setPath} 는 그 세트까지 거친 SET 노드 ID(이 세트에서 받았으면 빈 목록, 하위 세트 spec §4.3).
 */
public class RuleSetRunResult {

    private String setId;
    private String evalTs;
    private Map<String, Object> finalValues;
    private List<Map<String, Object>> path;
    private List<Map<String, Object>> warnings = List.of();
    private String endedBy;
    private List<Map<String, Object>> caught = List.of();
    /** 실행한 SET 노드마다 {@code {nodeId, setId, endedBy(하위 세트를 끝낸 받는 노드, 없으면 null)}}(실행 순서, 하위 세트 spec §8). 없으면 빈 목록. */
    private List<Map<String, Object>> calls = List.of();

    public String getSetId() { return setId; }
    public String getEvalTs() { return evalTs; }
    public Map<String, Object> getFinalValues() { return finalValues; }
    public List<Map<String, Object>> getPath() { return path; }

    public List<Map<String, Object>> getWarnings() { return warnings; }
    public String getEndedBy() { return endedBy; }
    public List<Map<String, Object>> getCaught() { return caught; }

    public void setSetId(String v) { this.setId = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setFinalValues(Map<String, Object> v) { this.finalValues = v; }
    public void setPath(List<Map<String, Object>> v) { this.path = v; }
    public void setWarnings(List<Map<String, Object>> v) { this.warnings = v; }
    public void setEndedBy(String v) { this.endedBy = v; }
    public void setCaught(List<Map<String, Object>> v) { this.caught = v; }
    public List<Map<String, Object>> getCalls() { return calls; }
    public void setCalls(List<Map<String, Object>> v) { this.calls = v; }
}
