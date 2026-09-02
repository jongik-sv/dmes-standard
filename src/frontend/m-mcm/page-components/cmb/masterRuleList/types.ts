/**
 * 업무기준 목록조회 (masterRuleList) FE 타입.
 *
 * 인용:
 *  - 분석리포트 §3.2 (조회조건 S-002 pRuleId / S-004 pRuleNm) → RuleFilters
 *  - 분석리포트 §3.3 (그리드 11 col / ds_grdMain 12 컬럼) → RuleRow
 *  - 분석리포트 §12 (edt "USD" 초기값 — 제거 결정, 사용자 2026-06-05) → DEFAULT_FILTERS(빈 문자열)
 */

/** 2 조회 파라미터 (As-Is edt_ruleId/edt_ruleNm text="USD" 기본값 제거 — 빈 문자열, 사용자 결정 2026-06-05). */
export interface RuleFilters {
  /** S-002 업무기준 ID — TB_MCA_RULE_MASTER.RULE_ID UPPER 양변 LIKE */
  pRuleId: string;
  /** S-004 업무기준명 — TB_MCA_RULE_MASTER.RULE_NM UPPER 양변 LIKE */
  pRuleNm: string;
}

/**
 * 그리드 행 (ds_grdMain — 분석 §3.3 / §6.1 SELECT 12 컬럼, camelCase BE 응답).
 *
 * 편집 규칙: 신규행(inserted)만 ruleId/ruleOwnerEmpNo 편집(BR-006 PK 변경 차단) /
 * ruleNm·ruleDesc·useTp 모든 행 편집(UPDATE 3컬럼) / ruleVer·audit 컬럼 읽기 전용.
 */
export interface RuleRow extends Record<string, unknown> {
  /** col 2 업무기준ID — PK. 신규행만 편집 */
  ruleId: string;
  /** OLD_RULE_ID — 미표시 (이력행 필터 전용) */
  oldRuleId?: string | null;
  /** col 3 업무기준명. 모든 행 편집 (UPDATE) */
  ruleNm: string;
  /** col 4 설명. 모든 행 편집 (UPDATE) */
  ruleDesc: string;
  /** col 6 Version — 업무 버전 (NUMBER(8,2), '1' 고정). 읽기 전용 */
  ruleVer: number | string | null;
  /** 업무기준 구분 — rowAdd 시 'A' (미표시) */
  ruleTp?: string | null;
  /** 담당부서명 — 미표시 */
  ruleOwnerDeptNm?: string | null;
  /** col 7 담당자. 신규행만 편집 */
  ruleOwnerEmpNo: string | null;
  /** col 5 사용여부 — Y/N. 모든 행 편집 (UPDATE) */
  useTp: string | null;
  /** col 8 시작일자 — CREATION_TIMESTAMP (포맷됨). 읽기 전용 */
  creationTimestamp?: string | null;
  /** col 9 최종수정자 — LAST_UPDATED_OBJECT_ID. 읽기 전용 */
  lastUpdatedObjectId?: string | null;
  /** col 10 최종수정일 — LAST_UPDATE_TIMESTAMP (포맷됨). 읽기 전용 */
  lastUpdateTimestamp?: string | null;
}
