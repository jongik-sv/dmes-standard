package com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto;

/** {@code ruleSetConfirm} action={@code validate} 요청 params(D-144 2단계). applyFrom 은 {@code yyyy-MM-dd HH:mm:ss}(KST) 문자열. 쓰기를 하지 않는다. */
public class RuleSetConfirmValidateRequest {

    private String setId;
    private String ver;
    private String applyFrom;

    public String getSetId() { return setId; }
    public String getVer() { return ver; }
    public String getApplyFrom() { return applyFrom; }

    public void setSetId(String v) { this.setId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
}
