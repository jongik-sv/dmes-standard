/**
 * ruleMng 화면의 OASIS 호출(TSK-08-02 design §6.1) — `search`(서버 페이징)·`reg`(MDM 원천 룰 등록).
 */
import { callOasis } from "@/dme/oasis-call";

import type { RuleRegForm, RuleRegResult, RuleSearchFilters, RuleSearchResult } from "./types";

const SERVICE = "ruleMng";

/** 빈 문자열은 조건 없음 — 칸을 보내지 않는다. */
function blankToUndefined(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

/** action=search — page 는 0 부터. */
export function searchRules(filters: RuleSearchFilters, page: number, size: number): Promise<RuleSearchResult> {
  return callOasis<RuleSearchResult>(SERVICE, "search", {
    keyword: blankToUndefined(filters.keyword),
    ruleKind: blankToUndefined(filters.ruleKind),
    status: blankToUndefined(filters.status),
    page,
    size,
  });
}

/** action=reg — 원천은 보내지 않는다(서버가 MDM 으로 쓴다, I2). */
export function registerRule(form: RuleRegForm): Promise<RuleRegResult> {
  return callOasis<RuleRegResult>(SERVICE, "reg", {
    maruRuleId: form.maruRuleId.trim(),
    maruRuleName: form.maruRuleName.trim(),
    ruleKind: form.ruleKind,
    description: blankToUndefined(form.description),
    usageNote: blankToUndefined(form.usageNote),
  });
}
