/**
 * ruleSetEdit 화면의 OASIS 호출(TSK-08-06 design §6.6·§6.12) — `search`(target SET·RULE·GUIDE)·`view`·`save`·`delete`(폐기)·`restore`(되살리기).
 * 룰 목록은 params 배열을 받지 못하므로 `grids.rules.rows` 로 보낸다(F14).
 */
import { callOasis } from "@/dme/oasis-call";

import type {
  GuideResult,
  RuleSetPickResult,
  RuleSetRuleSearchResult,
  RuleSetSaveResult,
  RuleSetStatusResult,
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

export function viewSet(setId: string): Promise<RuleSetView> {
  return callOasis<RuleSetView>(SERVICE, "view", { setId });
}

/** 세트명·설명·룰 목록 저장. 검사는 서버가 요청 목록으로 다시 계산한다(I12). */
export function saveSet(
  setId: string,
  setName: string,
  description: string,
  rowVersion: number,
  ruleIds: readonly string[],
): Promise<RuleSetSaveResult> {
  return callOasis<RuleSetSaveResult>(
    SERVICE,
    "save",
    { setId, setName: setName.trim(), description: blankToUndefined(description), rowVersion },
    { rules: { rows: ruleIds.map((ruleId) => ({ ruleId })) } },
  );
}

/** 폐기(INUSE → DEPRECATED). */
export function deprecateSet(setId: string, rowVersion: number): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "delete", { setId, rowVersion });
}

/** 되살리기(DEPRECATED → INUSE, 저장된 목록의 검사를 통과할 때만). */
export function restoreSet(setId: string, rowVersion: number): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "restore", { setId, rowVersion });
}
