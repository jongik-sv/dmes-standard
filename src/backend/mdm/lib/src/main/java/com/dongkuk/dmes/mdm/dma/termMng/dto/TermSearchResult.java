package com.dongkuk.dmes.mdm.dma.termMng.dto;

import java.util.List;

/**
 * {@code termMng} action={@code search} 응답. {@code totalCount}·{@code truncated} 는 첫 조회 상한(화면 성능 가이드 R1)용 새 필드다 —
 * 상한이 걸리지 않으면 {@code totalCount} 는 목록 건수, {@code truncated} 는 false 다.
 */
public class TermSearchResult {

    private List<TermRow> list;
    /** 조건에 맞는 전체 건수 — 상한으로 잘렸으면 목록 건수보다 크다. */
    private int totalCount;
    /** 목록이 상한으로 잘렸는지. */
    private boolean truncated;

    public TermSearchResult() {
    }

    public TermSearchResult(List<TermRow> list) {
        this(list, list == null ? 0 : list.size());
    }

    public TermSearchResult(List<TermRow> list, int totalCount) {
        this.list = list;
        this.totalCount = totalCount;
        this.truncated = list != null && list.size() < totalCount;
    }

    public List<TermRow> getList() { return list; }
    public void setList(List<TermRow> v) { this.list = v; }

    public int getTotalCount() { return totalCount; }
    public void setTotalCount(int v) { this.totalCount = v; }

    public boolean isTruncated() { return truncated; }
    public void setTruncated(boolean v) { this.truncated = v; }
}
