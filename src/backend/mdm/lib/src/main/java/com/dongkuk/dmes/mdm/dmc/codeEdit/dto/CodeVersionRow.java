package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** 버전 목록 한 행(ver 내림차순). 일시는 {@code 'yyyy-MM-dd HH:mm:ss'}(KST). */
public class CodeVersionRow {

    /** "1.000". */
    private String ver;
    /** "v1.000". */
    private String verLabel;
    private String verKind;
    private String status;
    private String ownerId;
    private String applyFrom;
    private String applyTo;
    private String releasedAt;
    private String restoredFrom;
    /** "v1.000 복원" 또는 null. */
    private String restoredLabel;
    private long rowVersion;
    private boolean unapplied;
    private String description;

    public String getVer() { return ver; }
    public String getVerLabel() { return verLabel; }
    public String getVerKind() { return verKind; }
    public String getStatus() { return status; }
    public String getOwnerId() { return ownerId; }
    public String getApplyFrom() { return applyFrom; }
    public String getApplyTo() { return applyTo; }
    public String getReleasedAt() { return releasedAt; }
    public String getRestoredFrom() { return restoredFrom; }
    public String getRestoredLabel() { return restoredLabel; }
    public long getRowVersion() { return rowVersion; }
    public boolean isUnapplied() { return unapplied; }
    public String getDescription() { return description; }

    public void setVer(String v) { this.ver = v; }
    public void setVerLabel(String v) { this.verLabel = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setStatus(String v) { this.status = v; }
    public void setOwnerId(String v) { this.ownerId = v; }
    public void setApplyFrom(String v) { this.applyFrom = v; }
    public void setApplyTo(String v) { this.applyTo = v; }
    public void setReleasedAt(String v) { this.releasedAt = v; }
    public void setRestoredFrom(String v) { this.restoredFrom = v; }
    public void setRestoredLabel(String v) { this.restoredLabel = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
    public void setUnapplied(boolean v) { this.unapplied = v; }
    public void setDescription(String v) { this.description = v; }
}
