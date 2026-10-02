package com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto;

/** {@code ruleSetConfirm} action={@code search} 요청 params(D-144 2단계). keyword 는 세트 ID·세트명 부분 일치, 비면 전체. */
public class RuleSetConfirmSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
