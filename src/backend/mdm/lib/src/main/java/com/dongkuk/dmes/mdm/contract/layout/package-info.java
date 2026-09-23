/**
 * 03(인터페이스 레이아웃) 공유 계약 전용 서브패키지(TSK-05-01 design.md §1·§6.1). 레이아웃 스냅샷의
 * 모양(record)·항목 종류(enum)·직렬화기·파서 인터페이스만 둔다. 구현은 이 패키지 밖(TSK-05-02·05-03
 * 등 후속 Task)에 둔다 — {@code MdmContractArchitectureTest}가 이 규칙을 고정한다(F13, 수정 없이 자동 적용).
 */
package com.dongkuk.dmes.mdm.contract.layout;
