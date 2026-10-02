package com.dongkuk.dmes.mdm.dma.columnMng.dto;

/**
 * {@code columnMng} action={@code search} 요청(TSK-04-04 design.md §6.1).
 *
 * <p>BPMN serviceTask 의 {@code dto} 속성이 이 FQCN 을 가리키고 요청 봉투의 {@code params} 가 이 타입으로 바인딩된다.
 * getter/setter 일반 클래스다(record·Lombok 없음, TSK-04-04 design.md F11).
 */
public class ColumnMngSearchRequest {

    /** 논리명·표준 물리명·시스템별 실제 필드명 부분 일치(대소문자 무시, I30). 비면 전체. */
    private String keyword;
    /** 도메인 ID·도메인명·표준명 부분 일치(대소문자 무시). 비면 전체. 콤보에 전체 도메인을 싣지 않으려고 키워드로 받는다. */
    private String domainKeyword;

    public String getKeyword() { return keyword; }
    public String getDomainKeyword() { return domainKeyword; }

    public void setKeyword(String v) { this.keyword = v; }
    public void setDomainKeyword(String v) { this.domainKeyword = v; }

    /** true 면 목록은 비우고 시스템 콤보 값만 돌려준다(화면 진입 시 서버 목록 조회를 피한다). */
    private boolean optionsOnly;

    public boolean isOptionsOnly() { return optionsOnly; }

    public void setOptionsOnly(boolean v) { this.optionsOnly = v; }
}
