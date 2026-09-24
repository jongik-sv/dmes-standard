package com.dongkuk.dmes.mdm.dma.domainMng.dto;

/** {@code domainMng} action={@code view} 요청(기능설계서 §5.2 행 선택, design.md §3.1). */
public class DomainMngViewRequest {

    private Long domainId;

    public Long getDomainId() { return domainId; }

    public void setDomainId(Long v) { this.domainId = v; }
}
