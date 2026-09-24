package com.dongkuk.dmes.mdm.dma.termRegPop.dto;

/**
 * {@code termRegPop} action={@code search} 요청 — 유사어·다음 의미 번호·약어 제안(TSK-04-04 design.md §6.2).
 *
 * <p>BPMN serviceTask 의 {@code dto} 속성이 이 FQCN 을 가리키고 요청 봉투의 {@code params} 가 이 타입으로 바인딩된다.
 * getter/setter 일반 클래스다(record·Lombok 없음, TSK-04-04 design.md F11).
 */
public class TermRegPopSearchRequest {

    private String termName;
    /** 선택. 있으면 약어 제안을 함께 돌려준다. */
    private String engName;

    public String getTermName() { return termName; }
    public String getEngName() { return engName; }

    public void setTermName(String v) { this.termName = v; }
    public void setEngName(String v) { this.engName = v; }
}
