package com.dongkuk.dmes.mdm.dma.columnMng.dto;

/**
 * {@code columnMng} action={@code view} 요청(TSK-04-04 design.md §6.1).
 *
 * <p>BPMN serviceTask 의 {@code dto} 속성이 이 FQCN 을 가리키고 요청 봉투의 {@code params} 가 이 타입으로 바인딩된다.
 * getter/setter 일반 클래스다(record·Lombok 없음, TSK-04-04 design.md F11).
 *
 * <p>컬럼은 {@code columnId} 또는 표준 물리명 {@code physName} 으로 찾는다. 둘 다 오면 {@code columnId} 가 이긴다.
 * {@code withDomain} 이 참이면 응답에 도메인 상세({@code domain} — 이름·표준명·상속 체인으로 조립한 타입·길이·소수·단위)를 싣는다.
 * 비우면 {@code physName} 으로 찾을 때만 싣는다(컬럼 정보 팝오버). {@code columnId} 조회는 기존 응답·SQL 문 수 그대로다.
 */
public class ColumnMngViewRequest {

    private Long columnId;
    private String physName;
    private Boolean withDomain;

    public Long getColumnId() { return columnId; }

    public void setColumnId(Long v) { this.columnId = v; }

    public String getPhysName() { return physName; }

    public void setPhysName(String v) { this.physName = v; }

    public Boolean getWithDomain() { return withDomain; }

    public void setWithDomain(Boolean v) { this.withDomain = v; }
}
