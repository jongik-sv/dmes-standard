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
    /** 도메인 필터. null 이면 전체. */
    private Long domainId;

    public String getKeyword() { return keyword; }
    public Long getDomainId() { return domainId; }

    public void setKeyword(String v) { this.keyword = v; }
    public void setDomainId(Long v) { this.domainId = v; }
}
