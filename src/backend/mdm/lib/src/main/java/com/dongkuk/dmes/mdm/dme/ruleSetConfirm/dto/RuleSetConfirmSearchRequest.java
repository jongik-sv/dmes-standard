package com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto;

/** {@code ruleSetConfirm} action={@code search} 요청 params(D-144 2단계). keyword 는 세트 ID·세트명 부분 일치, 비면 전체. */
public class RuleSetConfirmSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }

    /**
     * 조건(검색어)이 없을 때만 적용하는 행 수 상한(화면 성능 가이드 R1). 비우거나 0 이하면 상한 없음 — 이 값을 보내지 않는 기존
     * 호출자는 지금처럼 전체를 받는다. 조건이 있으면 무시한다. 응답의 {@code totalCount}·{@code truncated} 로 잘림을 알린다.
     */
    private Integer limit;

    public Integer getLimit() { return limit; }

    public void setLimit(Integer v) { this.limit = v; }
}
