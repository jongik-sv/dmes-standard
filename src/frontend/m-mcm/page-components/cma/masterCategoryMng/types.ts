/**
 * 카테고리 관리 (masterCategoryMng) FE 타입.
 *
 * 인용:
 *  - 분석리포트 §3.2 (조회조건 S-002/S-004/S-006/S-008) → CategoryFilters
 *  - 분석리포트 §3.3 (그리드 8 col + ds_grdMain 6 컬럼) → CategoryRow
 *  - 분석리포트 §12 (USD 초기값 보존) → DEFAULT_FILTERS
 */

/** 4 조회 파라미터 (As-Is text="USD" 4 항목 보존 — 사용자 결정 §12). */
export interface CategoryFilters {
  /** S-002 코드ID — TB_MCM_CODE_MASTER.MASTER_CODE LIKE */
  pCodeId: string;
  /** S-004 코드명 — TB_MCM_CODE_MASTER.CODE_NM LIKE */
  pCodeNm: string;
  /** S-006 카테고리ID — TB_MCM_CODE_CATEGORY.CATEGORY_ID LIKE */
  pCategoryId: string;
  /** S-008 카테고리명 — TB_MCM_CODE_CATEGORY.CATEGORY_NM LIKE */
  pCategoryNm: string;
}

/**
 * 그리드 행 (ds_grdMain — 분석 §3.3 / Mapper.xml:7~12 SELECT 5 컬럼).
 *
 * camelCase BE 응답 그대로 + FE row-state 메타 (nativeeditor_status / __gridTempId).
 */
export interface CategoryRow extends Record<string, unknown> {
  /** col 4 코드 ID — TB_MCM_CODE_CATEGORY.MASTER_CODE (= TB_MCM_CODE_MASTER.CODE_ID FK). 신규행만 편집 */
  masterCode: string;
  /** col 3 코드명 — TB_MCM_CODE_MASTER.CODE_NM. 읽기 전용 (JOIN 표시) */
  codeNm: string;
  /** col 5 카테고리 ID — TB_MCM_CODE_CATEGORY.CATEGORY_ID. 신규행만 편집 */
  categoryId: string;
  /** col 6 카테고리 명 — TB_MCM_CODE_CATEGORY.CATEGORY_NM. 모든 행 편집 */
  categoryNm: string;
  /** col 7 정렬 — TB_MCM_CODE_CATEGORY.SORT_SEQ. 모든 행 편집 */
  sortSeq: number | string | null;
}

/**
 * 전체 키 행 (ds_grdMainAll — Mapper.xml:31~37 SELECT 2 컬럼, 클라이언트 중복체크용).
 */
export interface CategoryAllRow extends Record<string, unknown> {
  masterCode: string;
  categoryId: string;
}
