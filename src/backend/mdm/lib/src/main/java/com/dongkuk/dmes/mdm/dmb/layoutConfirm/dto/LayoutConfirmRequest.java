package com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto;

/**
 * {@code layoutConfirm} action={@code confirm} 요청 params(D-144 3단계). warningsAcknowledged 가 null 이면 false 로 본다 — 서버가 확정
 * 때 다시 검사하고, 경고(동시 전환 등)가 있는데 확인하지 않았으면 공통 엔진이 MDM014 로 막는다.
 */
public class LayoutConfirmRequest {

    private Long layoutId;
    private String ver;
    private Long rowVersion;
    private String applyFrom;
    private Boolean warningsAcknowledged;

    public Long getLayoutId() { return layoutId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getApplyFrom() { return applyFrom; }
    public Boolean getWarningsAcknowledged() { return warningsAcknowledged; }

    public void setLayoutId(Long v) { this.layoutId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
    public void setWarningsAcknowledged(Boolean v) { this.warningsAcknowledged = v; }
}
