/**
 * 06(업무기준) 공유 계약 전용 서브패키지(TSK-08-01 design.md §6.3). 식별자 발급·엔진 DefinitionLookup 구현 대상·확정 검사의
 * 06 관례를 선언만 한다. 구현은 이 패키지 밖(TSK-08-02 발급기·08-04 DefinitionLookup·08-05 확정 검사)에 둔다 —
 * {@code MdmContractArchitectureTest} 가 이 규칙을 고정한다(수정 없이 자동 적용).
 *
 * <p>계약 패키지는 엔진 타입에 의존할 수 없으므로 {@code DefinitionLookup} 구현 대상은 {@link
 * com.dongkuk.dmes.mdm.contract.rule.MdmRuleDefinitionSource} 와 06 칼럼 → 엔진 필드 매핑표(TSK-08-01 design.md §6.4)로
 * 선언한다. 확정 검사 SPI 는 기존 {@code VersionConfirmCheckSpi}(target BUSINESS_RULE)를 쓴다.
 */
package com.dongkuk.dmes.mdm.contract.rule;
