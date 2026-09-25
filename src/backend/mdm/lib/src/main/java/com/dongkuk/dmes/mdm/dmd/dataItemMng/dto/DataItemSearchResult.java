package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

import java.util.List;

/** {@code dataItemMng} action={@code search} 응답 — 한 쪽과 모든 필터 뒤 총 건수(Q3). */
public class DataItemSearchResult {

    private List<DataItemRow> list;
    private long totalCount;
    private int page;
    private int size;
    /** {@code withTree} 요청일 때만 채운다(열린 행만, I6). 아니면 null. */
    private List<DataItemRow> tree;
    /** 트리가 {@code TREE_MAX} 상한에 걸려 잘렸으면 true. */
    private boolean treeTruncated;

    public DataItemSearchResult() {
    }

    public DataItemSearchResult(List<DataItemRow> list, long totalCount, int page, int size) {
        this(list, totalCount, page, size, null, false);
    }

    public DataItemSearchResult(List<DataItemRow> list, long totalCount, int page, int size, List<DataItemRow> tree,
                                boolean treeTruncated) {
        this.list = list;
        this.totalCount = totalCount;
        this.page = page;
        this.size = size;
        this.tree = tree;
        this.treeTruncated = treeTruncated;
    }

    public List<DataItemRow> getList() { return list; }
    public long getTotalCount() { return totalCount; }
    public int getPage() { return page; }
    public int getSize() { return size; }
    public List<DataItemRow> getTree() { return tree; }
    public boolean isTreeTruncated() { return treeTruncated; }

    public void setList(List<DataItemRow> v) { this.list = v; }
    public void setTotalCount(long v) { this.totalCount = v; }
    public void setPage(int v) { this.page = v; }
    public void setSize(int v) { this.size = v; }
    public void setTree(List<DataItemRow> v) { this.tree = v; }
    public void setTreeTruncated(boolean v) { this.treeTruncated = v; }
}
