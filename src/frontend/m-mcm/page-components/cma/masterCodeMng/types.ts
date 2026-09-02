/**
 * masterCodeMng (Master Code 관리) 화면 타입.
 *
 * 분석리포트 §3.7 의 Dataset 컬럼 + §9 의 DB 컬럼 카탈로그 인용. As-Is SNAKE_CASE 보존.
 */

/** 조회조건 — 분석 §3.2 S-001 / S-002. */
export interface MasterCodeFilters {
  /** S-001 — 코드ID (LIKE 부분 일치, MASTER_CODE OR). */
  pCodeId: string;
  /** S-002 — 코드명 (UPPER LIKE 부분 일치). */
  pCodeNm: string;
}

/** Master 그리드 row — As-Is ds_grdMain 16 컬럼 (xfdl:179~198) + FE row state. */
export interface MasterRow extends Record<string, unknown> {
  CODE_ID: string;
  CODE_NM?: string;
  CODE_DESC?: string;
  CODE_VER?: string;
  USE_TP?: string;
  START_ACTIVE_DATE?: string | null;
  END_ACTIVE_DATE?: string | null;
  CODE_OWNER_DEPT_NM?: string;
  CODE_OWNER_EMP_NO?: string;
  CODE_CHARACTER?: string;
  MASTER_CODE?: string;
  MASTER_CODE_REF1?: string;
  MASTER_CODE_REF2?: string;
  MASTER_CODE_REF3?: string;
  MASTER_CODE_REF4?: string;
  MASTER_CODE_REF5?: string;
}

/** Detail 그리드 row — As-Is ds_grdDetail 19 컬럼 (xfdl:199~221). */
export interface DetailRow extends Record<string, unknown> {
  MASTER_CODE: string;
  CATEGORY_ID: string;
  CATEGORY_NM?: string;
  SORT_SEQ?: number | null;
  CODE_VAL: string;
  CODE_VAL_MEAN?: string;
  CODE_VAL_DESC?: string;
  CODE_VER?: string;
  CHK?: string;
  CODE_VAL_REF1?: string;
  CODE_VAL_REF2?: string;
  CODE_VAL_REF3?: string;
  CODE_VAL_REF4?: string;
  CODE_VAL_REF5?: string;
  MASTER_CODE_REF1?: string;
  MASTER_CODE_REF2?: string;
  MASTER_CODE_REF3?: string;
  MASTER_CODE_REF4?: string;
  MASTER_CODE_REF5?: string;
}

/** Category LoV — FX-002 cbo_categoryId (LV-003). */
export interface CategoryLov extends Record<string, unknown> {
  CATEGORY_ID: string;
  CATEGORY_NM: string;
}

/** Master 전체 LoV — G-006~G-010 + Detail 의 MASTER_CODE_REF alias (LV-002). */
export interface MasterLov extends Record<string, unknown> {
  CODE_ID: string;
  CODE_NM: string;
}

/** Detail Ref1~5 LoV — GE-010~014 (LV-004~008). */
export interface DetailRefLov extends Record<string, unknown> {
  CODE_VAL: string;
  CODE_VAL_MEAN: string;
}

/** Nexacro row status (As-Is !nativeeditor_status) — To-Be rowStatus 표준화. */
export type RowStatus = "" | "inserted" | "updated" | "deleted";
