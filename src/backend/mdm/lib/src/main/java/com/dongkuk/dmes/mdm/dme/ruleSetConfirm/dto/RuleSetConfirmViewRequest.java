package com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto;

/** {@code ruleSetConfirm} action={@code view} 요청 params(D-144 2단계). ver 는 버전 문자열(예: {@code "2.000"}), 비면 그 세트의 DRAFT. */
public class RuleSetConfirmViewRequest {

    private String setId;
    private String ver;

    public String getSetId() { return setId; }
    public String getVer() { return ver; }

    public void setSetId(String v) { this.setId = v; }
    public void setVer(String v) { this.ver = v; }
}
