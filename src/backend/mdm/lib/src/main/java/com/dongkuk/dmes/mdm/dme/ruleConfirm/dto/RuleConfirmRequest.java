package com.dongkuk.dmes.mdm.dme.ruleConfirm.dto;

/**
 * {@code ruleConfirm} action={@code confirm} 요청 params(TSK-08-05 design §6.5). applyFrom 은 {@code yyyy-MM-dd HH:mm:ss}(KST) 문자열,
 * warningsAcknowledged 가 null 이면 false 로 본다(I28 — 서버가 다시 검사한다).
 */
public class RuleConfirmRequest {

    private String maruRuleId;
    private String ver;
    private Long rowVersion;
    private String applyFrom;
    private Boolean warningsAcknowledged;

    public String getMaruRuleId() { return maruRuleId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getApplyFrom() { return applyFrom; }
    public Boolean getWarningsAcknowledged() { return warningsAcknowledged; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
    public void setWarningsAcknowledged(Boolean v) { this.warningsAcknowledged = v; }
}
