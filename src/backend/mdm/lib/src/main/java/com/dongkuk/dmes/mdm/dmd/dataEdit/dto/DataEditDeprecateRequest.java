package com.dongkuk.dmes.mdm.dmd.dataEdit.dto;

/** {@code dataEdit} action={@code delete}(폐기) 요청. */
public class DataEditDeprecateRequest {

    private String maruDataId;
    private Long auditVer;

    public String getMaruDataId() { return maruDataId; }
    public Long getAuditVer() { return auditVer; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
}
