package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

/** {@code ruleEdit} action={@code search} 요청 — 상단 룰 고르기(룰 ID·룰명 앞부분, 20건). */
public class RuleEditSearchRequest {

    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
