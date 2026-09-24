package com.dongkuk.dmes.mdm.dmc.codeItemEdit.dto;

/**
 * {@code codeItemEdit} action={@code compare} 요청 params(TSK-06-03 design.md §6.6). 카테고리 미리보기(저장된 정의 기준, D11).
 * getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class CodeItemPreviewRequest {

    private String maruCodeId;
    private String ver;
    private String cateId;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public String getCateId() { return cateId; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setCateId(String v) { this.cateId = v; }
}
