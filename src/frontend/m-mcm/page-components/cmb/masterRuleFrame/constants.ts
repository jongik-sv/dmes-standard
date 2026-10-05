import type { GridColumn } from "@dk-oasis/shared/grid";
import type { FrameFilters } from "./types";

/**
 * 조회조건 default — 빈 문자열 (As-Is: P-001 팝업 선택 전 조회 미발생, 분석 §3.2).
 */
export const DEFAULT_FILTERS: FrameFilters = {
  pRuleId: "",
  pRuleNm: "",
};

/** LoV — 코드여부 (ds_div N/Y — As-Is 정적 유지, Q-004 확정 2026-06-04). */
export const DIV_VALUES = ["N", "Y"] as const;

/** LoV — 유형 (ds_colType DATE/NUMBER/VARCHAR2 — As-Is 정적 유지, Q-004 확정). */
export const COL_TYPE_VALUES = ["DATE", "NUMBER", "VARCHAR2"] as const;

/** 입력 길이 제한 (BR-008/009 — As-Is editmaxlength/mask). */
export const MAX_LEN = {
  colNm: 100,
  colId: 30,
  colLen: 5,
  colPrecLen: 5,
} as const;

/**
 * IN/OUT 그리드 컬럼 (디자인 §4.2 — 7 cols, IN/OUT 동일 구조).
 *
 * col 0 순번은 표시 시점 계산 필드 `no` (As-Is expr:currow+1). col 폭 = As-Is xfdl:50~57 비율.
 *
 * As-Is 상위 병합 헤더 "사용여부"(col 4~6 colspan) 는 shared AgDataGrid 가 column group 을
 * 미지원하여 평탄 헤더로 표시 — 비차단 잔여 (masterRuleList Q-013 fold 와 동일 유형,
 * 개발체크리스트 ITEM-FE-04 비고 참조).
 */
export const FRAME_COLUMNS: GridColumn[] = [
  { key: "no", header: "순번", meta: false, width: 60, editable: false, align: "center" },
  { key: "colNm", header: "한글항목명 *", width: 150, editable: true, align: "left" },
  { key: "colId", header: "영문항목명 *", width: 150, editable: true, align: "left" },
  { key: "masterCodeDiv", header: "코드여부 *", width: 90, editable: true, cellEditor: "select", cellEditorValues: [...DIV_VALUES] },
  { key: "colType", header: "유형 *", width: 110, editable: true, cellEditor: "select", cellEditorValues: [...COL_TYPE_VALUES] },
  { key: "colLen", header: "총길이 *", width: 90, editable: true, align: "right" },   // 정수 강제는 clampCellValue(BR-009) — number 에디터는 초기값 ""(text 추론)와 충돌해 커밋 null
  { key: "colPrecLen", header: "소수점길이", width: 100, editable: true, align: "right" },
];

/**
 * OUT 그리드 전용 컬럼 — As-Is G-002 col 3 코드여부 콤보의 `combodisplaynulltext="선택"`
 * (xfdl:126, null 시 "선택" 표시. IN 은 미지정 — 분석 §3.3 비고) 를 render 로 보존.
 */
export const FRAME_COLUMNS_OUT: GridColumn[] = FRAME_COLUMNS.map((c) =>
  c.key === "masterCodeDiv"
    ? { ...c, render: (v) => (v == null || v === "" ? "선택" : String(v)) }
    : c,
);


/** 신규행 rowAdd 기본값 (As-Is xfdl:453~458 — RULE_ID/IO_FLAG 는 호출부에서 set). */
export const ROW_ADD_DEFAULTS = {
  colNm: "",
  colId: "",
  masterCodeDiv: "",
  colType: "",
  colLen: "",
  colPrecLen: "",
  ruleVer: "",
} as const;
