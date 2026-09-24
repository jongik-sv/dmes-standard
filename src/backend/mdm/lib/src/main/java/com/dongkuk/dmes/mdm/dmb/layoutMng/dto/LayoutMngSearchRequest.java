package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/** {@code layoutMng} action={@code search} 요청(TSK-05-02 design.md §6.1) — target {@code LAYOUT}(기본)·{@code HEADER}·{@code COLUMN}. */
public class LayoutMngSearchRequest {

    private String target;
    private String keyword;
    private Long headerLayoutId;
    private String sndSystem;
    private String rcvSystem;

    public String getTarget() { return target; }

    public void setTarget(String v) { this.target = v; }

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }

    public Long getHeaderLayoutId() { return headerLayoutId; }

    public void setHeaderLayoutId(Long v) { this.headerLayoutId = v; }

    public String getSndSystem() { return sndSystem; }

    public void setSndSystem(String v) { this.sndSystem = v; }

    public String getRcvSystem() { return rcvSystem; }

    public void setRcvSystem(String v) { this.rcvSystem = v; }
}
