package com.dongkuk.dmes.mdm.dma.columnMng.dto;

/**
 * {@code columnMng} action={@code compare} 요청 — 분해·역분해·중복 검사·도메인 추천(TSK-04-04 design.md §6.1, D6).
 *
 * <p>BPMN serviceTask 의 {@code dto} 속성이 이 FQCN 을 가리키고 요청 봉투의 {@code params} 가 이 타입으로 바인딩된다.
 * getter/setter 일반 클래스다(record·Lombok 없음, TSK-04-04 design.md F11).
 */
public class ColumnMngCompareRequest {

    /** {@code FORWARD}(한국어 → 물리명) 또는 {@code REVERSE}(물리명 → 논리명). 비면 FORWARD. */
    private String direction;
    private String input;

    public String getDirection() { return direction; }
    public String getInput() { return input; }

    public void setDirection(String v) { this.direction = v; }
    public void setInput(String v) { this.input = v; }
}
