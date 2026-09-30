/**
 * ruleSetEdit 화면 타입(TSK-08-06 design §2.1·§6.5). 서버 레코드 `RuleIo`·`RuleSetCheck`·`RuleSetAnalyzer.SetIo` 와 ruleSetEdit DTO 의 JSON 모양과 같은
 * 칸 이름이다(JSON 필드 이름 = 레코드 컴포넌트 이름). 서버가 비운 칸은 null 로 온다.
 */

/** 조건 이름의 출처 — 컬럼 사전(DICT) > 룰이 도메인·데이터 타입을 선언한 프로그램 변수(PROG) > 어디에도 없음(NONE). 결과 이름은 null. */
export type IoSource = "DICT" | "PROG" | "NONE";

export type RuleSetStatus = "INUSE" | "DEPRECATED";

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
  | "FLOW_READONLY";

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
  ruleIds: string[];
}

/** view 응답(§6.5). `rules` 는 ruleIds 순·중복 없음, `checks` 는 저장된 목록 기준. */
export interface RuleSetView {
  set: RuleSetHeader;
  rules: RuleIo[];
  checks: RuleSetCheck[];
  /** 담당자이고 INUSE. */
  editable: boolean;
  /** 담당자이고 DEPRECATED. */
  restorable: boolean;
}

/** save 응답 — 새 rowVersion 과 WARN 검사. */
export interface RuleSetSaveResult {
  setId: string;
  rowVersion: number;
  checks: RuleSetCheck[];
}

/** delete(폐기)·restore(되살리기) 응답. */
export interface RuleSetStatusResult {
  setId: string;
  status: RuleSetStatus;
  rowVersion: number;
  checks: RuleSetCheck[];
}
