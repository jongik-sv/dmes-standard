/**
 * 공용 서비스 qcdRule 응답 모양. 서버 정본: src/backend/mqc/lib/.../qcd/rule/service/QcdRuleService.java,
 * 계약 요약: docs/mqc/demo/README.md §3. 변수 라벨은 응답에 없고 catalog.ts 에서 읽는다(meta.ts).
 */

export type RuleDataType = "STRING" | "NUMBER" | "BOOLEAN" | "DATE";
export type RuleDispType = "EQUAL" | "ONE" | "TWO" | "EXPRESSION" | "VALUE";

/** 셀 — Maru 저장 모양(op 마다 필요한 키만) + 엔진 요약 summary(`0.22 <= 변수 <= 0.249`, `IN (A, B)`, NA 는 `-`). */
export interface RuleCell {
  op?: string;
  left?: string;
  right?: string;
  list?: string[];
  expr?: string;
  val?: string;
  summary: string | null;
}

export interface RuleVar {
  varId: number;
  kind: "COND" | "RESULT";
  /** Maru 변수명(영문 대문자와 _). 식 변수는 없을 수 있다. */
  name: string | null;
  dataType: RuleDataType | null;
  dispType: RuleDispType | null;
  seq: number;
}

export interface RuleRow {
  rowId: number;
  seq: number;
  rowKind: "NORMAL" | "DEFAULT";
  /** varId(문자열) → 셀. */
  cells: Record<string, RuleCell>;
  /** 조건 열 요약을 열 순서로 " · " 로 이은 글. */
  summary: string;
  /** 결과 변수명 → 값(끝 0 을 뗀 숫자 문자열 또는 원문). */
  results: Record<string, string | null>;
}

/** search 의 룰 한 개. 평가 시각에 RELEASED 버전이 없으면 ver·hitPolicy 가 null 이고 vars·rows 가 빈 배열이다. */
export interface RuleView {
  ruleId: string;
  ver: string | null;
  applyFrom: string | null;
  hitPolicy: string | null;
  vars: RuleVar[];
  rows: RuleRow[];
}

export type JudgeStatus =
  "MATCHED" | "NO_MATCH" | "INPUT_ERROR" | "RULE_NOT_FOUND" | "UNAVAILABLE";

export interface JudgeHit {
  rowId: number;
  seq: number;
}

/** 행별 평가 근거 — evaluated 는 평가했는지(FIRST 는 적중 뒤 행을 평가하지 않는다), firstFalseVar 는 처음 거짓이 된 조건 변수명. */
export interface JudgeTrace {
  rowId: number;
  seq: number;
  evaluated: boolean;
  hit: boolean;
  firstFalseVar: string | null;
}

export interface JudgeResult {
  ruleId: string;
  ver: string | null;
  evalTs: string;
  status: JudgeStatus;
  /** 적중 행(FIRST 는 0~1개, COLLECT 는 모두). 기본 행이 적용되면 그 행 하나. */
  hits: JudgeHit[];
  /** 결과 변수명 → 값. */
  results: Record<string, unknown>;
  defaultApplied: boolean;
  trace: JudgeTrace[];
  /** 서버가 만든 업무 문장(적중 없음·입력 오류 등). */
  message: string | null;
}

export interface RuleVersion {
  ver: string;
  applyFrom: string | null;
  applyTo: string | null;
  vars: RuleVar[];
  rows: RuleRow[];
}

export interface CodeItem {
  code: string;
  name: string | null;
  alterName: string | null;
  seq: number | null;
  /** lvl1..lvl5 */
  lvl: (string | null)[];
  /** attr01..attr10 */
  attrs: (string | null)[];
}

/** codes 의 코드 한 개. RELEASED 버전이 없으면 ver 가 null 이고 items 가 빈 배열이다. */
export interface CodeSet {
  codeId: string;
  ver: string | null;
  items: CodeItem[];
}

/** 판정 상태 → 화면 문구. */
export const JUDGE_STATUS_LABEL: Record<JudgeStatus, string> = {
  MATCHED: "적중",
  NO_MATCH: "적중 없음",
  INPUT_ERROR: "입력 오류",
  RULE_NOT_FOUND: "적용 버전 없음",
  UNAVAILABLE: "판정 불가(MDM)",
};
