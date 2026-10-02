/**
 * ruleSetConfirm 화면의 OASIS 호출(D-144 2단계). 봉투 해제는 ruleConfirm 과 같다(`unwrap` 재사용).
 * 호출: `POST /api/mdm/oasis/ruleSetConfirm/{action}` — search·view(READ), validate(EDIT), confirm(CONFIRM). 버전은 "1.001" 문자열.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import { unwrap } from "../ruleConfirm/api";
import type { SetConfirmResult, SetConfirmView, SetSearchResult, SetValidateResult } from "./types";

const SERVICE = "ruleSetConfirm";

async function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${SERVICE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: SERVICE }, params: cleaned }),
  });
  return unwrap<T>(res);
}

export function searchSetDrafts(keyword = ""): Promise<SetSearchResult> {
  return callOasis<SetSearchResult>("search", { keyword });
}

/** ver 를 비우면 서버가 그 세트의 DRAFT 를 고른다. */
export function viewSetDraft(setId: string, ver?: string | null): Promise<SetConfirmView> {
  return callOasis<SetConfirmView>("view", { setId, ver });
}

export function validateSetDraft(setId: string, ver: string, applyFrom: string): Promise<SetValidateResult> {
  return callOasis<SetValidateResult>("validate", { setId, ver, applyFrom });
}

export function confirmSetDraft(setId: string, ver: string, rowVersion: number, applyFrom: string, warningsAcknowledged: boolean): Promise<SetConfirmResult> {
  return callOasis<SetConfirmResult>("confirm", { setId, ver, rowVersion, applyFrom, warningsAcknowledged });
}
