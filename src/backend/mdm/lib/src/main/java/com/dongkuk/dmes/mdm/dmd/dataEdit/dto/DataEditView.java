package com.dongkuk.dmes.mdm.dmd.dataEdit.dto;

import java.util.List;

/** {@code dataEdit} 응답 공통 모양(view·save·delete 가 모두 이 타입을 돌려준다, codeEdit 의 {@code CodeEditView} 선례). */
public class DataEditView {

    private String maruDataId;
    private String maruDataName;
    private String description;
    private String codePattern;
    private String status;
    private String sourceKind;
    private int lvlCnt;
    private String attr01Name;
    private String attr02Name;
    private String attr03Name;
    private String attr04Name;
    private String attr05Name;
    private String attr06Name;
    private String attr07Name;
    private String attr08Name;
    private String attr09Name;
    private String attr10Name;
    /** 애플리케이션 낙관적 잠금 비교값(F9, {@code CactusAuditEntity.VER}). */
    private Long auditVer;
    /** MDM 원천이고 INUSE 일 때만 true. */
    private boolean editable;
    private List<CategorySummaryRow> categories;

    public String getMaruDataId() { return maruDataId; }
    public String getMaruDataName() { return maruDataName; }
    public String getDescription() { return description; }
    public String getCodePattern() { return codePattern; }
    public String getStatus() { return status; }
    public String getSourceKind() { return sourceKind; }
    public int getLvlCnt() { return lvlCnt; }
    public String getAttr01Name() { return attr01Name; }
    public String getAttr02Name() { return attr02Name; }
    public String getAttr03Name() { return attr03Name; }
    public String getAttr04Name() { return attr04Name; }
    public String getAttr05Name() { return attr05Name; }
    public String getAttr06Name() { return attr06Name; }
    public String getAttr07Name() { return attr07Name; }
    public String getAttr08Name() { return attr08Name; }
    public String getAttr09Name() { return attr09Name; }
    public String getAttr10Name() { return attr10Name; }
    public Long getAuditVer() { return auditVer; }
    public boolean isEditable() { return editable; }
    public List<CategorySummaryRow> getCategories() { return categories; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setCodePattern(String v) { this.codePattern = v; }
    public void setStatus(String v) { this.status = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setLvlCnt(int v) { this.lvlCnt = v; }
    public void setAttr01Name(String v) { this.attr01Name = v; }
    public void setAttr02Name(String v) { this.attr02Name = v; }
    public void setAttr03Name(String v) { this.attr03Name = v; }
    public void setAttr04Name(String v) { this.attr04Name = v; }
    public void setAttr05Name(String v) { this.attr05Name = v; }
    public void setAttr06Name(String v) { this.attr06Name = v; }
    public void setAttr07Name(String v) { this.attr07Name = v; }
    public void setAttr08Name(String v) { this.attr08Name = v; }
    public void setAttr09Name(String v) { this.attr09Name = v; }
    public void setAttr10Name(String v) { this.attr10Name = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
    public void setEditable(boolean v) { this.editable = v; }
    public void setCategories(List<CategorySummaryRow> v) { this.categories = v; }
}
