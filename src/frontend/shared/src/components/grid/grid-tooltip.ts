/**
 * 그리드 툴팁(머리글·셀·HTML 설명 머리글 카드) 기본 표시 지연(ms). ag-grid 기본 2000ms 는 머리글 이름·설명을 확인하기에 너무 늦다(2026-10-05).
 * AgDataGrid 가 화면이 `tooltipShowDelay` 를 주지 않을 때 그리드에 넘기고, MdmHeaderLabel 은 그리드 값이 없을 때(방어·시험용) 이 값을 쓴다.
 */
export const GRID_TOOLTIP_SHOW_DELAY_MS = 500;
