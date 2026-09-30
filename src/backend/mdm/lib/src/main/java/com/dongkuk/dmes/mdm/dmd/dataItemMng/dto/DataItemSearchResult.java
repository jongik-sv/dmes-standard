package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

import java.util.List;

/** {@code dataItemMng} action={@code search} 응답 — 한 쪽과 모든 필터 뒤 총 건수(Q3). */
public class DataItemSearchResult {

    private List<DataItemRow> list;
    private long totalCount;
    private int page;
    private int size;
    /**
     * 목록이 {@code ITEMS_MAX} 상한에 걸려 잘렸으면 true — {@code totalCount}(필터 뒤 전체 수)가 {@code list} 보다
     * 클 때만 참이다. 화면은 이 값으로 "일부만 표시 중" 안내를 낸다(조용히 자르지 않는다).
     */
    private boolean truncated;
    /** {@code withTree} 요청일 때만 채운다(열린 행만, I6). 아니면 null. */
    private List<DataItemRow> tree;
    /** 트리가 {@code TREE_MAX} 상한에 걸려 잘렸으면 true. */
    private boolean treeTruncated;

    public DataItemSearchResult() {
    }

    public DataItemSearchResult(List<DataItemRow> list, long totalCount, int page, int size) {
        this(list, totalCount, page, size, false, null, false);
    }

    public DataItemSearchResult(List<DataItemRow> list, long totalCount, int page, int size, boolean truncated,
                                List<DataItemRow> tree, boolean treeTruncated) {
        this.list = list;
        this.totalCount = totalCount;
        this.page = page;
        this.size = size;
        this.truncated = truncated;
        this.tree = tree;
        this.treeTruncated = treeTruncated;
    }

    public List<DataItemRow> getList() { return list; }
    public long getTotalCount() { return totalCount; }
    public int getPage() { return page; }
    public int getSize() { return size; }
    public boolean isTruncated() { return truncated; }
    public List<DataItemRow> getTree() { return tree; }
    public boolean isTreeTruncated() { return treeTruncated; }

    public void setList(List<DataItemRow> v) { this.list = v; }
    public void setTotalCount(long v) { this.totalCount = v; }
    public void setPage(int v) { this.page = v; }
    public void setSize(int v) { this.size = v; }
    public void setTruncated(boolean v) { this.truncated = v; }
    public void setTree(List<DataItemRow> v) { this.tree = v; }
    public void setTreeTruncated(boolean v) { this.treeTruncated = v; }
}
