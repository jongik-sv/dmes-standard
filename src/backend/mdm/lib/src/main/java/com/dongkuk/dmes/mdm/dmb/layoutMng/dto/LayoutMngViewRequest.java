package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/** {@code layoutMng} action={@code view} 요청(TSK-05-02 design.md §6.1). */
public class LayoutMngViewRequest {

    private Long layoutId;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }
}
