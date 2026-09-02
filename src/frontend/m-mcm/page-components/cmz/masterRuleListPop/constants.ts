import type { GridColumn } from "@dk-oasis/shared/grid";
import type { PopFilters } from "./types";

/** 조회조건 default — 빈 값 (As-Is "결함 코드" 디자이너 잔재 정정 — 분석 §12). */
export const DEFAULT_FILTERS: PopFilters = {
  pRuleId: "",
  pRuleNm: "",
};

/**
 * 그리드 컬럼 (디자인 §4.2 — 3 cols, 읽기 전용).
 *
 * col 0 NO 는 표시 시점 계산 필드 `no` (As-Is expr:currow+1). 폭 = As-Is 30/100/220 비율.
 * As-Is editmaxlength/editimemode 는 편집 핸들러 없는 잔재 → To-Be 읽기 전용 (BR-008, 분석 §12).
 */
export const POP_COLUMNS: GridColumn[] = [
  { key: "no", header: "NO", width: 60, editable: false, align: "center" },
  { key: "ruleId", header: "업무기준 ID", width: 120, editable: false },
  { key: "ruleNm", header: "업무기준 명", width: 240, editable: false, align: "left" },
];
