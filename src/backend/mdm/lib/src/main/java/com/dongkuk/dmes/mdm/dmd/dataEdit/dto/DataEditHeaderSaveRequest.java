package com.dongkuk.dmes.mdm.dmd.dataEdit.dto;

/**
 * {@code dataEdit} action={@code save} 요청 — 헤더+키 패턴+라벨+lvl_cnt 를 한 액션으로 묶는다(D3, 04
 * {@code CodeEditService.saveHeader} 선례). {@code auditVer} 는 낙관적 잠금 비교값(F9).
 */
public class DataEditHeaderSaveRequest {

    private String maruDataId;
    private Long auditVer;
    private String maruDataName;
    private String description;
    private String codePattern;
    private Integer lvlCnt;
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

    public String getMaruDataId() { return maruDataId; }
    public Long getAuditVer() { return auditVer; }
    public String getMaruDataName() { return maruDataName; }
    public String getDescription() { return description; }
    public String getCodePattern() { return codePattern; }
    public Integer getLvlCnt() { return lvlCnt; }
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

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
    public void setMaruDataName(String v) { this.maruDataName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setCodePattern(String v) { this.codePattern = v; }
    public void setLvlCnt(Integer v) { this.lvlCnt = v; }
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
}
