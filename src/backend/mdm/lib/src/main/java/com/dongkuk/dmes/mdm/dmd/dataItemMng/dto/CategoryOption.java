package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** 열린 카테고리 선택지 — 항목 관리 카테고리 필터(Q4). */
public class CategoryOption {

    private String cateId;
    private String cateName;
    private String defKind;

    public CategoryOption() {
    }

    public CategoryOption(String cateId, String cateName, String defKind) {
        this.cateId = cateId;
        this.cateName = cateName;
        this.defKind = defKind;
    }

    public String getCateId() { return cateId; }
    public String getCateName() { return cateName; }
    public String getDefKind() { return defKind; }

    public void setCateId(String v) { this.cateId = v; }
    public void setCateName(String v) { this.cateName = v; }
    public void setDefKind(String v) { this.defKind = v; }
}
