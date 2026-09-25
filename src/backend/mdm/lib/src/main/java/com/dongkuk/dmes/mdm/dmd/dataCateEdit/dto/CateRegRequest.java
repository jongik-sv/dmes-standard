package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

/** {@code dataCateEdit} action={@code reg} 요청 — 새 카테고리 등록(REGEX 또는 TABLE, BASE 는 등록 대상이 아니다). */
public class CateRegRequest {

    private String maruDataId;
    private String cateId;
    private String cateName;
    private String defKind;
    private String defExpr;
    private String defTarget;
    private String description;

    public String getMaruDataId() { return maruDataId; }
    public String getCateId() { return cateId; }
    public String getCateName() { return cateName; }
    public String getDefKind() { return defKind; }
    public String getDefExpr() { return defExpr; }
    public String getDefTarget() { return defTarget; }
    public String getDescription() { return description; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setCateName(String v) { this.cateName = v; }
    public void setDefKind(String v) { this.defKind = v; }
    public void setDefExpr(String v) { this.defExpr = v; }
    public void setDefTarget(String v) { this.defTarget = v; }
    public void setDescription(String v) { this.description = v; }
}
