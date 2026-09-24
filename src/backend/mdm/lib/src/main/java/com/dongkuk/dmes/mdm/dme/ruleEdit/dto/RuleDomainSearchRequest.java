package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

/**
 * {@code ruleEdit} action={@code searchDomains} 요청(TSK-08-03) — 열 설정의 값 타입 도메인 검색 위젯.
 * domainMng {@code search} 는 조상을 함께 돌려주는 트리 응답이라 평면 8건이 필요한 위젯에 맞지 않아 이 갈래를 뒀다(design 이탈란).
 */
public class RuleDomainSearchRequest {

    /** 표준명 앞부분 일치 우선, 나머지는 표준명·도메인명 부분 일치. */
    private String keyword;

    public String getKeyword() { return keyword; }

    public void setKeyword(String v) { this.keyword = v; }
}
