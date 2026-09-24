package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** {@code codeEdit} DRAFT 한 건 대상 요청 — delete·lock·unlock·handover. 행위자는 요청 사용자이고 요청에서 받는 사람 ID 는 {@code newOwnerId} 뿐이다(I22). */
public class CodeDraftRequest {

    private String maruCodeId;
    /** "1.001". */
    private String ver;
    private Long rowVersion;
    /** 넘기기 대상. */
    private String newOwnerId;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getNewOwnerId() { return newOwnerId; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
}
