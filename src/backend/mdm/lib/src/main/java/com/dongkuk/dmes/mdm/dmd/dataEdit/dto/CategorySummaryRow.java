package com.dongkuk.dmes.mdm.dmd.dataEdit.dto;

/**
 * dataEdit 머리 카드의 카테고리 요약 한 줄(design.md §2·§4 "카드4 매칭 건수"). {@code matchCount} 는 카테고리가 닫혀
 * 있으면 항상 0(R5) — TABLE 은 열린 소속 코드 수, REGEX(BASE 포함)는 열린 항목 중 매칭 수다.
 */
public class CategorySummaryRow {

    private String cateId;
    private String cateName;
    private String defKind;
    private boolean open;
    private int matchCount;

    public CategorySummaryRow() {
    }

    public CategorySummaryRow(String cateId, String cateName, String defKind, boolean open, int matchCount) {
        this.cateId = cateId;
        this.cateName = cateName;
        this.defKind = defKind;
        this.open = open;
        this.matchCount = matchCount;
    }

    public String getCateId() { return cateId; }
    public String getCateName() { return cateName; }
    public String getDefKind() { return defKind; }
    public boolean isOpen() { return open; }
    public int getMatchCount() { return matchCount; }

    public void setCateId(String v) { this.cateId = v; }
    public void setCateName(String v) { this.cateName = v; }
    public void setDefKind(String v) { this.defKind = v; }
    public void setOpen(boolean v) { this.open = v; }
    public void setMatchCount(int v) { this.matchCount = v; }
}
