package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * {@code ruleSetEdit} action={@code search} 요청(TSK-08-06 design §6.6-1). 새 action 은 mcm 시드 어휘 밖이라 search 안에서 {@code target} 으로 가른다.
 */
public class RuleSetEditSearchRequest {

    /** SET(기본 — 세트 고르기)·RULE(룰 추가 후보 + 입출력)·GUIDE(구성 지침). */
    private String target;
    /** SET·RULE 의 검색어. */
    private String keyword;
    /** GUIDE 의 대상 결과 변수(필수). */
    private String resultVar;

    public String getTarget() { return target; }
    public String getKeyword() { return keyword; }
    public String getResultVar() { return resultVar; }

    public void setTarget(String v) { this.target = v; }
    public void setKeyword(String v) { this.keyword = v; }
    public void setResultVar(String v) { this.resultVar = v; }
}
