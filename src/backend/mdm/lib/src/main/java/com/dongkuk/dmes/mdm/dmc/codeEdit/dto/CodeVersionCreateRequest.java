package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** {@code codeEdit} action={@code reg}(method=createVersion) 요청 — 빈 새 버전. */
public class CodeVersionCreateRequest {

    private String maruCodeId;
    /** MAJOR / MINOR. */
    private String verKind;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVerKind() { return verKind; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVerKind(String v) { this.verKind = v; }
}
