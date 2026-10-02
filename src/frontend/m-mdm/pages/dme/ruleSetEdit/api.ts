/**
 * ruleSetEdit 화면의 OASIS 호출(TSK-08-06 design §6.6·§6.12, 2단계 P6) — `search`(target SET·RULE·GUIDE)·`view`·`save`·`delete`(폐기)·
 * `restore`(되살리기)·`validate`(조건식 IO)·`execute`(기록 실행).
 * 3단계(P8): 테스트 케이스 저장·삭제는 `save` 의 `part=CASE`, 일괄 실행은 `execute` 의 `runCases`, 식 파싱은 `validate` 의 `exprText` 로 한다(새 action 동사 없음).
 * 흐름은 params 의 Map 을 OASIS 가 받지 못하므로(P-D1) 정규 JSON 문자열 `flowJson` 으로 보낸다. grids 는 보내지 않는다.
 * D-144 2단계: view·save 는 버전(ver)을 싣고, copy·delete(target)·lock·unlock·handover 로 버전을 다룬다.
 */
import { callOasis } from "@/dme/oasis-call";

import type {
  CaseDraft,
  GuideResult,
  RuleSetCaseRunResult,
  RuleSetCondIoResult,
  RuleSetExprParseResult,
  RuleSetPickResult,
  RuleSetRuleSearchResult,
  RuleSetSaveResult,
  RuleSetSimulateResult,
  RuleSetStatusResult,
  RuleSetVersionResult,
  RuleSetView,
} from "./types";

const SERVICE = "ruleSetEdit";

/** 빈 문자열은 값 없음 — 칸을 보내지 않는다(callOasis 는 null·undefined 만 뺀다). */
function blankToUndefined(v: string | null | undefined): string | undefined {
  const t = (v ?? "").trim();
  return t ? t : undefined;
}

/** 세트 고르기 후보 — ID·세트명 부분 일치 20건. */
export function searchSets(keyword: string): Promise<RuleSetPickResult> {
  return callOasis<RuleSetPickResult>(SERVICE, "search", { target: "SET", keyword: blankToUndefined(keyword) });
}

/** 룰 추가 후보 — 룰 20건과 그 입출력. */
export function searchRules(keyword: string): Promise<RuleSetRuleSearchResult> {
  return callOasis<RuleSetRuleSearchResult>(SERVICE, "search", { target: "RULE", keyword: blankToUndefined(keyword) });
}

/** 구성 지침 — 결과 변수에서 거슬러 올라가 제안 순서를 받는다(저장하지 않는다). */
export function guide(resultVar: string): Promise<GuideResult> {
  return callOasis<GuideResult>(SERVICE, "search", { target: "GUIDE", resultVar: blankToUndefined(resultVar) });
}

/** 세트 보기 — ver 가 없으면 서버가 고른다(내 DRAFT → 지금 적용 중인 RELEASED → VER 최대). */
export function viewSet(setId: string, ver?: string | null): Promise<RuleSetView> {
  return callOasis<RuleSetView>(SERVICE, "view", { setId, ver: ver ?? undefined });
}

/**
 * 세트명·설명·흐름 저장 — 선택 버전(내 DRAFT)에만 쓴다. 흐름은 `flowJsonOf` 정규 JSON 문자열이다. 검사는 서버가 요청 흐름으로 다시 계산한다(I12).
 */
export function saveSet(setId: string, ver: string, setName: string, description: string, rowVersion: number, flowJson: string): Promise<RuleSetSaveResult> {
  return callOasis<RuleSetSaveResult>(SERVICE, "save", {
    setId,
    ver,
    setName: setName.trim(),
    description: blankToUndefined(description),
    rowVersion,
    flowJson,
  });
}

/** 조건식 IO — 저장하지 않은 흐름의 IF 갈래 조건식이 읽는 이름과 출처(서버가 푼다). */
export function validateFlow(flowJson: string): Promise<RuleSetCondIoResult> {
  return callOasis<RuleSetCondIoResult>(SERVICE, "validate", { flowJson });
}

/**
 * 기록 실행(디버거) — 저장하지 않은 흐름을 레코드로 돌려 노드별 기록을 받는다. evalTs 가 없으면 서버 현재 시각.
 * editsJson(4단계 E4)은 멈춘 자리에서 고친 값 목록(`editsJsonOf`)이고, 없으면 칸을 보내지 않는다.
 */
export function simulate(flowJson: string, recordJson: string, evalTs: string | undefined, editsJson?: string): Promise<RuleSetSimulateResult> {
  return callOasis<RuleSetSimulateResult>(SERVICE, "execute", { flowJson, recordJson, evalTs: blankToUndefined(evalTs), editsJson: blankToUndefined(editsJson) });
}

/** 폐기(INUSE → DEPRECATED) — delete target SET. 행 버전을 보내지 않는다(부모에 행 버전이 없다). */
export function deprecateSet(setId: string): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "delete", { setId, target: "SET" });
}

/** 되살리기(DEPRECATED → INUSE, 표시 버전의 검사를 통과할 때만). */
export function restoreSet(setId: string): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "restore", { setId });
}

/** 새 버전(D-144 2단계) — 직전 RELEASED 의 흐름·목록을 복사한 DRAFT. 응답 ver 가 새 버전이다. */
export function newSetVersion(setId: string, verKind: "MAJOR" | "MINOR"): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "copy", { setId, verKind });
}

/** DRAFT 삭제 — delete target VERSION. */
export function deleteSetDraft(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "delete", { setId, target: "VERSION", ver, rowVersion });
}

/** 확정 취소(ADR-0002 D8) — 아직 적용 전인 내 확정 버전을 DRAFT 로 되돌린다. delete target CONFIRM. */
export function cancelSetConfirm(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "delete", { setId, target: "CONFIRM", ver, rowVersion });
}

/** DRAFT 선점. */
export function lockSetVersion(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "lock", { setId, ver, rowVersion });
}

/** DRAFT 해제(소유자만). */
export function unlockSetVersion(setId: string, ver: string, rowVersion: number): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "unlock", { setId, ver, rowVersion });
}

/** DRAFT 넘기기(소유자만, 받는 사람은 담당자). */
export function handoverSetVersion(setId: string, ver: string, rowVersion: number, newOwnerId: string): Promise<RuleSetVersionResult> {
  return callOasis<RuleSetVersionResult>(SERVICE, "handover", { setId, ver, rowVersion, newOwnerId });
}

/** 테스트 케이스 저장(3단계 P8) — `save` 의 `part=CASE`. caseId 가 없으면 새 케이스(서버가 번호를 준다). */
export function saveCase(setId: string, d: CaseDraft): Promise<RuleSetSaveResult> {
  return callOasis<RuleSetSaveResult>(SERVICE, "save", {
    part: "CASE",
    setId,
    caseId: d.caseId ?? undefined,
    rowVersion: d.rowVersion ?? undefined,
    caseName: d.caseName.trim(),
    inputJson: d.inputJson,
    evalTs: blankToUndefined(d.evalTs),
    expectedJson: blankToUndefined(d.expectedJson),
    description: blankToUndefined(d.description),
  });
}

/** 테스트 케이스 삭제(3단계 P8) — `save` 의 `part=CASE` + `caseDeleted=true`. */
export function deleteCase(setId: string, caseId: number, rowVersion: number): Promise<RuleSetSaveResult> {
  return callOasis<RuleSetSaveResult>(SERVICE, "save", { part: "CASE", setId, caseId, rowVersion, caseDeleted: true });
}

/** 저장된 케이스 일괄 실행(3단계 P8) — 저장하지 않은 흐름으로 돌린다. caseIds 가 비면 전체. */
export function runCases(setId: string, flowJson: string, caseIds: readonly number[]): Promise<RuleSetCaseRunResult> {
  return callOasis<RuleSetCaseRunResult>(SERVICE, "execute", { setId, flowJson, runCases: true, caseIds: caseIds.join(",") });
}

/** 식 파싱(3단계 P-D1) — `validate` 의 `exprText`. 평가는 화면(`evalex`)이 한다. */
export function parseExprText(exprText: string): Promise<RuleSetExprParseResult> {
  return callOasis<RuleSetExprParseResult>(SERVICE, "validate", { exprText });
}
