/**
 * ruleSetEdit 화면 타입(TSK-08-06 design §2.1·§6.5). 서버 레코드 `RuleIo`·`RuleSetCheck`·`RuleSetAnalyzer.SetIo` 와 ruleSetEdit DTO 의 JSON 모양과 같은
 * 칸 이름이다(JSON 필드 이름 = 레코드 컴포넌트 이름). 서버가 비운 칸은 null 로 온다.
 */

import type { RuleSetFlow, RunTrace } from "@/contract/engine-contract.generated";

/** 조건 이름의 출처 — 컬럼 사전(DICT) > 룰이 도메인·데이터 타입을 선언한 프로그램 변수(PROG) > 어디에도 없음(NONE). 결과 이름은 null. */
export type IoSource = "DICT" | "PROG" | "NONE";

/** 세트 상태(서버 계산 상태). 새로 등록한 세트는 확정 전까지 CREATED 다(D-144 2단계). */
export type RuleSetStatus = "CREATED" | "INUSE" | "DEPRECATED";

/** 세트 버전 한 행(서버 RuleSetViewResult.VersionRow, VER 내림차순, D-144 2단계). 버전은 소수 셋째 자리 문자열. */
export interface RuleSetVersionRow {
  ver: string;
  verKind: "MAJOR" | "MINOR" | null;
  verLabel: string;
  status: string;
  applyFrom: string | null;
  applyTo: string | null;
  ownerId: string | null;
  rowVersion: number;
  /** 아직 적용 전인 내 확정 버전이고 미적용 버전이 이것뿐(ADR-0002 D8). */
  cancelConfirmable: boolean;
}

/** 버전 버튼 플래그(서버 RuleSetViewResult.Flags — 룰 ruleMng 과 같은 규칙). */
export interface RuleSetVersionFlags {
  canNewMajor: boolean;
  canNewMinor: boolean;
  nextMajor: string | null;
  nextMinor: string | null;
  unappliedCount: number;
  currentVer: string | null;
  /** 담당자이고 사용 중(INUSE)이며 미적용 버전이 없다(Ruling P2-17). */
  canDeprecate: boolean;
  /** 테스트 케이스 저장·삭제 — 담당자이고 폐기 아님. 케이스는 버전이 아니라 세트에 딸린다(Ruling P2-18). 옛 응답에는 없을 수 있다. */
  canEditCases?: boolean;
}

/** copy·delete(VERSION·CONFIRM)·lock·unlock·handover 응답. */
export interface RuleSetVersionResult {
  setId: string;
  ver: string | null;
  verKind: "MAJOR" | "MINOR" | null;
  rowVersion: number | null;
}

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
  /** 최신 RELEASED 버전(`"1.001"`, D-144). RELEASED 가 없으면 null 이고 conds·results 는 비어 있다. */
  releasedVer: string | null;
  hitPolicy: string | null;
  conds: IoName[] | null;
  results: IoName[] | null;
  /** 최신 RELEASED 버전에 기본 행이 있는가(서버 `RuleIoReader`). 받는 노드 검사 CATCH_NEVER 가 쓴다. 옛 응답·시험 리터럴은 없을 수 있다(없으면 false). */
  hasDefault?: boolean;
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
  | "COND_UNTYPED"
  /** 받는 노드 붙임·종류 오류(REJECT, 받는 노드 spec §5). `flow-model.ts` 구조 검사가 낸다. */
  | "FLOW_CATCH"
  /** 받는 노드가 받는 종류가 그 룰에서 일어날 수 없다(WARN, 받는 노드 spec §5). nodeId = 받는 노드. */
  | "CATCH_NEVER"
  /** 흐름에 빈 단계(TASK)가 있다(WARN, 4단계 spec §1.1). 서버 `RuleSetAnalyzer`·화면 `set-model.ts` 가 내는 것은 Task 3. */
  | "EMPTY_TASK"
  /** 하위 세트 spec §5 — SET 노드의 세트 ID 없음·없는 세트·폐기 세트(분석기 두 벌은 WARN, 확정·되살리기에서 거부 — 편차 13). */
  | "CALL_MISSING"
  /** 하위 세트 spec §5 — 서버만 낸다(세트 호출 순환·깊이 초과·부르는 세트가 깨짐). */
  | "CALL_CYCLE"
  | "CALL_DEPTH"
  | "CALLER_BROKEN"
  /** 부르는 세트에 새 경고가 생겼다(WARN, 서버만 — 저장 결과, 문구 "부르는 세트에 경고가 생겼다: P1, P2"). 막지 않는다. */
  | "CALLER_WARN";

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

/** 하위 세트의 최종 결과 하나 — always 는 END 에 닿는 모든 경로에서 반드시 만들어지는가(서버 `SetCallIo.OutputName`, 하위 세트 Ruling 16). */
export interface SetCallOutput {
  name: string;
  dataType: string | null;
  scale: number | null;
  dateString: boolean;
  maruCodeId: string | null;
  always: boolean;
}

/**
 * 하위 세트의 겉모양(하위 세트 spec §2, 서버 `SetCallIo`·`RuleSetInterface`) — 서버만 계산하고 화면은 검사에 넣기만 한다(C-D4).
 * 분석기는 이것을 키 `set:{setId}` 의 룰 입출력처럼 본다(Ruling 6).
 */
export interface SetCallIo {
  setId: string;
  /** 세트명 — SET 노드 제목·속성 패널(Ruling 19). 없는 세트면 null. */
  setName: string | null;
  /** 기준 시각에 RELEASED 버전이 있는가(Ruling 24). DRAFT 만 있으면 false. */
  exists: boolean;
  status: string | null;
  /** 하위 세트 흐름의 입력 변수 — 예약 이름 CATCH_* 는 뺐다(편차 11). */
  inputs: IoName[];
  outputs: SetCallOutput[];
  /** endedBy 를 남기는 끝냄이 있는가(편차 10) — 처리 갈래가 END 로 가거나 처리 갈래 안 IF 갈래가 END 로 간다. SUBSET_ENDED CATCH_NEVER 판정이 쓴다. */
  endsEarly: boolean;
}

/** 세트 ID → 겉모양. 없는 키는 아직 받지 않았거나 없는 세트다(검사는 CALL_MISSING 으로 본다, Ruling 8). */
export type SetCallIoMap = Readonly<Record<string, SetCallIo | undefined>>;

/** search target SET 의 후보 한 건. */
export interface RuleSetPick {
  setId: string;
  setName: string;
  status: RuleSetStatus;
}

export interface RuleSetPickResult {
  sets?: RuleSetPick[] | null;
}

/** search target CALL_IO 응답(서버 `RuleSetCallIoResult`) — 요청 순서의 겉모양, 중복·빈 ID 는 뺐다. RELEASED 가 없는 세트도 `exists=false` 로 온다. */
export interface RuleSetCallIoResult {
  calls?: SetCallIo[] | null;
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
  /** D-144 2단계 — 선택 버전. 버전이 없는 세트면 null. 옛 응답·시험 리터럴에는 없을 수 있다. */
  ver?: string | null;
  verKind?: "MAJOR" | "MINOR" | null;
  verLabel?: string | null;
  verStatus?: string | null;
  ownerId?: string | null;
  baseVer?: string | null;
  applyFrom?: string | null;
  applyTo?: string | null;
}

/** view 응답(§6.5). `rules` 는 ruleIds 순·중복 없음, `checks` 는 저장된 목록 또는 흐름 기준. */
export interface RuleSetView {
  set: RuleSetHeader;
  rules: RuleIo[];
  checks: RuleSetCheck[];
  /** 저장된 흐름의 IF "그 외" 가 아닌 선마다 조건식 IO(P1). 흐름이 없으면 빈 맵. */
  condIo: Record<string, CondIo>;
  /** 담당자이고 선택 버전이 내 DRAFT 이며 폐기 아님(D-144 2단계). */
  editable: boolean;
  /** 담당자이고 DEPRECATED. */
  restorable: boolean;
  /**
   * 세트의 테스트 케이스(3단계 P8, CASE_ID 오름차순·최대 50). 상태와 무관하게 싣는다(P-D8).
   * 서버(Task 4)가 붙기 전 응답에는 칸이 없을 수 있으니 쓰는 곳은 `view.cases ?? []` 로 읽는다.
   */
  cases: RuleSetCaseView[];
  /** D-144 2단계 — 버전 목록(VER 내림차순)·버전 버튼 플래그·요청 사용자. 옛 응답·시험 리터럴에는 없을 수 있다. */
  versions?: RuleSetVersionRow[];
  flags?: RuleSetVersionFlags;
  me?: string | null;
  /** 저장된 흐름의 SET 노드가 부르는 세트의 겉모양(세트 ID →, 하위 세트 spec §8, 기준 시각 = 지금). 흐름이 없으면 빈 맵, 옛 응답에는 없을 수 있다. */
  calls?: Record<string, SetCallIo>;
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
  warnings?: SimWarning[];
  ruleVersions?: RuleVersionMode;
  draftVersions?: DraftVersions;
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

/** delete target SET(폐기)·restore(되살리기) 응답. rowVersion 은 D-144 2단계부터 null 이다(부모에 행 버전이 없다). */
export interface RuleSetStatusResult {
  setId: string;
  status: RuleSetStatus;
  rowVersion: number | null;
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

/**
 * 실행 중 부른 하위 세트의 저장된 흐름(하위 세트 spec §8·§11, 계획 Task 6·8) — 서버가 기록의 `sub` 를 따라 모아 `execute` 응답에 싣는다(판정 시각의 RELEASED 버전).
 * 디버거 "안으로 들어가기"가 하위 흐름을 같은 캔버스에 그릴 때 쓴다. `flow` 가 null(FLOW_JSON 없음)이면 `ruleIds` 한 줄 흐름으로 그린다.
 */
export interface CalledFlow {
  setId: string;
  setName: string | null;
  flow: (RuleSetFlow & { view?: unknown }) | null;
  ruleIds: string[];
  /** 하위 흐름 룰들의 입출력 — 들어간 캔버스의 룰 노드 제목·칩. */
  rules: RuleIo[];
}

/** execute(기록 실행) 응답(P6). */
export interface RuleSetSimulateResult {
  trace: RunTrace;
  warnings: SimWarning[];
  /** 실행 중 부른 세트 ID → 저장된 흐름(하위 세트 spec §8). 서버(srv:6)가 아직 주지 않으면 없다 — 디버거는 [안으로 들어가기]를 끈다. */
  calledFlows?: Record<string, CalledFlow>;
  /** 실행한 룰 버전 모드·흐름(하위 세트 포함)에 든 DRAFT 룰·세트(spec 2026-10-06 §4.5). 서버가 주지 않으면 없다. */
  ruleVersions?: RuleVersionMode;
  draftVersions?: DraftVersions;
}

/** 룰 버전 모드(spec 2026-10-06 §3.1) — 적용 중(기본) · 내 DRAFT 우선. */
export type RuleVersionMode = "RELEASED" | "MY_DRAFT";
/** 흐름(하위 세트 포함)에 든 DRAFT 룰·세트 → VER(scale 3 글자). 서버 `RuleSetSimulateResult.draftVersions`. */
export interface DraftVersions { rules: Record<string, string>; sets: Record<string, string> }
export const NO_DRAFTS: DraftVersions = Object.freeze({ rules: {}, sets: {} }) as DraftVersions;
