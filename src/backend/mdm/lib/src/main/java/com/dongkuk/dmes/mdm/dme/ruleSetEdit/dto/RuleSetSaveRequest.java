package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleSetEdit} action={@code save} 요청(TSK-08-06 design §6.6-3).
 *
 * <p>{@code rules} 는 {@code params} 가 아니라 {@code grids.rules.rows} 로 받는다 — OASIS 는 params 배열을 받지 않고 grids 는 같은 이름의
 * DTO 속성에 채운다(F14). 원소는 {@code {ruleId}} 이고 순서가 곧 세트의 실행 순서다. 검사는 서버가 이 목록으로 다시 계산한다(I12).
 *
 * <p>{@code part=CASE} 는 테스트 케이스 저장(삭제는 {@code caseDeleted=true})이다 — 이때 {@code rowVersion}·{@code description} 은
 * <b>세트가 아니라 케이스의</b> 것이다. {@code inputJson}·{@code expectedJson} 은 JSON 문자열, {@code evalTs} 는 KST
 * {@code yyyy-MM-dd HH:mm:ss}(흐름도 3단계 P7). {@code part} 가 null·{@code SET} 이면 세트 저장이다.
 */
public class RuleSetSaveRequest {

    private String setId;
    private String setName;
    private String description;
    private Long rowVersion;
    private List<Map<String, Object>> rules;
    /**
     * 흐름도 JSON 문자열(spec §3.3). 있으면 {@code rules} 를 무시하고 서버가 흐름에서 룰 목록을 펼친다. 없으면 {@code rules} 목록 저장이다(흐름이
     * 저장된 세트는 FLOW_READONLY 로 거부). 화면은 흐름 JSON 문자열로 보낸다(OASIS params 는 Map 을 받지 못한다, D-111).
     */
    private String flowJson;

    private String part;
    private Integer caseId;
    private String caseName;
    private String inputJson;
    private String evalTs;
    private String expectedJson;
    private Boolean caseDeleted;

    public String getPart() { return part; }
    public Integer getCaseId() { return caseId; }
    public String getCaseName() { return caseName; }
    public String getInputJson() { return inputJson; }
    public String getEvalTs() { return evalTs; }
    public String getExpectedJson() { return expectedJson; }
    public Boolean getCaseDeleted() { return caseDeleted; }

    public void setPart(String v) { this.part = v; }
    public void setCaseId(Integer v) { this.caseId = v; }
    public void setCaseName(String v) { this.caseName = v; }
    public void setInputJson(String v) { this.inputJson = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setExpectedJson(String v) { this.expectedJson = v; }
    public void setCaseDeleted(Boolean v) { this.caseDeleted = v; }

    public String getSetId() { return setId; }
    public String getSetName() { return setName; }
    public String getDescription() { return description; }
    public Long getRowVersion() { return rowVersion; }
    public List<Map<String, Object>> getRules() { return rules; }

    public String getFlowJson() { return flowJson; }
    public void setFlowJson(String v) { this.flowJson = v; }

    public void setSetId(String v) { this.setId = v; }
    public void setSetName(String v) { this.setName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setRules(List<Map<String, Object>> v) { this.rules = v; }
}
