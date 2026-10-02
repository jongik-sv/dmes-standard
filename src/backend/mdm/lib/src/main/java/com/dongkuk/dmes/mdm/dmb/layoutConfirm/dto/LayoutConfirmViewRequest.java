package com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto;

/** {@code layoutConfirm} action={@code view} 요청 params(D-144 3단계). ver({@code "1.001"})가 비면 그 레이아웃의 DRAFT. */
public class LayoutConfirmViewRequest {

    private Long layoutId;
    private String ver;

    public Long getLayoutId() { return layoutId; }
    public String getVer() { return ver; }

    public void setLayoutId(Long v) { this.layoutId = v; }
    public void setVer(String v) { this.ver = v; }
}
