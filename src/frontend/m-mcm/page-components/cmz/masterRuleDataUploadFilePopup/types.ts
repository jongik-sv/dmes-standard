/** 일반 업무기준 등록(Excel Upload) (masterRuleDataUploadFilePopup) — 타입. */

/** 컬럼정의 행 (searchCol 응답 ds_GetRuleColUploadList — 대문자 키, As-Is ds_RuleColData 1:1). */
export interface ColDef extends Record<string, unknown> {
  RULE_ID?: string;
  COL_SEQ?: number;
  COL_ID: string;
  COL_NM: string;
  COL_LEN?: number;
  MES_COL_ID?: string;
  CODE_YN?: string;
  PK_YN?: string;
  /** DATE → 캘린더 표시·저장 시 '-' 제거+14자 절단 (R-110 — 서버) */
  COL_TYPE?: string;
  /** IN(red)/OUT(blue) — 그리드 셀 색 (As-Is cellBody_BgColor_*) */
  IO_FLAG?: string;
}

/** 동적 데이터 행 (search 응답 / Excel import 행 — 대문자 COL_ID 키). */
export type UploadRow = Record<string, unknown>;
