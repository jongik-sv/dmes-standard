package com.dongkuk.dmes.mdm.dma.naming;

/** 도메인 추천에 쓰는 도메인 한 건(TB_MDM_DOMAIN 의 필요한 칸만). */
public record DomainEntry(Long domainId, String domainName, String stdName) {
}
