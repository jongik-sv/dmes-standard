package com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto;

/**
 * {@code layoutConfirm} action={@code validate} 요청 params(D-144 3단계). applyFrom 은 {@code yyyy-MM-dd HH:mm:ss}(KST) 필수 — 판정 시각
 * T 로 쓰므로 비면 지금으로 대신하지 않고 거부한다.
 */
public class LayoutConfirmValidateRequest {

    private Long layoutId;
    private String ver;
    private String applyFrom;

    public Long getLayoutId() { return layoutId; }
    public String getVer() { return ver; }
    public String getApplyFrom() { return applyFrom; }

    public void setLayoutId(Long v) { this.layoutId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
}
