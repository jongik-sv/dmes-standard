import type { GridColumn } from "@dk-oasis/shared/grid";
import type { CategoryFilters } from "./types";

/**
 * 조회조건 default 값 — 모두 빈 문자열 (사용자 결정 2026-05-28 — 이전 §12 의 "USD" 보존 결정 취소).
 * As-Is xfdl:72/74/76/78 의 text="USD" 는 As-Is 환경 특정 잔재로 To-Be 에는 미적용.
 */
export const DEFAULT_FILTERS: CategoryFilters = {
  pCodeId: "",
  pCodeNm: "",
  pCategoryId: "",
  pCategoryNm: "",
};

/**
 * 그리드 컬럼 (분석 §3.3 — 8 col 중 col 0(선택) / col 1(NO) / col 2(상태) 는 AgDataGrid
 * row state 표시 메커니즘으로 대체. 비즈니스 5 컬럼 정의).
 *
 * col 4 코드 ID / col 5 카테고리 ID = 신규행(inserted)만 편집 (As-Is BR-006 키 변경 제약 보존).
 * col 6 카테고리 명 / col 7 정렬 = 모든 행 편집.
 */
export const CATEGORY_COLUMNS: GridColumn[] = [
  {
    key: "codeNm",
    header: "코드명",
    width: 160,
    editable: false,
  },
  {
    key: "masterCode",
    header: "코드 ID *",
    width: 160,
    editable: (r: Record<string, unknown>) =>
      (r as { nativeeditor_status?: string }).nativeeditor_status === "inserted",
  },
  {
    key: "categoryId",
    header: "카테고리 ID *",
    width: 160,
    editable: (r: Record<string, unknown>) =>
      (r as { nativeeditor_status?: string }).nativeeditor_status === "inserted",
  },
  {
    key: "categoryNm",
    header: "카테고리 명 *",
    width: 200,
    editable: true,
  },
  {
    key: "sortSeq",
    header: "정렬",
    width: 100,
    editable: true,
    type: "number",
    cellEditor: "number",
    align: "right",
  },
];
