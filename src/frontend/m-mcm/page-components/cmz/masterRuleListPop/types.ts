/**
 * 업무기준 List조회 팝업 (masterRuleListPop) FE 타입.
 *
 * 인용:
 *  - 분석리포트 §3.2 (조회조건 S-002 pRuleId upper / S-004 pRuleNm) → PopFilters
 *  - 분석리포트 §6.1 (SELECT 9 컬럼 — 표시는 RULE_ID/RULE_NM 2종) → PopRuleRow
 *  - 기능설계서 §9.2 (LoV 팝업 계약: 입력 sRuleId/sRuleNm/sSchema → 반환 {sRuleId,sRuleNm})
 */

/** 조회 파라미터 — As-Is "결함 코드" 잔재는 빈 값 정정 (분석 §12). */
export interface PopFilters {
  /** S-002 업무기준ID — 대문자 자동 변환 (BR-007, inputmode=upper) */
  pRuleId: string;
  /** S-004 업무기준명 */
  pRuleNm: string;
}

/** 그리드 행 — SELECT 9 컬럼 camelCase (As-Is 보존, 표시는 ruleId/ruleNm — 분석 §6.1). */
export interface PopRuleRow extends Record<string, unknown> {
  /** col 1 업무기준 ID — 반환 sRuleId (BR-006) */
  ruleId: string;
  /** col 2 업무기준 명 — 반환 sRuleNm (BR-006) */
  ruleNm: string;
  oldRuleId?: string | null;
  ruleDesc?: string | null;
  ruleVer?: number | string | null;
  ruleTp?: string | null;
  ruleOwnerDeptNm?: string | null;
  ruleOwnerEmpNo?: string | null;
  useTp?: string | null;
}

/** 부모 화면 반환 객체 (gfn_popupClose 등가 — BR-006). */
export interface RuleSelectResult {
  sRuleId: string;
  sRuleNm: string;
}
