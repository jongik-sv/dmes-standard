/**
 * 04(마스터코드) 공유 계약 전용 서브패키지(TSK-06-01 design.md §1·§6.1). 선분 조작 서비스 인터페이스, 확정 검사 SPI
 * 구현 대상 선언(검사 8항 enum·결과 record·diff 키 규약), 선분·번호 상수만 둔다. 카테고리 모델·ID 이름 공간·버전 상태·
 * BASE 는 {@code contract.category}·{@code contract.version} 을 import 해 쓰고 다시 정의하지 않는다. 구현은 이 패키지 밖
 * (TSK-06-02~06-05)에 둔다 — {@code MdmContractArchitectureTest} 가 모양 규칙을 수정 없이 자동 적용한다(F20).
 */
package com.dongkuk.dmes.mdm.contract.mastercode;
