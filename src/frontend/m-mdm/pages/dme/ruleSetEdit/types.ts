/**
 * ruleSetEdit 화면 타입(TSK-08-06 design §2.1·§6.5). 서버 레코드 `RuleIo`·`RuleSetCheck`·`RuleSetAnalyzer.SetIo` 와 ruleSetEdit DTO 의 JSON 모양과 같은
 * 칸 이름이다(JSON 필드 이름 = 레코드 컴포넌트 이름). 서버가 비운 칸은 null 로 온다.
 */

import type { RuleSetFlow, RunTrace } from "@/contract/engine-contract.generated";

/** 조건 이름의 출처 — 컬럼 사전(DICT) > 룰이 도메인·데이터 타입을 선언한 프로그램 변수(PROG) > 어디에도 없음(NONE). 결과 이름은 null. */
export type IoSource = "DICT" | "PROG" | "NONE";

export type RuleSetStatus = "INUSE" | "DEPRECATED";

/** 선의 변수 칩 표시 — 끔 · 변수 ID · 변수 표시명(없으면 ID). 툴바 [변수 흐름] 이 off → id → name → off 로 돈다. */
export type VarDisplay = "off" | "id" | "name";

/** 읽거나 만드는 이름 하나와 그 타입·표시명. NONE 이면 타입·표시명은 null 이다. */
export interface IoName {
  name: string;
  source: IoSource | null;
  label: string | null;
  dataType: string | null;
  scale: number | null;
  dateString: boolean;
  maruCodeId: string | null;
}

/** 룰 하나의 입출력 — 최신 RELEASED 버전에서 읽는 이름(conds)과 만드는 이름(results), 첫 등장 순(서버 `RuleIoReader`, §6.1). */
export interface RuleIo {
  ruleId: string;
  ruleName: string | null;
  ruleKind: string | null;
  status: string | null;
  /** 없는 룰이면 false 이고 나머지는 null·빈 목록. */
  exists: boolean;
  /** RELEASED 가 없으면 null 이고 conds·results 는 비어 있다. */
  releasedVer: number | null;
  hitPolicy: string | null;
  conds: IoName[] | null;
  results: IoName[] | null;
}

/** 세트 계산에 넘기는 룰 입출력 맵(룰 ID → IO). 없는 키는 없는 룰이다. */
export type RuleIoMap = Readonly<Record<string, RuleIo | undefined>>;

export type RuleSetSeverity = "REJECT" | "WARN";

/**
 * IF 갈래 조건식 하나를 서버가 미리 푼 결과(계획 C4). ok=false 면 message 는 파싱 오류 문구이고 vars 는 비어 있다.
 * vars 의 source 는 DICT(컬럼 사전에 있음) 또는 NONE 이다.
 */
export interface CondIo {
  ok: boolean;
  message: string | null;
  vars: IoName[];
}

/** 선 ID → 조건식 IO. IF 의 "그 외" 가 아닌 선만 키가 있다. */
export type CondIoMap = Readonly<Record<string, CondIo | undefined>>;

export type RuleSetCheckCode =
  | "EMPTY"
  | "RULE_NOT_FOUND"
  | "RULE_DEPRECATED"
  | "NO_RELEASED"
  | "ORDER"
  | "CYCLE"
  | "UNKNOWN_INPUT"
  | "DUP_RESULT"
  | "FLOW_STRUCTURE"
  | "FLOW_IF_ELSE"
  | "FLOW_COND"
  | "IF_SIBLING"
  | "PAR_SIBLING"
  | "FLOW_PARTIAL"
  | "FLOW_READONLY"
  | "COND_UNTYPED";

/**
 * 저장 시 검사 한 건(§6.3, 계획 C4). 없는 칸은 null — EMPTY 는 ruleId 도 null, 1단계는 otherRuleId·varName 이 null.
 * nodeId·edgeId 는 흐름 위치(D8)이고 목록 세트 검사(`setChecks`)는 둘 다 null 이다.
 */
export interface RuleSetCheck {
  code: RuleSetCheckCode;
  severity: RuleSetSeverity;
  ruleId: string | null;
  otherRuleId: string | null;
  varName: string | null;
  message: string;
  nodeId: string | null;
  edgeId: string | null;
}

/** 입력 변수 — 앞 룰이 만들지 않은 이름. 타입·출처는 처음 읽은 룰의 것, `users` 는 읽는 룰(목록 순). */
export interface InputRow {
  name: string;
  label: string | null;
  dataType: string | null;
  scale: number | null;
  dateString: boolean;
  maruCodeId: string | null;
  source: IoSource | null;
  users: string[];
}

/** 결과 변수 — 타입은 처음 만든 룰의 것. `by` 는 만드는 룰, `readers` 는 만든 뒤에 읽는 룰(목록 순). readers 가 비면 최종 결과다. */
export interface ResultRow {
  name: string;
  dataType: string | null;
  scale: number | null;
  dateString: boolean;
  maruCodeId: string | null;
  by: string[];
  readers: string[];
}

/** 세트 입출력 표(§6.2). 저장하지 않는다. */
export interface SetIo {
  inputs: InputRow[];
  results: ResultRow[];
}

/** search target SET 의 후보 한 건. */
export interface RuleSetPick {
  setId: string;
  setName: string;
  status: RuleSetStatus;
}

export interface RuleSetPickResult {
  sets?: RuleSetPick[] | null;
}

/** search target RULE — 룰 20건과 그 IO. */
export interface RuleSetRuleSearchResult {
  rules?: RuleIo[] | null;
}

export interface GuideAmbiguity {
  varName: string;
  ruleIds: string[];
}

/** search target GUIDE(§6.4). 오류가 나면 order·ambiguous 는 빈 목록이고 error 에 문구가 온다. `rules` 는 order 룰의 IO. */
export interface GuideResult {
  target: string | null;
  order: string[];
  ambiguous: GuideAmbiguity[];
  error: string | null;
  rules: RuleIo[];
}

export interface RuleSetHeader {
  setId: string;
  setName: string;
  description: string | null;
  status: RuleSetStatus;
  rowVersion: number;
  /** 흐름을 펼친 룰 목록(RULE_IDS, 중복 없음). */
  ruleIds: string[];
  /** 저장된 흐름(FLOW_JSON, view 포함). 목록으로만 저장된 세트면 null. */
  flow: RuleSetFlow | null;
  /** 분기(IF·병렬)가 있는 흐름이면 true. 화면은 한 줄·분기 세트 모두 캔버스로 편집한다(P-D5). */
  branched: boolean;
}

/** view 응답(§6.5). `rules` 는 ruleIds 순·중복 없음, `checks` 는 저장된 목록 또는 흐름 기준. */
export interface RuleSetView {
  set: RuleSetHeader;
  rules: RuleIo[];
  checks: RuleSetCheck[];
  /** 저장된 흐름의 IF "그 외" 가 아닌 선마다 조건식 IO(P1). 흐름이 없으면 빈 맵. */
  condIo: Record<string, CondIo>;
  /** 담당자이고 INUSE. */
  editable: boolean;
  /** 담당자이고 DEPRECATED. */
  restorable: boolean;
  /**
   * 세트의 테스트 케이스(3단계 P8, CASE_ID 오름차순·최대 50). 상태와 무관하게 싣는다(P-D8).
   * 서버(Task 4)가 붙기 전 응답에는 칸이 없을 수 있으니 쓰는 곳은 `view.cases ?? []` 로 읽는다.
   */
  cases: RuleSetCaseView[];
}

/** 룰 세트 테스트 케이스 한 건(3단계 P8, `TB_MDM_RULE_SET_TEST_CASE`). evalTs 는 KST `yyyy-MM-dd HH:mm:ss` 문자열(P-D6). */
export interface RuleSetCaseView {
  caseId: number;
  caseName: string | null;
  inputJson: string;
  evalTs: string | null;
  expectedJson: string | null;
  description: string | null;
  rowVersion: number;
}

/** 케이스 저장 입력(3단계 P8) — caseId·rowVersion 이 null 이면 새 케이스. 빈 글자 칸은 보내지 않는다. */
export interface CaseDraft {
  caseId: number | null;
  rowVersion: number | null;
  caseName: string;
  inputJson: string;
  evalTs: string;
  expectedJson: string;
  description: string;
}

/** 케이스 실행 오류 한 건 — 서버 `RuleCaseJudge.error(Violation)` 모양. */
export interface CaseRunError {
  stage: string;
  code: string;
  rowId: number | null;
  name: string | null;
  message: string;
  detail: string | null;
}

/** 기대값과 결과가 다른 칸 하나. actual 이 null 이면 결과에 없다. */
export interface CaseMismatch {
  key: string;
  expected: unknown;
  actual: unknown;
}

/** 케이스 하나의 실행 판정(3단계 P7 `RuleSetCaseJudge.judge`). pass=null 은 기대값 없이 실행만 한 것(P-D4). */
export interface CaseRunResult {
  caseId: number;
  caseName: string | null;
  outcome: "OK" | "ERROR";
  pass: boolean | null;
  mismatches: CaseMismatch[];
  finalValues: Record<string, unknown>;
  errors: CaseRunError[];
}

/** execute(runCases) 응답 — 케이스별 판정. */
export interface RuleSetCaseRunResult {
  cases: CaseRunResult[];
}

/** 식 파싱 결과(3단계 P-D1) — 서버 `RuleExprParseResult`. supported=false 면 화면에서 평가하지 않는다. */
export interface ExprParse {
  ast: unknown;
  refVars: string[];
  supported: boolean;
  problems: { kind: string; detail: string }[];
}

/** validate(exprText) 응답. */
export interface RuleSetExprParseResult {
  expr: ExprParse;
}

/**
 * save 응답 — 새 rowVersion 과 WARN 검사. 케이스 쓰기(`part=CASE`, 3단계 P8)면 rowVersion 은 케이스의 것(삭제면 null)이고 caseId 가 온다.
 */
export interface RuleSetSaveResult {
  setId: string;
  rowVersion: number | null;
  caseId?: number | null;
  checks: RuleSetCheck[];
}

/** delete(폐기)·restore(되살리기) 응답. */
export interface RuleSetStatusResult {
  setId: string;
  status: RuleSetStatus;
  rowVersion: number;
  checks: RuleSetCheck[];
}

/** validate(조건식 IO) 응답(P6) — 요청 흐름의 IF "그 외" 가 아닌 선마다. */
export interface RuleSetCondIoResult {
  condIo: Record<string, CondIo>;
}

/** execute(기록 실행) 경고 한 건(P5 warnings). */
export interface SimWarning {
  code: string;
  ruleId: string | null;
  message: string;
}

/** execute(기록 실행) 응답(P6). */
export interface RuleSetSimulateResult {
  trace: RunTrace;
  warnings: SimWarning[];
}
