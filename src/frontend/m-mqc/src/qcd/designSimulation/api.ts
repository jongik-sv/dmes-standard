/**
 * 시뮬레이션 OASIS 호출 — designSimulation(search·view·run·save·apply·delete). 배열·객체는 JSON 글로 싣는다(OASIS params 는 납작한 글자).
 */
import { callOasis } from "@/common/oasis";
import { compactParams } from "@/qdr/qualityDesignResult/api";

import {
  SCREEN_ID,
  type CaseRunResult,
  type CaseSaveInput,
  type CaseSearchResult,
  type CaseViewResult,
  type OrderFields,
} from "./types";

export function searchCases(keyword?: string): Promise<CaseSearchResult> {
  return callOasis<CaseSearchResult>(SCREEN_ID, "search", compactParams({ keyword }));
}

export function viewCase(caseId: string): Promise<CaseViewResult> {
  return callOasis<CaseViewResult>(SCREEN_ID, "view", { caseId });
}

/** 주문 JSON — 값이 null 인 키도 남긴다(빈칸 = 미입력 NULL). */
export function orderJson(order: OrderFields): string {
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(order)) {
    if (k.startsWith("_")) continue;
    out[k] = v == null || String(v).trim() === "" ? null : String(v);
  }
  return JSON.stringify(out);
}

/** 실행 — order 를 주면 저장하지 않은 고친 주문으로 돌린다. */
export function runCase(caseId: string, order?: OrderFields | null): Promise<CaseRunResult> {
  return callOasis<CaseRunResult>(SCREEN_ID, "run", order ? { caseId, orderJson: orderJson(order) } : { caseId });
}

/** 지금 설계결과를 골든으로 채택. */
export function applyGolden(caseId: string, order?: OrderFields | null): Promise<CaseRunResult> {
  return callOasis<CaseRunResult>(SCREEN_ID, "apply", order ? { caseId, orderJson: orderJson(order) } : { caseId });
}

export function saveParams(input: CaseSaveInput): Record<string, string> {
  return {
    ...compactParams({ caseId: input.caseId ?? "", caseNm: input.caseNm, baseOrdRef: input.baseOrdRef ?? "" }),
    orderJson: orderJson(input.order),
    pinsJson: JSON.stringify(input.pins ?? []),
    verdictsJson: JSON.stringify(input.verdicts ?? []),
  };
}

/** 저장 — caseId 가 비면 새 케이스(TC-1nn). */
export function saveCase(input: CaseSaveInput): Promise<CaseViewResult> {
  return callOasis<CaseViewResult>(SCREEN_ID, "save", saveParams(input));
}

export async function deleteCase(caseId: string): Promise<string> {
  const out = await callOasis<{ caseId?: string }>(SCREEN_ID, "delete", { caseId });
  return out.caseId ?? caseId;
}
