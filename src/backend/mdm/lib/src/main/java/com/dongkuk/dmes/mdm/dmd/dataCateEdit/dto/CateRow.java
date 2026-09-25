package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

/**
 * 카테고리 목록 한 행 — 정의(REGEX/TABLE)·열림 여부·매칭(또는 소속) 건수(R5 — 닫힌 카테고리는 항상 0,
 * 열린 항목만 대상). BASE 는 {@code cateId="BASE"} 로 식별한다(편집·닫기 버튼은 화면이 숨긴다, R6).
 */
public class CateRow {

    private String cateId;
    private String cateName;
    private String defKind;
    private String defExpr;
    private String defTarget;
    private String description;
    private boolean open;
    private int matchCount;

    public String getCateId() { return cateId; }
    public String getCateName() { return cateName; }
    public String getDefKind() { return defKind; }
    public String getDefExpr() { return defExpr; }
    public String getDefTarget() { return defTarget; }
    public String getDescription() { return description; }
    public boolean isOpen() { return open; }
    public int getMatchCount() { return matchCount; }

    public void setCateId(String v) { this.cateId = v; }
    public void setCateName(String v) { this.cateName = v; }
    public void setDefKind(String v) { this.defKind = v; }
    public void setDefExpr(String v) { this.defExpr = v; }
    public void setDefTarget(String v) { this.defTarget = v; }
    public void setDescription(String v) { this.description = v; }
    public void setOpen(boolean v) { this.open = v; }
    public void setMatchCount(int v) { this.matchCount = v; }
}
