package com.dongkuk.dmes.mdm.contract.dictionary;

import java.util.List;
import java.util.Set;

/**
 * 03·06이 각자 구현해 스프링 빈으로 등록하는 SPI(TSK-04-01 design.md §7.3, D9 — 판단 지점 3). 02 가
 * {@code TB_MDM_LAYOUT_ITEM}·{@code TB_MDM_RULE_VAR} 를 직접 SQL 로 참조하지 않고, 03·06 이 이 SPI 를
 * 구현해 자기 영역이 참조하는 도메인·컬럼을 알려준다. 구현체가 없으면(그 영역 미착수) 그 영역 참조는
 * 0건이 된다(TSK-01-02 {@code VersionConfirmCheckSpi} 패턴과 같은 구조).
 */
public interface MdmDomainReferenceSpi {

    List<MdmDomainReference> referencesTo(Set<Long> domainIds, Set<String> columnPhysNames);
}
