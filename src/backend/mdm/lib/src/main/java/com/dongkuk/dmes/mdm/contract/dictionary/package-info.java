/**
 * 02(용어·도메인·컬럼) 공유 계약 전용 서브패키지(TSK-04-01 design.md §1·§7). 컬럼 사전 조회, 유효 식·유효
 * 코드 참조 해석, 영향도 조회 세 그룹의 인터페이스·enum·record만 둔다. 구현은 이 패키지 밖(TSK-04-03·
 * 04-04·05-01·08-01 등 후속 Task)에 둔다 — {@code MdmContractArchitectureTest} 가 이 규칙을 고정한다.
 */
package com.dongkuk.dmes.mdm.contract.dictionary;
