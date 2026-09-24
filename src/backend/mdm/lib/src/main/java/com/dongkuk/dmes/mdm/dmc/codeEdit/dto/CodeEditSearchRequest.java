package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/** {@code codeEdit} action={@code search} 요청 — 코드 선택 콤보 데이터(TSK-06-02 design.md §6.8). */
public class CodeEditSearchRequest {

    /** ID·이름 부분 일치. 비면 전체. */
    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
