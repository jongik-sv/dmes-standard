package com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto;

/**
 * {@code codeItemEdit} action={@code restore} 요청 params(TSK-06-03 design.md §6.6). 코드 한 건의 V 변경 되돌리기.
 * getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class CodeItemRevertRequest {

    private String maruCodeId;
    private String ver;
    private Long rowVersion;
    private String code;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getCode() { return code; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setCode(String v) { this.code = v; }
}
