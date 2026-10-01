/**
 * ruleEdit 화면의 OASIS 호출(TSK-08-02 design §6.1, decisions.md D-105) — search·view·save(TABLE|COLUMNS|CASE),
 * 식 파싱 validate, 값 테스트 execute(TSK-08-04 §6.5). **내용 편집만** 한다.
 *
 * <p>D-105 로 헤더·버전 관리(_HEADER_ 저장·폐기·새 버전·DRAFT 삭제·선점·해제·넘기기·확정 취소)는 `ruleMng` 화면으로
 * 옮겨 갔다 — 서버 서비스도 `ruleMng` 의 `view`·`save`·`copy`·`delete`·`lock`·`unlock`·`handover` 로 옮겨 갔다.
 * 적중 정책(HIT_POLICY)은 판정표의 해석 규칙이라 여기서 표와 함께 저장한다(D-133, D-105 (4) 번복).
 *
 * <p>표 저장의 행은 params 가 아니라 `grids.rows.rows` 로 보낸다(Build 이탈 B4). 쓰기 뒤에는 화면이 view 를 다시 불러
 * row_version 을 맞춘다.
 */
import { callOasis } from "@/dme/oasis-call";

import type {
  ColumnsSaveResult,
  DomainRow,
  HitPolicyCode,
  ParseExprResult,
  RuleEditView,
  RulePickRow,
  RuleTableSaveResult,
  TestCaseSaveResult,
  TestCaseView,
  ValueTestResult,
  ValueTestTarget,
} from "./types";

const SERVICE = "ruleEdit";

export async function searchRulePrefix(keyword: string): Promise<RulePickRow[]> {
  const res = await callOasis<{ list?: RulePickRow[] }>(SERVICE, "search", { keyword: keyword.trim() || undefined });
  return res.list ?? [];
}

export function viewRule(ruleId: string, ver?: number | null): Promise<RuleEditView> {
  return callOasis<RuleEditView>(SERVICE, "view", { maruRuleId: ruleId, ver: ver ?? undefined });
}

/** 표 저장 한 행 — rowId 는 새 행이면 음수 임시 ID, 순서가 곧 표시 순서다(seq 는 서버가 정한다, I10). */
export interface TableSaveRow {
  rowId: number;
  rowKind: "NORMAL" | "DEFAULT";
  cells: string;
  note?: string | null;
}

/**
 * 표 저장 — 행과 적중 정책을 한 요청·한 트랜잭션으로 저장한다(D-133). 정책은 판정 룰(DECISION)만 싣고, 산출 룰은 비운다
 * (서버가 거부한다). 서버는 정책이 바뀌면 새 정책으로 표를 검사하고, 저장된 열 설정(집계·순위·결과 열 그룹)이 새 정책과
 * 어긋나면 거부한다.
 */
export function saveTable(
  ruleId: string,
  ver: number,
  rowVersion: number,
  rows: TableSaveRow[],
  hitPolicy?: HitPolicyCode | null,
): Promise<RuleTableSaveResult> {
  return callOasis<RuleTableSaveResult>(
    SERVICE,
    "save",
    { part: "TABLE", maruRuleId: ruleId, ver, rowVersion, hitPolicy: hitPolicy ?? undefined },
    { rows: { rows: tableGridRows(rows) } },
  );
}

/** 표 행 → `grids.rows.rows` 한 줄(빈 행 설명은 뺀다). 표 저장과 값 테스트 BODY 가 같은 모양을 쓴다. */
function tableGridRows(rows: readonly TableSaveRow[]): Array<Record<string, unknown>> {
  return rows.map((r) => {
    const out: Record<string, unknown> = { rowId: r.rowId, rowKind: r.rowKind, cells: r.cells };
    if (r.note != null && r.note !== "") out.note = r.note;
    return out;
  });
}

/** 값 테스트 요청(§6.5). BODY 는 편집 중인 행·적중 정책을 싣고(변수는 그 DRAFT 의 저장된 열, D4), VERSION 은 버전만. */
export interface ValueTestRequest {
  ruleId: string;
  target: ValueTestTarget;
  ver: number;
  /** BODY 만 — 편집 중인 적중 정책. */
  hitPolicy?: HitPolicyCode | null;
  /** BODY 만 — 표 저장과 같은 모양, 새 행은 음수 임시 ID. */
  rows?: TableSaveRow[];
  /** JSON 객체 문자열 — 키 없음과 null 을 구분한다(I21). 중첩 Map 바인딩을 피하려고 문자열로 보낸다. */
  inputJson: string;
  /** 이 룰의 테스트 케이스를 같은 정의로 모두 돌린다. */
  runCases?: boolean;
  /**
   * 이 케이스들만 돌린다 — 카드 ⑥ 의 "실행". runCases 와 함께 쓴다.
   * 서버가 같은 RuleCaseJudge 로 판정하므로 결과 배지가 "모두 실행" 과 동일하다.
   */
  caseIds?: number[];
  /**
   * 저장 전 케이스 판정 — 수정 팝업의 "테스트 실행". 켜면 inputJson 의 결과를 expectedJson 과 서버가 견줘 `draftCase` 로 돌려준다(I24).
   * 빈 expectedJson 은 "실행만"(pass null)이다.
   */
  judge?: { expectedJson: string };
}

/** 값 테스트 — BPMN action=execute(EDIT). 원장에 쓰지 않는다(I19). 행은 `grids.rows.rows`. */
export function runValueTest(req: ValueTestRequest): Promise<ValueTestResult> {
  const body = req.target === "BODY";
  return callOasis<ValueTestResult>(
    SERVICE,
    "execute",
    {
      maruRuleId: req.ruleId,
      target: req.target,
      ver: req.ver,
      hitPolicy: body ? (req.hitPolicy ?? undefined) : undefined,
      inputJson: req.inputJson,
      runCases: req.runCases ? true : undefined,
      // OASIS 최상위 dto property 로 List 를 둘 수 없어 콤마 문자열로 보낸다(서버 DTO 와 같은 사유).
      caseIds: req.caseIds && req.caseIds.length > 0 ? req.caseIds.join(",") : undefined,
      // 빈 기대 JSON("실행만")도 그대로 보낸다 — 켬 여부는 judgeInput 이 가른다.
      judgeInput: req.judge ? true : undefined,
      expectedJson: req.judge ? req.judge.expectedJson : undefined,
    },
    body ? { rows: { rows: tableGridRows(req.rows ?? []) } } : undefined,
  );
}

/** 케이스 저장 칸 — caseId 가 없으면 새 케이스(서버가 발급), 있으면 rowVersion 조건 수정. */
export interface TestCaseForm {
  caseId?: number | null;
  rowVersion?: number | null;
  caseName: string;
  inputJson: string;
  expectedJson?: string | null;
  description?: string | null;
}

/**
 * 테스트 케이스 복사 — action=save part=CASE 에 caseId 를 빼고 새로 넣는다.
 * 서버 `RuleTestCaseService.save` 는 caseId 가 null 이면 insert 분기로 새 케이스를 만들므로
 * 별도 서버 동작이 필요 없다. 이름·설명·입력·기대를 원본에서 복제하고, 이름만
 * 「원본 이름 (복사)」로 바꿔 바로 구분되게 한다. rowVersion 도 싣지 않는다(신규 행엔 무의미).
 */
export function copyTestCase(ruleId: string, src: TestCaseView): Promise<TestCaseSaveResult> {
  return callOasis<TestCaseSaveResult>(SERVICE, "save", {
    part: "CASE",
    maruRuleId: ruleId,
    caseName: copiedCaseName(src.caseName),
    inputJson: src.inputJson,
    expectedJson: src.expectedJson || undefined,
    description: src.description || undefined,
  });
}

/** 복사본 이름 — "기본" → "기본 (복사)". 서버 이름 길이 제한에 걸리지 않도록 잘라 담는다. */
export function copiedCaseName(name: string, max = 100): string {
  const suffix = " (복사)";
  const base = name.length + suffix.length > max ? name.slice(0, max - suffix.length) : name;
  return `${base}${suffix}`;
}

/** 테스트 케이스 저장 — action=save part=CASE(§6.6). 버전·DRAFT 소유와 무관하다(D8). */
export function saveTestCase(ruleId: string, form: TestCaseForm): Promise<TestCaseSaveResult> {
  return callOasis<TestCaseSaveResult>(SERVICE, "save", {
    part: "CASE",
    maruRuleId: ruleId,
    caseId: form.caseId ?? undefined,
    rowVersion: form.rowVersion ?? undefined,
    caseName: form.caseName,
    inputJson: form.inputJson,
    expectedJson: form.expectedJson || undefined,
    description: form.description || undefined,
  });
}

/** 테스트 케이스 삭제 — action=save part=CASE caseDeleted=true, rowVersion 조건(MDM001). */
export function deleteTestCase(ruleId: string, caseId: number, rowVersion: number): Promise<TestCaseSaveResult> {
  return callOasis<TestCaseSaveResult>(SERVICE, "save", { part: "CASE", maruRuleId: ruleId, caseId, rowVersion, caseDeleted: true });
}

/**
 * 열 설정 적용(part COLUMNS, TSK-08-03) — 줄 배열은 표 저장과 같이 `grids.rows.rows` 로 보낸다(B4). 적중 정책은 보내지 않는다
 * (산출 룰에 보내면 거부되고, 안 보내면 서버가 현재 값을 쓴다). null·빈 칸은 뺀다(OASIS 가 null 을 받지 못한다).
 */
export function saveColumnDraft(
  ruleId: string,
  ver: number,
  rowVersion: number,
  rows: Array<Record<string, unknown>>,
): Promise<ColumnsSaveResult> {
  const gridRows = rows.map((r) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== null && v !== undefined)));
  return callOasis<ColumnsSaveResult>(SERVICE, "save", { part: "COLUMNS", maruRuleId: ruleId, ver, rowVersion }, { rows: { rows: gridRows } });
}

/** 식 서버 파싱 — BPMN action=validate(EDIT). 파싱은 서버 EvalEx 만 한다(불변 9). 파싱 오류는 OasisCallError 로 온다. */
export function parseExpr(text: string, slot: ExprSlot): Promise<ParseExprResult> {
  return callOasis<ParseExprResult>(SERVICE, "validate", { text, slot });
}

/** 값 타입 도메인 검색 — BPMN action=search target=DOMAIN(8건). */
export async function searchDomains(keyword: string): Promise<DomainRow[]> {
  const res = await callOasis<{ rows?: DomainRow[] }>(SERVICE, "search", { target: "DOMAIN", keyword: keyword.trim() || undefined });
  return res.rows ?? [];
}

/** 서버 `FunctionSets.Slot` — 식 칸 종류가 허용 함수 집합을 정한다. */
export type ExprSlot = "RULE_COND_EXPR" | "RULE_GRP_COND" | "RULE_RESULT_EXPR";
