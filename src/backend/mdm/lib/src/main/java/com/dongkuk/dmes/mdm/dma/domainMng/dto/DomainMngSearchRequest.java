package com.dongkuk.dmes.mdm.dma.domainMng.dto;

/**
 * {@code domainMng} action={@code search} 요청(기능설계서 §3 S-001·S-002, design.md §3.1).
 * 빈 값은 조건을 적용하지 않는다.
 */
public class DomainMngSearchRequest {

    /** 도메인명·표준명 부분 일치(대소문자 무시). */
    private String keyword;

    /** 종류(LV-001) 정확 일치. 빈 값 = 전체. */
    private String domainKind;

    public String getKeyword() { return keyword; }
    public String getDomainKind() { return domainKind; }

    public void setKeyword(String v) { this.keyword = v; }
    public void setDomainKind(String v) { this.domainKind = v; }
}
