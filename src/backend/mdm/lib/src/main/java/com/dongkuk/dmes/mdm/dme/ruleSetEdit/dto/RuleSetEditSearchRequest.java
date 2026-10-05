package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * {@code ruleSetEdit} action={@code search} 요청(TSK-08-06 design §6.6-1). 새 action 은 mcm 시드 어휘 밖이라 search 안에서 {@code target} 으로 가른다.
 */
public class RuleSetEditSearchRequest {

    /** SET(기본 — 세트 고르기)·RULE(룰 추가 후보 + 입출력)·GUIDE(구성 지침)·CALL_IO(하위 세트 겉모양)·CALLERS(이 세트를 부르는 세트). */
    private String target;
    /** SET·RULE 의 검색어. */
    private String keyword;
    /** GUIDE 의 대상 결과 변수(필수). */
    private String resultVar;
    /** CALLERS 의 대상 세트 ID(필수). */
    private String setId;
    /** CALL_IO 의 세트 ID 목록(JSON 배열 문자열 — OASIS params 는 List 칸을 묶지 못한다). 비면 빈 결과. */
    private String setIdsJson;

    public String getTarget() { return target; }
    public String getKeyword() { return keyword; }
    public String getResultVar() { return resultVar; }
    public String getSetId() { return setId; }
    public String getSetIdsJson() { return setIdsJson; }

    public void setTarget(String v) { this.target = v; }
    public void setKeyword(String v) { this.keyword = v; }
    public void setResultVar(String v) { this.resultVar = v; }
    public void setSetId(String v) { this.setId = v; }
    public void setSetIdsJson(String v) { this.setIdsJson = v; }
}
