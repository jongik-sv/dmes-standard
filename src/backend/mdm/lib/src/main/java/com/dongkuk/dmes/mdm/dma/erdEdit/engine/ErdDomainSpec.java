package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

/** 도메인이 정하는 데이터 타입·길이·소수 자릿수. */
public record ErdDomainSpec(Long domainId, String domainName, String dataType, Integer length, Integer scale) {
}
