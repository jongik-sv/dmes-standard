package com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto;

/** {@code ruleSetConfirm} action={@code confirm} 요청 params(D-144 2단계). warningsAcknowledged 가 null 이면 false 로 본다(서버가 다시 검사한다). */
public class RuleSetConfirmRequest {

    private String setId;
    private String ver;
    private Long rowVersion;
    private String applyFrom;
    private Boolean warningsAcknowledged;

    public String getSetId() { return setId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getApplyFrom() { return applyFrom; }
    public Boolean getWarningsAcknowledged() { return warningsAcknowledged; }

    public void setSetId(String v) { this.setId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
    public void setWarningsAcknowledged(Boolean v) { this.warningsAcknowledged = v; }
}
