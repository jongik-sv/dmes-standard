package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/** {@code layoutMng} action={@code save} 요청(TSK-05-02 design.md §6.1). grid {@code headers}·{@code consts}·{@code items} — 헤더 항목을 받는 칸은 없다(불변 I8). */
public class LayoutMngSaveRequest {

    private Long layoutId;
    private Long ver;
    private String layoutName;
    private String eaiCode;
    private String sndSystem;
    private String rcvSystem;

    public Long getLayoutId() { return layoutId; }

    public void setLayoutId(Long v) { this.layoutId = v; }

    public Long getVer() { return ver; }

    public void setVer(Long v) { this.ver = v; }

    public String getLayoutName() { return layoutName; }

    public void setLayoutName(String v) { this.layoutName = v; }

    public String getEaiCode() { return eaiCode; }

    public void setEaiCode(String v) { this.eaiCode = v; }

    public String getSndSystem() { return sndSystem; }

    public void setSndSystem(String v) { this.sndSystem = v; }

    public String getRcvSystem() { return rcvSystem; }

    public void setRcvSystem(String v) { this.rcvSystem = v; }
}
