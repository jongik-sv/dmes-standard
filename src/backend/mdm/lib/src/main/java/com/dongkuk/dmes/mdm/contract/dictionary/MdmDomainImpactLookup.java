package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 영향도 조회(TSK-04-01 design.md §7.3, spec "영향도 조회 인터페이스"). 구현은 이 Task 의 몫이 아니다
 * (D3) — TSK-04-03 이 하위 도메인·참조 컬럼(재귀 CTE)과 {@link MdmDomainReferenceSpi} 목록 집계를 채운다.
 */
public interface MdmDomainImpactLookup {

    MdmDomainImpact impact(Long domainId);
}
