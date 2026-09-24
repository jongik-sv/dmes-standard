package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** {@code codeEdit} action={@code save}(method=saveHeader) 요청 — 헤더 경미 수정. */
public class CodeHeaderSaveRequest {

    private String maruCodeId;
    private Long auditVer;
    private String maruCodeName;
    private String description;
    /** 비면 지금 값 유지. */
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

    public String getMaruCodeId() { return maruCodeId; }
    public Long getAuditVer() { return auditVer; }
    public String getMaruCodeName() { return maruCodeName; }
    public String getDescription() { return description; }
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

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
    public void setMaruCodeName(String v) { this.maruCodeName = v; }
    public void setDescription(String v) { this.description = v; }
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
