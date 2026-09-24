package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

import java.util.List;

/** {@code dataItemMng} action={@code search} 응답 — 한 쪽과 모든 필터 뒤 총 건수(Q3). */
public class DataItemSearchResult {

    private List<DataItemRow> list;
    private long totalCount;
    private int page;
    private int size;

    public DataItemSearchResult() {
    }

    public DataItemSearchResult(List<DataItemRow> list, long totalCount, int page, int size) {
        this.list = list;
        this.totalCount = totalCount;
        this.page = page;
        this.size = size;
    }

    public List<DataItemRow> getList() { return list; }
    public long getTotalCount() { return totalCount; }
    public int getPage() { return page; }
    public int getSize() { return size; }

    public void setList(List<DataItemRow> v) { this.list = v; }
    public void setTotalCount(long v) { this.totalCount = v; }
    public void setPage(int v) { this.page = v; }
    public void setSize(int v) { this.size = v; }
}
