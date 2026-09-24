package com.dongkuk.dmes.mdm.dmb.headerMng.dto;

/** {@code headerMng} action={@code search} 요청(TSK-05-02 design.md §6.1) — target {@code HEADER}(기본)·{@code COLUMN}. */
public class HeaderMngSearchRequest {

    private String target;
    private String keyword;

    public String getTarget() { return target; }

    public void setTarget(String v) { this.target = v; }

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
