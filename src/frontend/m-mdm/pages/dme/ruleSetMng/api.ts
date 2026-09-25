/**
 * ruleSetMng 화면의 OASIS 호출(TSK-08-06 design §6.12) — `search`(서버 페이징, 계산 칸 포함)·`reg`(빈 세트 등록).
 */
import { callOasis } from "@/dme/oasis-call";

import type { RuleSetRegForm, RuleSetRegResult, RuleSetSearchFilters, RuleSetSearchResult } from "./types";

const SERVICE = "ruleSetMng";

/** 빈 문자열은 조건 없음 — 칸을 보내지 않는다. */
function blankToUndefined(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

/** action=search — page 는 0 부터. */
export function searchSets(filters: RuleSetSearchFilters, page: number, size: number): Promise<RuleSetSearchResult> {
  return callOasis<RuleSetSearchResult>(SERVICE, "search", {
    keyword: blankToUndefined(filters.keyword),
    ruleId: blankToUndefined(filters.ruleId),
    resultVar: blankToUndefined(filters.resultVar),
    status: blankToUndefined(filters.status),
    page,
    size,
  });
}

/** action=reg — 상태·룰 목록은 보내지 않는다(서버가 INUSE·`[]` 로 쓴다, I2). */
export function registerSet(form: RuleSetRegForm): Promise<RuleSetRegResult> {
  return callOasis<RuleSetRegResult>(SERVICE, "reg", {
    setId: form.setId.trim(),
    setName: form.setName.trim(),
    description: blankToUndefined(form.description),
  });
}
