package com.dongkuk.dmes.mdm.dme.ruleConfirm.dto;

/** {@code ruleConfirm} action={@code search} 요청 params(TSK-08-05 design §6.5). keyword 는 룰 ID·룰명 부분 일치, 비면 전체. */
public class RuleConfirmSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
