package com.dongkuk.dmes.mdm.dmc.codeCateEdit.dto;

/**
 * {@code codeCateEdit} action={@code search} 요청 params(TSK-06-04 design.md §2). 마루 코드 목록 조회. keyword 는 ID·이름
 * 부분 일치(대소문자 무시), 비면 전체. getter/setter 일반 클래스다(record·Lombok 없음 — OASIS dto 바인딩 관례).
 */
public class CodeCateSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
