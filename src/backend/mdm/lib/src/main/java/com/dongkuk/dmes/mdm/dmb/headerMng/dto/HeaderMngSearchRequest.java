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

    /**
     * 조건이 없을 때만 적용하는 행 수 상한(화면 성능 가이드 R1). 비우거나 0 이하면 상한 없음 — 이 값을 보내지 않는 기존 호출자는
     * 지금처럼 전체를 받는다. 조건이 있으면 무시한다. 주면 응답에 {@code totalCount}·{@code truncated} 가 더해진다.
     */
    private Integer limit;

    public Integer getLimit() { return limit; }

    public void setLimit(Integer v) { this.limit = v; }
}
