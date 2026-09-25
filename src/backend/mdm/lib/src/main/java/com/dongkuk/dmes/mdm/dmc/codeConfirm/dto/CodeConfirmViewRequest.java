package com.dongkuk.dmes.mdm.dmc.codeConfirm.dto;

/**
 * {@code codeConfirm} action={@code view} 요청 params(TSK-06-05 design.md §6.5). ver 는 문자열({@code "1.001"}), 비면 DRAFT.
 * getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class CodeConfirmViewRequest {

    private String maruCodeId;
    private String ver;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
}
