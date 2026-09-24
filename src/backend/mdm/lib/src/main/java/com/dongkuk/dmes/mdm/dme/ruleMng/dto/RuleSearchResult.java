package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

import java.util.List;

/** {@code ruleMng} action={@code search} 응답 — 한 페이지와 같은 필터의 전체 건수. */
public class RuleSearchResult {

    private List<RuleListRow> list;
    private long totalCount;
    private int page;
    private int size;

    public RuleSearchResult() {
    }

    public RuleSearchResult(List<RuleListRow> list, long totalCount, int page, int size) {
        this.list = list;
        this.totalCount = totalCount;
        this.page = page;
        this.size = size;
    }

    public List<RuleListRow> getList() { return list; }
    public long getTotalCount() { return totalCount; }
    public int getPage() { return page; }
    public int getSize() { return size; }

    public void setList(List<RuleListRow> v) { this.list = v; }
    public void setTotalCount(long v) { this.totalCount = v; }
    public void setPage(int v) { this.page = v; }
    public void setSize(int v) { this.size = v; }
}
