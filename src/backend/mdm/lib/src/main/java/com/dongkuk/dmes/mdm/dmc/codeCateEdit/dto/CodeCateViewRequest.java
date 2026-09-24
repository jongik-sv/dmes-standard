package com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto;

/**
 * {@code codeCateEdit} action={@code view} 요청 params(TSK-06-04 design.md §2). 버전 V 의 카테고리 모습. ver 는
 * 문자열({@code "2.000"}), 비면 기본 버전(DRAFT → CANCELLED 아닌 최대). getter/setter 일반 클래스다(record·Lombok 없음 —
 * OASIS dto 바인딩 관례).
 */
public class CodeCateViewRequest {

    private String maruCodeId;
    private String ver;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
}
