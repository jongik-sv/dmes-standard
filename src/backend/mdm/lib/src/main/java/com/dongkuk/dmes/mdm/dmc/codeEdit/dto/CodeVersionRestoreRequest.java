package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** {@code codeEdit} action={@code restore}(method=restoreVersion) 요청 — 원본 RELEASED 버전 내용으로 채운 새 버전. */
public class CodeVersionRestoreRequest {

    private String maruCodeId;
    /** MAJOR / MINOR. */
    private String verKind;
    /** 원본 버전 번호("1.000"). */
    private String sourceVer;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVerKind() { return verKind; }
    public String getSourceVer() { return sourceVer; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setSourceVer(String v) { this.sourceVer = v; }
}
