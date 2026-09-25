package com.dongkuk.dmes.mdm.dme.ruleSetMng.dto;

/** {@code ruleSetMng} action={@code search} 요청 — 조건 넷과 서버 페이징(TSK-08-06 design §6.7). 빈 값은 조건 없음이다. */
public class RuleSetSearchRequest {

    /** 세트 ID(대소문자 무시) 또는 세트명 부분 일치. */
    private String keyword;

    /** 담은 룰 ID 부분 일치(대소문자 무시) — 멤버 룰 가운데 하나라도. */
    private String ruleId;

    /** 결과 변수 정확 일치(대소문자 무시) — 멤버 룰의 결과(중간 결과 포함). */
    private String resultVar;

    /** INUSE·DEPRECATED. */
    private String status;

    /** 0 부터. 음수면 0. */
    private Integer page;

    /** 기본 20, 최대 100. */
    private Integer size;

    public String getKeyword() { return keyword; }
    public String getRuleId() { return ruleId; }
    public String getResultVar() { return resultVar; }
    public String getStatus() { return status; }
    public Integer getPage() { return page; }
    public Integer getSize() { return size; }

    public void setKeyword(String v) { this.keyword = v; }
    public void setRuleId(String v) { this.ruleId = v; }
    public void setResultVar(String v) { this.resultVar = v; }
    public void setStatus(String v) { this.status = v; }
    public void setPage(Integer v) { this.page = v; }
    public void setSize(Integer v) { this.size = v; }
}
