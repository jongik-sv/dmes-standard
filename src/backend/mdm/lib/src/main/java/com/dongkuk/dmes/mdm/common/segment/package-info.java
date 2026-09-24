/**
 * 05 「선분과 닫기」 일시 선분 저장 코어(TSK-07-03 design.md §1 (가)). 항목·카테고리·소속 세 테이블의 등록·수정·닫기·
 * 다시 열기를 네이티브 SQL 로 수행한다.
 *
 * <p>두 층이다.
 * <ul>
 *   <li>아래층 — 계약 {@code MdmTemporalSegmentStore} 구현체 셋({@link DataItemSegmentStore}·{@link DataCateSegmentStore}·
 *       {@link DataCateItemSegmentStore}). 검사 없이 선분 연산만 한다. 호출자가 잠금을 쥐었다고 가정한다(A3: 구현체는 이
 *       패키지의 세 클래스뿐이다).</li>
 *   <li>위층 — {@link DataItemSaveCore}·{@link DataCategorySegmentCore}. 사건마다 순서가 고정이다: 저장 시각 → 마루 데이터
 *       행 잠금(L1·L2) → 잠금 뒤 네이티브 재조회 → 검사 1~7(C0~C7) → row_version 비교(S4) → 경계 확정(S9) → 아래층 연산.</li>
 * </ul>
 *
 * <p>불변 규칙 번호(design.md §5): S1~S14(선분), C0~C7(검사), L1~L3(잠금), A3(구현체 위치).
 * 배포 순번은 발급하지 않는다(S12, PRD §2 규칙 7).
 */
package com.dongkuk.dmes.mdm.common.segment;
