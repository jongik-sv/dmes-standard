/**
 * 업무기준 컬럼 리스트 등록 팝업 (masterRuleFrameColListPopup) FE 타입.
 *
 * 인용:
 *  - 분석리포트 §1 (호출 컨텍스트 — 입력 {sRuleId,sRuleNm}, 반환 없음·부모 콜백 재조회)
 *  - 분석리포트 §3.4 (ds_grdRuleCol 13 컬럼 — 표시 9 + CHK) / §6 (SELECT 9 alias)
 */

/** 그리드 행 — 메타 조회 9 컬럼 camelCase + CHK(일괄 적용 체크, UI 전용 — 분석 §3.4). */
export interface ColListRow extends Record<string, unknown> {
  /** RULE_VER — '1' 고정 (비노출) */
  ruleVer?: string | null;
  /** RULE_ID — 비노출 (부모 전달값) */
  ruleId?: string | null;
  /** G-001 영문항목명 (COLUMN_NAME, max 30 — BR editmaxlength) */
  colId: string;
  /** G-002 한글항목명 (MS_Description, max 100) */
  colNm: string;
  /** G-003 선택(CHK) — 일괄 IN/OUT 적용 대상 (Y/N, UI 전용 — 저장 미포함) */
  chk?: string;
  /** G-004 IN/OUT (기본 'OUT' — As-Is Mapper:16) */
  ioFlag: string;
  /** G-005 코드여부 (기본 'N') */
  masterCodeDiv: string;
  /** G-006 유형 (varchar 계열→VARCHAR2 — C-002) */
  colType: string;
  /** G-007 총길이 (정수 max 5 — mask) */
  colLen: number | string | null;
  /** G-008 소수점길이 (정수 max 5) */
  colPrecLen: number | string | null;
}
