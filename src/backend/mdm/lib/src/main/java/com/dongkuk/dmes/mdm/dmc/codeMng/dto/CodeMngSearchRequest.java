package com.dongkuk.dmes.mdm.dmc.codeMng.dto;

/** {@code codeMng} action={@code search} 요청 — TSK-06-02 design.md §6.7. */
public class CodeMngSearchRequest {

    /** 마루 코드 ID(대소문자 무시)·이름 부분 일치. */
    private String keyword;
    /** 계산 상태(CREATED/INUSE/DEPRECATED). 비면 전체. */
    private String status;

    public String getKeyword() { return keyword; }
    public String getStatus() { return status; }

    public void setKeyword(String v) { this.keyword = v; }
    public void setStatus(String v) { this.status = v; }
}
