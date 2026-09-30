package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * {@code ruleSetEdit} action={@code execute} 요청(흐름도 2단계 P5) — 저장 전 흐름을 기록 실행한다(디버거). 흐름·레코드는 JSON 문자열로 받는다
 * (OASIS params 는 Map 을 받지 못한다, D-111). {@code recordJson} 이 없으면 {@code {}}, {@code evalTs} 는 KST {@code yyyy-MM-dd HH:mm:ss}(없으면
 * 서비스 시계).
 */
public class RuleSetSimulateRequest {

    private String flowJson;
    private String recordJson;
    private String evalTs;

    public String getFlowJson() { return flowJson; }
    public String getRecordJson() { return recordJson; }
    public String getEvalTs() { return evalTs; }

    public void setFlowJson(String v) { this.flowJson = v; }
    public void setRecordJson(String v) { this.recordJson = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
}
