package com.dongkuk.dmes.mdm.dmc.codeConfirm.dto;

/** {@code codeConfirm} action={@code search} 요청 params(TSK-06-05 design.md §6.5). keyword 는 ID·이름 부분 일치, 비면 전체. */
public class CodeConfirmSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
