/**
 * ruleSetEdit 화면의 OASIS 호출(TSK-08-06 design §6.6·§6.12, 2단계 P6) — `search`(target SET·RULE·GUIDE)·`view`·`save`·`delete`(폐기)·
 * `restore`(되살리기)·`validate`(조건식 IO)·`execute`(기록 실행).
 * 흐름은 params 의 Map 을 OASIS 가 받지 못하므로(P-D1) 정규 JSON 문자열 `flowJson` 으로 보낸다. grids 는 보내지 않는다.
 */
import { callOasis } from "@/dme/oasis-call";

import type {
  GuideResult,
  RuleSetCondIoResult,
  RuleSetPickResult,
  RuleSetRuleSearchResult,
  RuleSetSaveResult,
  RuleSetSimulateResult,
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

/** 세트명·설명·흐름 저장. 흐름은 `flowJsonOf` 정규 JSON 문자열이다. 검사는 서버가 요청 흐름으로 다시 계산한다(I12). */
export function saveSet(setId: string, setName: string, description: string, rowVersion: number, flowJson: string): Promise<RuleSetSaveResult> {
  return callOasis<RuleSetSaveResult>(SERVICE, "save", {
    setId,
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

/** 기록 실행(디버거) — 저장하지 않은 흐름을 레코드로 돌려 노드별 기록을 받는다. evalTs 가 없으면 서버 현재 시각. */
export function simulate(flowJson: string, recordJson: string, evalTs: string | undefined): Promise<RuleSetSimulateResult> {
  return callOasis<RuleSetSimulateResult>(SERVICE, "execute", { flowJson, recordJson, evalTs: blankToUndefined(evalTs) });
}

/** 폐기(INUSE → DEPRECATED). */
export function deprecateSet(setId: string, rowVersion: number): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "delete", { setId, rowVersion });
}

/** 되살리기(DEPRECATED → INUSE, 저장된 목록의 검사를 통과할 때만). */
export function restoreSet(setId: string, rowVersion: number): Promise<RuleSetStatusResult> {
  return callOasis<RuleSetStatusResult>(SERVICE, "restore", { setId, rowVersion });
}
