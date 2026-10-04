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

    /**
     * target=HEADER(헤더 추가 팝업) 전용 — true 면 헤더 행에서 {@code items}(항목 목록)를 뺀다. 항목은 행을 고를 때
     * {@code headerLayoutId} 를 함께 보내 그 헤더 한 건으로 받는다. 비우면 지금처럼 항목을 싣는다.
     */
    private boolean withoutItems;

    public boolean isWithoutItems() { return withoutItems; }

    public void setWithoutItems(boolean v) { this.withoutItems = v; }
}
