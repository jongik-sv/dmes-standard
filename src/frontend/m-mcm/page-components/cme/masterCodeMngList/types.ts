/**
 * masterCodeMngList (Master Code 상세조회) 화면 타입.
 *
 * 분석리포트 §3.7 Dataset 컬럼 + §9 DB 컬럼 카탈로그 인용. As-Is SNAKE_CASE 보존.
 * 본 화면은 SELECT 전용 (cme 그룹) — rowStatus / 편집 관련 타입 부재.
 */

/** 조회조건 — 분석 §3.2 S-001 / S-002. */
export interface MasterCodeMngListFilters {
  /** S-001 — 코드ID (LIKE 부분 일치, MASTER_CODE OR). */
  pCodeId: string;
  /** S-002 — 코드명 (UPPER LIKE 부분 일치). */
  pCodeNm: string;
}

/**
 * Master 그리드 row — As-Is ds_grdMain 22 컬럼 (xfdl:161~185) — REF1~5_NM 5 컬럼 포함.
 * 본 화면은 조회 전용이라 row state 컬럼 (rowStatus 등) 부재.
 */
export interface MasterCodeMngListMasterRow extends Record<string, unknown> {
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
  /** scalar subquery 결과 — G-006 (참조1) bind. */
  MASTER_CODE_REF1_NM?: string;
  MASTER_CODE_REF2_NM?: string;
  MASTER_CODE_REF3_NM?: string;
  MASTER_CODE_REF4_NM?: string;
  MASTER_CODE_REF5_NM?: string;
}

/**
 * Detail 그리드 row — As-Is ds_grdDetail 14 컬럼 (xfdl:186~203).
 * CHK 컬럼은 정의되어 있으나 본 화면 xfdl Script 에서 토글 0 회 — 잔존 컬럼 (As-Is 1:1 보존 위해 type 만 노출).
 */
export interface MasterCodeMngListDetailRow extends Record<string, unknown> {
  MASTER_CODE: string;
  CATEGORY_ID: string;
  CATEGORY_NM?: string;
  SORT_SEQ?: number | null;
  CODE_VAL: string;
  CODE_VAL_MEAN?: string;
  CODE_VAL_DESC?: string;
  CODE_VER?: string;
  /** As-Is DS-002 잔존 — Script 미사용. */
  CHK?: string;
  /** GE-008~012 bind — nested scalar subquery + NVL fallback 결과. */
  CODE_VAL_REF1_MN?: string;
  CODE_VAL_REF2_MN?: string;
  CODE_VAL_REF3_MN?: string;
  CODE_VAL_REF4_MN?: string;
  CODE_VAL_REF5_MN?: string;
}

/** Category LoV — FX-002 cbo_categoryId (LV-002). */
export interface MasterCodeMngListCategoryLov extends Record<string, unknown> {
  CATEGORY_ID: string;
  CATEGORY_NM: string;
}
