package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

import java.util.List;

/** 마루 데이터 머리 정보 — 동적 열(Q5)과 편집 가능 여부(Q6)의 근거. */
public class DataItemHeader {

    private String maruDataId;
    private String maruDataName;
    private String status;
    private String sourceKind;
    private String sourceSystem;
    /** 계층 칸 수 0~5 — 계층 열은 1차~lvlCnt차(Q5). */
    private int lvlCnt;
    /** 라벨이 있는 추가 컬럼만 번호 순(Q5). */
    private List<AttrLabel> attrLabels;
    /** MDM 원천이고 INUSE 일 때만 true(Q6). */
    private boolean editable;
    /** 열린 카테고리(BASE 먼저). */
    private List<CategoryOption> categories;

    public DataItemHeader() {
    }

    public DataItemHeader(String maruDataId, String maruDataName, String status, String sourceKind, String sourceSystem, int lvlCnt, List<AttrLabel> attrLabels, boolean editable, List<CategoryOption> categories) {
        this.maruDataId = maruDataId;
        this.maruDataName = maruDataName;
        this.status = status;
        this.sourceKind = sourceKind;
        this.sourceSystem = sourceSystem;
        this.lvlCnt = lvlCnt;
        this.attrLabels = attrLabels;
        this.editable = editable;
        this.categories = categories;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public String getStatus() { return status; }
    public String getSourceKind() { return sourceKind; }
    public String getSourceSystem() { return sourceSystem; }
    public int getLvlCnt() { return lvlCnt; }
    public List<AttrLabel> getAttrLabels() { return attrLabels; }
    public boolean isEditable() { return editable; }
    public List<CategoryOption> getCategories() { return categories; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setStatus(String v) { this.status = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setSourceSystem(String v) { this.sourceSystem = v; }
    public void setLvlCnt(int v) { this.lvlCnt = v; }
    public void setAttrLabels(List<AttrLabel> v) { this.attrLabels = v; }
    public void setEditable(boolean v) { this.editable = v; }
    public void setCategories(List<CategoryOption> v) { this.categories = v; }
}
