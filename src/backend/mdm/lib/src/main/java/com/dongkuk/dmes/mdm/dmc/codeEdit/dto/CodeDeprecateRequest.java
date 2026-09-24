package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** {@code codeEdit} action={@code execute}(method=deprecate) 요청. */
public class CodeDeprecateRequest {

    private String maruCodeId;
    private Long auditVer;

    public String getMaruCodeId() { return maruCodeId; }
    public Long getAuditVer() { return auditVer; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
}
