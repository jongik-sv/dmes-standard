/**
 * 05(마스터데이터) 공유 계약 전용 서브패키지(TSK-07-01 design.md §1·§6.1). 일시 선분 저장 코어의
 * 상수(열린 끝 센티넬)·행위 enum·결과 record·SPI 인터페이스만 둔다. 구현은 이 패키지 밖(TSK-07-03)에
 * 둔다 — {@code MdmContractArchitectureTest}가 이 규칙을 고정하고(수정 없이 자동 적용),
 * {@code MdmTemporalSegmentStoreNoImplementationTest}가 "실 구현체 없음"을 직접 확인한다(F17).
 */
package com.dongkuk.dmes.mdm.contract.data;
