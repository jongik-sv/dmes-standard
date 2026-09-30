package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * {@code ruleSetEdit} action={@code validate} 요청(흐름도 2단계 P5) — 편집 중인 흐름의 IF 갈래 조건식 입력을 서버가 푼다. 흐름은 JSON 문자열로 받는다
 * (OASIS params 는 Map 을 받지 못한다, D-111).
 */
public class RuleSetCondIoRequest {

    private String flowJson;

    public String getFlowJson() { return flowJson; }

    public void setFlowJson(String v) { this.flowJson = v; }
}
