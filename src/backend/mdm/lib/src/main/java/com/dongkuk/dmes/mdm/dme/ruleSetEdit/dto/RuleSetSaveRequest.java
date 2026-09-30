package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleSetEdit} action={@code save} 요청(TSK-08-06 design §6.6-3).
 *
 * <p>{@code rules} 는 {@code params} 가 아니라 {@code grids.rules.rows} 로 받는다 — OASIS 는 params 배열을 받지 않고 grids 는 같은 이름의
 * DTO 속성에 채운다(F14). 원소는 {@code {ruleId}} 이고 순서가 곧 세트의 실행 순서다. 검사는 서버가 이 목록으로 다시 계산한다(I12).
 */
public class RuleSetSaveRequest {

    private String setId;
    private String setName;
    private String description;
    private Long rowVersion;
    private List<Map<String, Object>> rules;
    /**
     * 흐름도(spec §3.3, FLOW_JSON 모양). 있으면 {@code rules} 를 무시하고 서버가 흐름에서 룰 목록을 펼친다. 없으면 {@code rules} 목록 저장이다(분기 세트는
     * FLOW_READONLY 로 거부). 1단계 화면은 보내지 않는다 — 2단계 캔버스가 쓴다.
     */
    private Map<String, Object> flow;

    public String getSetId() { return setId; }
    public String getSetName() { return setName; }
    public String getDescription() { return description; }
    public Long getRowVersion() { return rowVersion; }
    public List<Map<String, Object>> getRules() { return rules; }

    public Map<String, Object> getFlow() { return flow; }
    public void setFlow(Map<String, Object> v) { this.flow = v; }

    public void setSetId(String v) { this.setId = v; }
    public void setSetName(String v) { this.setName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setRules(List<Map<String, Object>> v) { this.rules = v; }
}
