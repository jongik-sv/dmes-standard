package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

/** {@code ruleEdit} action={@code search} 요청 — 상단 룰 고르기(룰 ID·룰명 앞부분, 20건). */
public class RuleEditSearchRequest {

    private String keyword;

    /** RULE(기본 — 룰 고르기)·DOMAIN(값 타입 도메인 검색, TSK-08-03). 새 action 은 mcm 시드 어휘 밖이라 search 안에서 가른다. */
    private String target;

    public String getKeyword() { return keyword; }

    public String getTarget() { return target; }

    public void setTarget(String v) { this.target = v; }

    public void setKeyword(String v) { this.keyword = v; }
}
