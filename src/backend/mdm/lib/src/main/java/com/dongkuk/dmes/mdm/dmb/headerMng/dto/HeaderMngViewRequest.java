package com.dongkuk.dmes.mdm.dmb.headerMng.dto;

/** {@code headerMng} action={@code view} 요청(TSK-05-02 design.md §6.1). */
public class HeaderMngViewRequest {

    private Long layoutId;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }
}
