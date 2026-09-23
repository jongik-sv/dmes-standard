package com.dongkuk.dmes.mdm.contract.dictionary;

/**
 * 유효 식·유효 코드 참조 해석(저장·조회 공유, TSK-04-01 design.md §7.2, D8 — 컬럼 사전 조회와는 분리된
 * 별도 인터페이스). 구현은 이 Task 의 몫이 아니다(D3).
 */
public interface MdmEffectiveDomainResolver {

    /** "조회" 경로 — 이미 저장된 도메인. */
    MdmEffectiveDomain resolve(Long domainId);

    /** "저장" 경로 — 아직 커밋되지 않은 초안을 부모 체인에 얹어 미리 계산한다. */
    MdmEffectiveDomain resolveDraft(MdmDomainDraft draft);
}
