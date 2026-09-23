package com.dongkuk.dmes.mdm.dma.columnMng.dto;

/**
 * {@code columnMng} action={@code view} 요청(TSK-04-04 design.md §6.1).
 *
 * <p>BPMN serviceTask 의 {@code dto} 속성이 이 FQCN 을 가리키고 요청 봉투의 {@code params} 가 이 타입으로 바인딩된다.
 * getter/setter 일반 클래스다(record·Lombok 없음, TSK-04-04 design.md F11).
 */
public class ColumnMngViewRequest {

    private Long columnId;

    public Long getColumnId() { return columnId; }

    public void setColumnId(Long v) { this.columnId = v; }
}
