package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * {@code ruleSetEdit} action={@code validate} 요청(흐름도 2단계 P5) — 편집 중인 흐름의 IF 갈래 조건식 입력을 서버가 푼다. 흐름은 JSON 문자열로 받는다
 * (OASIS params 는 Map 을 받지 못한다, D-111).
 */
public class RuleSetCondIoRequest {

    private String flowJson;
    /** 식 텍스트 — 있으면 흐름 IO 대신 식을 파싱한다(흐름도 3단계 P-D1, slot {@code RULE_COND_EXPR}). */
    private String exprText;

    public String getFlowJson() { return flowJson; }

    public String getExprText() { return exprText; }

    public void setExprText(String v) { this.exprText = v; }

    public void setFlowJson(String v) { this.flowJson = v; }
}
