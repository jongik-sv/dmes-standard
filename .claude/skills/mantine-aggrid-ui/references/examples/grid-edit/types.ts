/** defectCodeMng 타입·상수. 열 정의(COLUMNS)는 page.tsx 상단에 둔다. */

export interface DefectCodeRow extends Record<string, unknown> {
  defectCd: string;
  defectNm: string;
  defectType: string;
  sortSeq: number | string;
  useYn: string;
  remark: string;
}

export interface DefectCodeFilters {
  defectType: string;
  keyword: string;
}

export const EMPTY_FILTERS: DefectCodeFilters = { defectType: "", keyword: "" };

/** 코드 → 라벨. 그리드 select 편집기(cellEditorValueLabels)와 조회조건 옵션이 같은 표를 쓴다. */
export const DEFECT_TYPE_LABELS: Record<string, string> = {
  APPR: "외관",
  DIM: "치수",
  FUNC: "기능",
};

/** 조회조건 select 옵션 — 첫 항목은 항상 { value: "", label: "전체" }. */
export const DEFECT_TYPE_OPTIONS = [
  { value: "", label: "전체" },
  ...Object.entries(DEFECT_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

export const USE_YN_LABELS: Record<string, string> = { Y: "사용", N: "미사용" };
