package com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto;

/** {@code layoutConfirm} action={@code search} 요청 params(D-144 3단계). keyword 는 레이아웃 이름(부분 일치)·ID. 비면 전체 DRAFT. */
public class LayoutConfirmSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
