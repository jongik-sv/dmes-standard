package com.dongkuk.dmes.mdm.dme.ruleConfirm.dto;

/**
 * {@code ruleConfirm} action={@code view} 요청 params(TSK-08-05 design §6.5). ver 는 버전 문자열(예: {@code "1.001"}, D-144), 비면 DRAFT.
 * getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class RuleConfirmViewRequest {

    private String maruRuleId;
    private String ver;

    public String getMaruRuleId() { return maruRuleId; }
    public String getVer() { return ver; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(String v) { this.ver = v; }
}
