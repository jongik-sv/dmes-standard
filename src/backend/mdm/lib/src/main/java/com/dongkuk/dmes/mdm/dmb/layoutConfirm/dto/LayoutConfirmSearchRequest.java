package com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto;

/** {@code layoutConfirm} action={@code search} 요청 params(D-144 3단계). keyword 는 레이아웃 이름(부분 일치)·ID. 비면 전체 DRAFT. */
public class LayoutConfirmSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }

    /**
     * 조건이 없을 때만 적용하는 행 수 상한(화면 성능 가이드 R1). 비우거나 0 이하면 상한 없음 — 이 값을 보내지 않는 기존 호출자는
     * 지금처럼 전체를 받는다. 조건이 있으면 무시한다. 주면 응답에 {@code totalCount}·{@code truncated} 가 더해진다.
     */
    private Integer limit;

    public Integer getLimit() { return limit; }

    public void setLimit(Integer v) { this.limit = v; }
}
