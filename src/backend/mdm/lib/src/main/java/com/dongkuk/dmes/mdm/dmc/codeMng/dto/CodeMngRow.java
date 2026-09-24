package com.dongkuk.dmes.mdm.dmc.codeMng.dto;

/** {@code codeMng} 목록 한 행 — 현재 버전·미적용·상태는 계산값이다(불변 규칙 I17·I18). */
public class CodeMngRow {

    private String maruCodeId;
    private String maruCodeName;
    private String sourceKind;
    /** 표시 상태(계산). */
    private String status;
    /** TB_MDM_CODE.STATUS 저장값. */
    private String storedStatus;
    /** 현재 적용 버전 번호("1.001")·없으면 null. */
    private String currentVer;
    /** "v1.001" / "배포 대기 v1.000" / "미확정". */
    private String currentVerLabel;
    private boolean pending;
    /** "없음" / "v1.000 DRAFT" … */
    private String unappliedLabel;
    private int unappliedCount;

    public String getMaruCodeId() { return maruCodeId; }
    public String getMaruCodeName() { return maruCodeName; }
    public String getSourceKind() { return sourceKind; }
    public String getStatus() { return status; }
    public String getStoredStatus() { return storedStatus; }
    public String getCurrentVer() { return currentVer; }
    public String getCurrentVerLabel() { return currentVerLabel; }
    public boolean isPending() { return pending; }
    public String getUnappliedLabel() { return unappliedLabel; }
    public int getUnappliedCount() { return unappliedCount; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setMaruCodeName(String v) { this.maruCodeName = v; }
    public void setSourceKind(String v) { this.sourceKind = v; }
    public void setStatus(String v) { this.status = v; }
    public void setStoredStatus(String v) { this.storedStatus = v; }
    public void setCurrentVer(String v) { this.currentVer = v; }
    public void setCurrentVerLabel(String v) { this.currentVerLabel = v; }
    public void setPending(boolean v) { this.pending = v; }
    public void setUnappliedLabel(String v) { this.unappliedLabel = v; }
    public void setUnappliedCount(int v) { this.unappliedCount = v; }
}
