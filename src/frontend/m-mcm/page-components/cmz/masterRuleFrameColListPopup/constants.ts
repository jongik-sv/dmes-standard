import type { GridColumn } from "@dk-oasis/shared/grid";

/** LoV — IN/OUT (ds_inOut LV-003: 공백=선택 / IN / OUT — As-Is 정적). */
export const IN_OUT_VALUES = ["IN", "OUT"] as const;

/** LoV — 코드여부 (ds_div LV-001: N/Y). */
export const DIV_VALUES = ["N", "Y"] as const;

/** LoV — 유형 (ds_colType LV-002: DATE/NUMBER/VARCHAR2). */
export const COL_TYPE_VALUES = ["DATE", "NUMBER", "VARCHAR2"] as const;

/** 입력 길이 제한 (As-Is editmaxlength/mask — 분석 §3.3). */
export const MAX_LEN = {
  colId: 30,
  colNm: 100,
  colLen: 5,
  colPrecLen: 5,
} as const;

/**
 * 그리드 컬럼 (분석 §3.3 — 9 cols. 폭 = As-Is 30/135/127/30/60/63/88/69/72 비율).
 *
 * 비고 (shared AgDataGrid 제약 — masterRuleFrame D-001 동일 유형, 비차단 보류):
 *  - head 2행 병합("IN/OUT" colspan / "컬럼속성" colspan) 미지원 → 평탄 헤더
 *  - CHK 체크박스 셀 미지원 → select Y/N 대체 (기능 등가 — 일괄 적용 대상 표시)
 *  - 헤더 내장 IN/OUT 일괄 콤보(E-001) → 그리드 상단 콤보+적용 버튼으로 대체 (기능 등가)
 */
export const COL_LIST_COLUMNS: GridColumn[] = [
  { key: "no", header: "순번", meta: false, width: 60, editable: false, align: "center" },
  { key: "colId", header: "영문항목명 *", width: 150, editable: true, align: "left" },
  { key: "colNm", header: "한글항목명 *", width: 150, editable: true, align: "left" },
  { key: "chk", header: "선택", meta: false, width: 70, editable: true, cellEditor: "select", cellEditorValues: ["Y", "N"], align: "center" },
  { key: "ioFlag", header: "IN/OUT *", width: 90, editable: true, cellEditor: "select", cellEditorValues: [...IN_OUT_VALUES] },
  { key: "masterCodeDiv", header: "코드여부 *", width: 90, editable: true, cellEditor: "select", cellEditorValues: [...DIV_VALUES] },
  { key: "colType", header: "유형 *", width: 110, editable: true, cellEditor: "select", cellEditorValues: [...COL_TYPE_VALUES] },
  { key: "colLen", header: "총길이 *", width: 90, editable: true, align: "right" },      // 정수 강제 = clampCellValue (number 에디터 금지 — frame 교훈)
  { key: "colPrecLen", header: "소수점길이", width: 100, editable: true, align: "right" },
];
