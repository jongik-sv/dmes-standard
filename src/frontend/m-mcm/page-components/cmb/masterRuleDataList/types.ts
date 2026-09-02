/** 업무기준 상세조회 (masterRuleDataList) — 타입. */

/** 5조건 검색 항목 (S-006~S-020 — 컬럼콤보 + 연산자 + 값). */
export interface CondItem {
  where: string;
  operator: string;
  val: string;
}

/** 조회 파라미터 (분석 §4.6 sArgument — 조회 전용, 긴급적용 없음). */
export interface DataListFilters {
  pRuleId: string;
  pRuleNm: string;
  conds: [CondItem, CondItem, CondItem, CondItem, CondItem];
}

/** 컬럼정의 행 (lov 응답 ds_GetRuleColList — 대문자 키, As-Is ds_lovData 1:1). */
export interface ColDef extends Record<string, unknown> {
  RULE_ID?: string;
  COL_SEQ?: number;
  COL_ID: string;
  COL_NM: string;
  COL_LEN?: number;
  COL_PREC_LEN?: number;
  MES_COL_ID?: string;
  /** 코드 여부 (MASTER_CODE_DIV) — 'Y' 면 마스터코드 셀 클릭(P-002) 활성 (BR-008) */
  CODE_YN?: string;
  /** PK 여부 — SQL 반환하나 본 화면 그리드 빌드 미사용 (As-Is 보존, 분석 §3.3) */
  PK_YN?: string;
  COL_TYPE?: string;
  IO_FLAG?: string;
}

/** 동적 데이터 행 (search 응답 — 대문자 동적 컬럼 키 + SEQ/TOTALCOUNT). */
export type DataRow = Record<string, unknown>;
