/**
 * 업무기준 구조관리 (masterRuleFrame) FE 타입.
 *
 * 인용:
 *  - 분석리포트 §3.2 (조회조건 S-002 pRuleId / S-004 pRuleNm — 둘 다 readonly, P-001 콜백 설정)
 *  - 분석리포트 §3.3 (ds_grdIn / ds_grdOut ColumnInfo 12 컬럼 — IN/OUT 구조 대칭)
 *  - 기능설계서 §9.1 (P-001 MasterRuleListPop 호출 계약 — sRuleId/sRuleNm 콜백)
 */

/** 조회 파라미터 — 업무기준 ID/명 (readonly, P-001 팝업 콜백으로만 설정 — 분석 §3.2). */
export interface FrameFilters {
  /** S-002 업무기준 ID — TB_MCA_RULE_COL_LIST 조회/저장 기준 (pRuleId) */
  pRuleId: string;
  /** S-004 업무기준명 — 표시 전용 (SQL 미사용) */
  pRuleNm: string;
}

/**
 * IN/OUT 그리드 행 (ds_grdIn / ds_grdOut — 분석 §3.3 12 컬럼, camelCase BE 응답).
 *
 * 편집 규칙: col 1~6 (colNm/colId/masterCodeDiv/colType/colLen/colPrecLen) 모든 행 편집
 * (delete-all-then-insert 저장 — BR-003. 기존행도 편집/삭제 가능).
 */
export interface RuleColRow extends Record<string, unknown> {
  /** RULE_ID — hidden (행추가 시 선택된 업무기준으로 set) */
  ruleId: string;
  /** COL_SEQ — hidden (저장 시 서버 재계산 — BR-004) */
  colSeq?: number | string | null;
  /** col 1 한글항목명 — 필수 (MSG-001) */
  colNm: string;
  /** col 2 영문항목명 — 필수 (MSG-002, max 30 — BR-008) */
  colId: string;
  /** col 3 코드여부 — N/Y 콤보 (필수 MSG-003) */
  masterCodeDiv: string;
  /** col 4 유형 — DATE/NUMBER/VARCHAR2 콤보 (필수 MSG-004) */
  colType: string;
  /** col 5 총길이 — 정수 max 5자리 (필수 MSG-005, BR-009) */
  colLen: number | string | null;
  /** col 6 소수점길이 — 정수 max 5자리 (선택 — BR-007) */
  colPrecLen: number | string | null;
  /** IO_FLAG — hidden (IN/OUT, 행추가 시 그리드 소속으로 set) */
  ioFlag: string;
  /** MES_COL_ID — hidden (SELECT 반환 보존) */
  mesColId?: string | null;
  /** OLD_COL_ID — hidden (SELECT 반환 보존) */
  oldColId?: string | null;
  /** RULE_VER — hidden (공란 시 서버 '1' 보정 — BR-005) */
  ruleVer?: number | string | null;
}
