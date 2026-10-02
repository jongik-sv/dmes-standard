package com.dongkuk.dmes.mdm.dmb.headerMng.dto;

/** {@code headerMng} action={@code search} 요청(TSK-05-02 design.md §6.1) — target {@code HEADER}(기본)·{@code COLUMN}. */
public class HeaderMngSearchRequest {

    private String target;
    private String keyword;

    public String getTarget() { return target; }

    public void setTarget(String v) { this.target = v; }

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }

    /** true 면 목록은 비우고 콤보 값만 돌려준다(화면 진입 시 서버 목록 조회를 피한다). */
    private boolean optionsOnly;

    public boolean isOptionsOnly() { return optionsOnly; }

    public void setOptionsOnly(boolean v) { this.optionsOnly = v; }
}
