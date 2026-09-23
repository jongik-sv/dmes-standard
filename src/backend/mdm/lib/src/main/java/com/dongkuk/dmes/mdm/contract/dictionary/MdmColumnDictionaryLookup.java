package com.dongkuk.dmes.mdm.contract.dictionary;

import java.util.List;
import java.util.Optional;

/**
 * 컬럼 사전 조회(TSK-04-01 design.md §7.1, spec "컬럼 사전 조회 인터페이스" — 03 레이아웃·06 룰 변수가
 * 사용). 구현은 이 Task 의 몫이 아니다(D3) — TSK-05-01·08-01 등 소비자가 제공한다.
 */
public interface MdmColumnDictionaryLookup {

    Optional<MdmColumnDictionaryEntry> byPhysName(String physName);

    Optional<MdmColumnDictionaryEntry> byColumnId(Long columnId);

    List<MdmColumnDictionaryEntry> byDomainId(Long domainId);
}
