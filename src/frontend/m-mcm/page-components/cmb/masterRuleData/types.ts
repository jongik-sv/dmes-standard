/**
 * 업무기준 Data관리 (masterRuleData) FE 타입.
 *
 * 인용:
 *  - 분석리포트 §3.2 (S-001~S-021: 업무기준 + 5조건 LoV + 긴급적용) → DataFilters
 *  - 분석리포트 §3.3 (동적 컬럼 — ds_lovData 메타 기반 런타임 빌드, Q-003) → ColDef
 *  - 동적 행: 컬럼 키가 업무기준별 가변 — Record 그대로 사용 (대문자 COL_ID 키, camelCase 변환 ✗)
 */

/** 조건 1쌍 (컬럼 / 연산자 / 값 — S-006~S-020). */
export interface CondPair {
  /** 컬럼 (컬럼정의 COL_ID — 동적 LoV) */
  where: string;
  /** 연산자 (LIKE / = / <= / >= — 정적 LoV) */
  operator: string;
  /** 값 */
  val: string;
}

/** 조회 파라미터. */
export interface DataFilters {
  /** S-002 업무기준 ID (필수·readonly — P-001 로만 설정, BR-001/002) */
  pRuleId: string;
  /** S-004 업무기준명 (표시 전용) */
  pRuleNm: string;
  /** 5조건 (S-006~S-020) */
  conds: [CondPair, CondPair, CondPair, CondPair, CondPair];
  /** S-021 긴급적용 (Y/N — BR-013) */
  urgent: boolean;
}

/** 컬럼정의 행 (lov 응답 ds_GetRuleColList — 대문자 키, As-Is SELECT 별칭 1:1). */
export interface ColDef extends Record<string, unknown> {
  RULE_ID: string;
  COL_SEQ: number;
  /** 동적 컬럼 bind 키 */
  COL_ID: string;
  /** 동적 컬럼 헤더명 */
  COL_NM: string;
  COL_LEN?: number | null;
  COL_PREC_LEN?: number | null;
  MES_COL_ID?: string | null;
  /** 코드 여부 (MASTER_CODE_DIV) */
  CODE_YN?: string | null;
  /** PK 여부 — 헤더 ' * ' prefix + 저장 필수 검증 (BR-006) */
  PK_YN: string;
  /** VARCHAR2 / NUMBER / DATE (BR-008/009) */
  COL_TYPE: string;
  /** IN / OUT — 헤더 구분 (BR-007) */
  IO_FLAG: string;
}

/** 동적 데이터 행 — 컬럼 키 가변(대문자) + 내부 필드(__rowId/rowStatus). */
export type DataRow = Record<string, unknown>;
