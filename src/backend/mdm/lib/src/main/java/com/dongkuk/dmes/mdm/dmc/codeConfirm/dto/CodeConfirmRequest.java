package com.dongkuk.dmes.mdm.dmc.codeConfirm.dto;

/**
 * {@code codeConfirm} action={@code confirm} 요청 params(TSK-06-05 design.md §6.5). applyFrom 은
 * {@code yyyy-MM-dd HH:mm:ss}(KST) 문자열, warningsAcknowledged 가 null 이면 false 로 본다(I23 — 서버가 다시 검사한다).
 */
public class CodeConfirmRequest {

    private String maruCodeId;
    private String ver;
    private Long rowVersion;
    private String applyFrom;
    private Boolean warningsAcknowledged;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getApplyFrom() { return applyFrom; }
    public Boolean getWarningsAcknowledged() { return warningsAcknowledged; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
    public void setWarningsAcknowledged(Boolean v) { this.warningsAcknowledged = v; }
}
