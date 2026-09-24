package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** 마루 코드 헤더 — 이름·설명·계층 칸 수·라벨은 버전 밖 값이다(04 「경미 수정」). 상태·현재 버전·미적용은 계산값. */
public class CodeHeaderView {

    private String maruCodeId;
    private String maruCodeName;
    private String description;
    private int lvlCnt;
    private String sourceKind;
    /** 표시 상태(계산, I18). */
    private String status;
    /** TB_MDM_CODE.STATUS 저장값. */
    private String storedStatus;
    /** TB_MDM_CODE 감사 카운터 VER — 헤더 저장·폐기의 낙관적 잠금 값(I19). */
    private Long auditVer;
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
    private String currentVerLabel;
    private String unappliedLabel;

    public String getMaruCodeId() { return maruCodeId; }
    public String getMaruCodeName() { return maruCodeName; }
    public String getDescription() { return description; }
    public int getLvlCnt() { return lvlCnt; }
    public String getSourceKind() { return sourceKind; }
    public String getStatus() { return status; }
    public String getStoredStatus() { return storedStatus; }
    public Long getAuditVer() { return auditVer; }
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
    public String getCurrentVerLabel() { return currentVerLabel; }
    public String getUnappliedLabel() { return unappliedLabel; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setMaruCodeName(String v) { this.maruCodeName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setLvlCnt(int v) { this.lvlCnt = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setStatus(String v) { this.status = v; }
    public void setStoredStatus(String v) { this.storedStatus = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
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
    public void setCurrentVerLabel(String v) { this.currentVerLabel = v; }
    public void setUnappliedLabel(String v) { this.unappliedLabel = v; }
}
