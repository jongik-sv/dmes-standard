/**
 * ruleEdit 화면 타입 — 서버 `RuleEditViewResult`·`ResolvedVar`·`RuleEditSaveResult` 와 같은 칸 이름(TSK-08-02 design §6.2).
 * 일시는 KST `"yyyy-MM-dd HH:mm:ss"`. 셀은 저장 형태 JSON 문자열이다.
 */
import type { RowTrace, RuleHit } from "@/contract/engine-contract.generated";
import type { MdmVersionStatus } from "@/shell";

export type RuleKind = "DECISION" | "DERIVE";
export type HitPolicyCode = "FIRST" | "UNIQUE" | "PRIORITY" | "COLLECT" | "ANY";
/** 06 표기 DISP_TYPE. */
export type StoredDispType = "Equal" | "1" | "2" | "Expression" | "Value";

/** 서버 `RuleVarTypeResolver` 가 해석한 변수(D13) — 화면은 타입을 스스로 추정하지 않는다(I16). */
export interface ResolvedVar {
  varId: number;
  varKind: "COND" | "RESULT";
  dispType: StoredDispType | null;
  seq: number;
  /** 이름 변수면 이름, Expression 조건 열이면 null. 식 변수(2026-09-28 이전에 저장된 것만)면 식 텍스트. */
  varName: string | null;
  exprVar: boolean;
  label?: string | null;
  dataType: "BOOLEAN" | "NUMBER" | "STRING" | "DATE";
  scale?: number | null;
  dateString: boolean;
  maruCodeId?: string | null;
  domainId?: number | null;
  domainName?: string | null;
  typeSource: "COLUMN" | "RULE_RESULT" | "DECLARED" | "EXPRESSION_COLUMN" | "UNRESOLVED";
  description?: string | null;
}

/** 저장 형태 행. `cells` 는 `{"<varId>": {op,left,right,list,expr,ast,val}}` JSON 문자열. */
export interface StoredRow {
  rowId: number;
  seq: number;
  rowKind: "NORMAL" | "DEFAULT";
  cells: string;
  note?: string | null;
}

/** 서버·화면 검사 이슈. 값이 없는 칸(varId·lower·upper)은 빠질 수 있다. */
export interface RuleIssueView {
  code: string;
  severity: "ERROR" | "WARNING";
  rowIds: number[];
  varId?: number | null;
  lower?: string | null;
  upper?: string | null;
  message?: string;
}

export interface RuleInfo {
  maruRuleId: string;
  maruRuleName: string;
  ruleKind: RuleKind;
  status: "CREATED" | "INUSE" | "DEPRECATED";
  sourceKind: "MDM" | "EXTERNAL" | string;
  sourceSystem?: string | null;
  description?: string | null;
  usageNote?: string | null;
}

export interface RuleVersionInfo {
  ver: number;
  status: MdmVersionStatus;
  applyFrom?: string | null;
  applyTo?: string | null;
  ownerId?: string | null;
  baseVer?: number | null;
  hitPolicy?: HitPolicyCode | null;
  rowVersion: number;
}

export interface RuleSetUsage {
  setId: string;
  setName: string;
  status: string;
  dependsOn: string[];
  dependedBy: string[];
}

/** 식 입력 칸 자동완성 소스 — 컬럼 사전 물리명(COLUMN)·앞 룰 결과 변수(RULE_RESULT). 서버 `varCandidates`. */
export interface VarCandidate {
  name: string;
  label?: string | null;
  kind: "COLUMN" | "RULE_RESULT";
}

/** 열 설정 초안이 되돌려 보낼 저장 원값(서버 `varMeta`) — `ResolvedVar` 는 해석된 값이라 따로 싣는다. */
export interface VarMeta {
  varId: number;
  axis?: "NONE" | "ROW" | "COL" | null;
  resGrp?: string | null;
  grpCond?: string | null;
  collectAgg?: string | null;
  prioList?: string[] | null;
  domainId?: number | null;
  dataType?: "BOOLEAN" | "NUMBER" | "STRING" | "DATE" | null;
}

/** `parseExpr` 응답 — 서버 EvalEx 파싱 결과. `supported=false` 면 화면이 평가하지 못 한다(서버 평가로 넘긴다). */
export interface ParseExprResult {
  ast: Record<string, unknown>;
  refVars: string[];
  supported: boolean;
  problems: Array<{ kind: string; detail: string }>;
}

/** 도메인 검색 한 줄(서버 `searchDomains`). */
export interface DomainRow {
  domainId: number;
  stdName: string;
  domainName?: string | null;
  domainKind?: string | null;
  dataType: "BOOLEAN" | "NUMBER" | "STRING" | "DATE";
  length?: number | null;
  scale?: number | null;
  stdRule?: string | null;
}

export interface RuleEditView {
  me: string;
  /** 표 편집 = 원천 MDM && 선택 버전 DRAFT && 소유자 == 나(서버 판정, I7). */
  editable: boolean;
  /** 헤더 편집(D6, 서버 판정). */
  headerEditable: boolean;
  unappliedVersionExists: boolean;
  confirmScreenReady: boolean;
  rule: RuleInfo;
  versions: RuleVersionInfo[];
  selectedVer: number | null;
  vars: ResolvedVar[];
  rows: StoredRow[];
  baseRows: StoredRow[];
  /** base(RELEASED) 버전의 해석된 변수 — 입력 계약 diff 용. */
  baseVars?: ResolvedVar[];
  varCandidates?: VarCandidate[];
  varMeta?: VarMeta[];
  /** base(RELEASED) 버전의 저장 원값 — 입력 계약 diff 가 base 의 열 조건(grp_cond) 참조를 지금 값과 섞지 않게 한다. */
  baseVarMeta?: VarMeta[];
  issues: RuleIssueView[];
  usage: { usageNote?: string | null; sets: RuleSetUsage[] };
  /** 룰의 테스트 케이스(case_id 오름차순, 버전과 무관 — TSK-08-04 §2.4). 옛 서버 응답이면 없다. */
  testCases?: TestCaseView[];
}

export interface RulePickRow {
  maruRuleId: string;
  maruRuleName: string;
  ruleKind: RuleKind;
  status: string;
  sourceKind: string;
}

export interface RuleVersionResult {
  maruRuleId?: string;
  ver?: number | null;
  rowVersion?: number | null;
}

export interface RuleTableSaveResult {
  part?: string;
  rowVersion?: number;
  rowIdMap?: Record<string, number>;
  issues?: RuleIssueView[];
  rows?: StoredRow[];
}

/** 열 설정 적용 응답. `rowIdMap` 은 새 열의 임시 ID → 발급 var_id. */
export interface ColumnsSaveResult {
  part?: string;
  rowVersion?: number;
  rowIdMap?: Record<string, number>;
  issues?: RuleIssueView[];
}

/** 화면 알림 한 줄. */
export interface RuleEditNotice {
  kind: "info" | "warning" | "error";
  text: string;
}

/** 테스트 케이스 한 건(TB_MDM_RULE_TEST_CASE, TSK-08-04 §6.6). 입력·기대는 JSON 객체 문자열. */
export interface TestCaseView {
  caseId: number;
  caseName: string;
  inputJson: string;
  expectedJson?: string | null;
  description?: string | null;
  rowVersion: number;
}

/** 케이스 저장·삭제 응답(part CASE). 삭제면 rowVersion 이 없다. */
export interface TestCaseSaveResult {
  part?: string;
  rowVersion?: number | null;
  caseId?: number | null;
}

/** 값 테스트 대상 — 편집 중인 표(BODY) 또는 저장된 버전(VERSION). 06 `MdmRuleDefinitionSource`. */
export type ValueTestTarget = "BODY" | "VERSION";

/** 결과 값 — NUMBER 는 BigDecimal `toPlainString` 문자열, 목록은 COLLECT. */
export type ValueTestValue = string | boolean | null | Array<string | boolean | null>;

/** 판정 오류 하나(엔진 `Violation`). trace 는 없다(엔진 한계 G4). */
export interface ValueTestError {
  stage: string;
  code: string;
  rowId?: number | null;
  name?: string | null;
  message: string;
}

/** 판정을 멈추지 않는 경고 — 엔진 경고와 `MISSING_CELL_AS_NA`(빠진 셀을 NA 로 본 칸). */
export interface ValueTestWarning {
  code: string;
  rowId?: number | null;
  varId?: number | null;
  message: string;
}

/** BODY 의 깨진 셀 — 이 셀이 든 행은 판정에서 빠진다(`skippedRows`, D5). */
export interface ValueTestCellError {
  rowId: number;
  varId?: number | null;
  code: string;
  message: string;
}

export interface ValueTestMismatch {
  key: string;
  expected: unknown;
  actual: unknown;
}

/** 케이스 한 건을 같은 정의로 돌린 결과. pass 가 null 이면 기대값이 없어 돌려 보기만 한 것. */
export interface ValueTestCaseResult {
  caseId: number;
  caseName: string;
  outcome: "OK" | "ERROR";
  pass: boolean | null;
  mismatches: ValueTestMismatch[];
  results?: Record<string, ValueTestValue>;
  hit?: number | number[] | null;
  errors?: ValueTestError[];
}

/** 값 테스트 응답(서버 `RuleTestResult`, TSK-08-04 §6.5). 판정 오류(outcome ERROR)면 results·hits·trace 가 없을 수 있다. */
export interface ValueTestResult {
  target: ValueTestTarget;
  ver: number | null;
  evalTs: string;
  outcome: "OK" | "ERROR";
  results?: Record<string, ValueTestValue>;
  hits?: RuleHit[];
  defaultApplied?: boolean;
  trace?: RowTrace[];
  errors?: ValueTestError[];
  warnings?: ValueTestWarning[];
  cellErrors?: ValueTestCellError[];
  skippedRows?: number[];
  contract?: { always: string[]; rows: Array<{ rowId: number; required: string[]; optional: string[] }> };
  cases?: ValueTestCaseResult[];
}
