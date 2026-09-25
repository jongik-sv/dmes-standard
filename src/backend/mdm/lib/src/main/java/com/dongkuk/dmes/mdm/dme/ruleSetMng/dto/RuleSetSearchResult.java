package com.dongkuk.dmes.mdm.dme.ruleSetMng.dto;

import java.util.List;

/** {@code ruleSetMng} action={@code search} 응답 — 한 페이지와 같은 조건의 전체 건수. */
public class RuleSetSearchResult {

    private List<RuleSetListRow> rows;
    private long totalCount;

    public RuleSetSearchResult() {
    }

    public RuleSetSearchResult(List<RuleSetListRow> rows, long totalCount) {
        this.rows = rows;
        this.totalCount = totalCount;
    }

    public List<RuleSetListRow> getRows() { return rows; }
    public long getTotalCount() { return totalCount; }

    public void setRows(List<RuleSetListRow> v) { this.rows = v; }
    public void setTotalCount(long v) { this.totalCount = v; }
}
