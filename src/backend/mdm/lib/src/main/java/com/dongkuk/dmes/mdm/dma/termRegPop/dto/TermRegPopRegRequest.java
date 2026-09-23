package com.dongkuk.dmes.mdm.dma.termRegPop.dto;

/**
 * {@code termRegPop} action={@code reg} 요청 — 용어 인라인 등록(TSK-04-04 design.md §6.2·§6.13).
 *
 * <p>BPMN serviceTask 의 {@code dto} 속성이 이 FQCN 을 가리키고 요청 봉투의 {@code params} 가 이 타입으로 바인딩된다.
 * getter/setter 일반 클래스다(record·Lombok 없음, TSK-04-04 design.md F11).
 */
public class TermRegPopRegRequest {

    private String termName;
    private Integer senseNo;
    private String definition;
    private String context;
    private String engName;
    private String engAbbr;

    public String getTermName() { return termName; }
    public Integer getSenseNo() { return senseNo; }
    public String getDefinition() { return definition; }
    public String getContext() { return context; }
    public String getEngName() { return engName; }
    public String getEngAbbr() { return engAbbr; }

    public void setTermName(String v) { this.termName = v; }
    public void setSenseNo(Integer v) { this.senseNo = v; }
    public void setDefinition(String v) { this.definition = v; }
    public void setContext(String v) { this.context = v; }
    public void setEngName(String v) { this.engName = v; }
    public void setEngAbbr(String v) { this.engAbbr = v; }
}
