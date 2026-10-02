package com.dongkuk.dmes.mdm.dmb.headerMng.dto;

/** {@code headerMng} action={@code view} 요청(TSK-05-02 design.md §6.1). D-144 3단계: {@code ver} 가 없으면 화면이 열 버전. */
public class HeaderMngViewRequest {

    private Long layoutId;
    private String ver;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }

    public String getVer() { return ver; }

    public void setVer(String v) { this.ver = v; }
}
