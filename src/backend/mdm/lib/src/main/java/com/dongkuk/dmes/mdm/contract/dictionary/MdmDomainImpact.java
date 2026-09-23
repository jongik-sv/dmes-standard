package com.dongkuk.dmes.mdm.contract.dictionary;

import java.util.List;

/**
 * 도메인 영향도 조회 결과(TSK-04-01 design.md §7.3). {@code descendantDomainIds}·{@code referencingColumnIds}
 * 는 02 자신의 테이블만으로 계산 가능하다(구현체가 재귀 CTE 로 채운다, TSK-04-03). {@code externalReferences}
 * 는 {@link MdmDomainReferenceSpi} 구현체(0개 가능)를 순회해 합친 결과다(D9).
 */
public record MdmDomainImpact(
        Long domainId, List<Long> descendantDomainIds, List<Long> referencingColumnIds,
        List<MdmDomainReference> externalReferences, List<String> affectedSystemCodes) {
}
