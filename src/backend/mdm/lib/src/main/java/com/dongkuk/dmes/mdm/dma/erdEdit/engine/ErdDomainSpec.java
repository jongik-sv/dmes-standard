package com.dongkuk.dmes.mdm.dma.erdEdit.engine;

/**
 * 도메인이 정하는 데이터 타입·길이·소수 자릿수. 세 값은 상속 체인으로 조립한 유효값이다(타입은 최상위, 길이·소수는 가장 가까운
 * non-null — {@code ErdDictionaryLoader.specs}). 체인이 순환하면 그 도메인 행의 원값이다.
 */
public record ErdDomainSpec(Long domainId, String domainName, String dataType, Integer length, Integer scale) {
}
