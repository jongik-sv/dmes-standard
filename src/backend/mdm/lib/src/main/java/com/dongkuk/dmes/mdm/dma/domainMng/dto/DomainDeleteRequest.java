package com.dongkuk.dmes.mdm.dma.domainMng.dto;

/** {@code domainMng} action={@code delete} 요청 — 지울 도메인과 화면이 읽은 행 버전(동시 수정 검사). */
public class DomainDeleteRequest {

    private Long domainId;
    private Long ver;

    public Long getDomainId() { return domainId; }

    public void setDomainId(Long v) { this.domainId = v; }

    public Long getVer() { return ver; }

    public void setVer(Long v) { this.ver = v; }
}
