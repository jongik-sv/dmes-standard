package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/** {@code ruleMng} action={@code search} 요청 — 서버 페이징(TSK-08-02 design I29). */
public class RuleSearchRequest {

    /** 룰 ID(대소문자 무시) 또는 룰명 부분 일치. {@code %}·{@code _} 는 글자 그대로다. */
    private String keyword;

    /** DECISION·DERIVE. */
    private String ruleKind;

    /** 룰 상태 CREATED·INUSE·DEPRECATED. */
    private String status;

    /** 0 부터. 음수면 0. */
    private Integer page;

    /** 기본 20, 최대 100. */
    private Integer size;

    public String getKeyword() { return keyword; }
    public String getRuleKind() { return ruleKind; }
    public String getStatus() { return status; }
    public Integer getPage() { return page; }
    public Integer getSize() { return size; }

    public void setKeyword(String v) { this.keyword = v; }
    public void setRuleKind(String v) { this.ruleKind = v; }
    public void setStatus(String v) { this.status = v; }
    public void setPage(Integer v) { this.page = v; }
    public void setSize(Integer v) { this.size = v; }
}
