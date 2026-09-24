package com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto;

/**
 * {@code codeItemEdit} action={@code validate·save} 요청 params(TSK-06-03 design.md §6.6). 그리드 {@code rows} 는 메서드 파라미터로 따로 받는다(F9). validate 는 rowVersion 을 보지 않는다.
 * getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class CodeItemSaveRequest {

    private String maruCodeId;
    private String ver;
    private Long rowVersion;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
}
