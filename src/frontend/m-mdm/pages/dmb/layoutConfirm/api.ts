/**
 * layoutConfirm 화면의 OASIS BFF 호출(D-144 3단계). 모양은 dme/ruleConfirm/api.ts 와 같다 — 공유 파일을 바꾸지 않는다.
 *
 * 호출: `POST /api/mdm/oasis/layoutConfirm/{action}` — search·view(READ), validate(EDIT), confirm(CONFIRM).
 * 레이아웃 버전은 소수 셋째 자리 문자열로 보낸다(`"1.001"`).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { ConfirmResult, SearchResult, ValidateResult, ViewResult } from "./types";

const SERVICE = "layoutConfirm";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
}

/** 봉투 해제 + 업무 거부 판정. 거부 message 는 그대로 화면 오류 문구가 된다. 성공이면 `data.result` 를 펼친다. */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  const inner = env?.data?.["result"];
  if (inner && typeof inner === "object" && !Array.isArray(inner)) {
    Object.assign(out, inner as Record<string, unknown>);
  }
  return out as T;
}

/** params 의 null·undefined 는 뺀다 — OASIS 가 null 값의 타입을 정하지 못해 요청 전체가 실패한다(F23). */
async function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${SERVICE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: SERVICE }, params: cleaned }),
  });
  return unwrap<T>(res);
}

export function searchDrafts(keyword = ""): Promise<SearchResult> {
  return callOasis<SearchResult>("search", { keyword });
}

/** ver 를 비우면 서버가 그 레이아웃의 DRAFT 를 고른다. */
export function viewDraft(layoutId: number, ver?: string | null): Promise<ViewResult> {
  return callOasis<ViewResult>("view", { layoutId, ver });
}

/** 쓰기 없는 사전 검사 — 변경 분류·동시 전환·헤더 영향도를 받는다. */
export function validateDraft(layoutId: number, ver: string, applyFrom: string): Promise<ValidateResult> {
  return callOasis<ValidateResult>("validate", { layoutId, ver, applyFrom });
}

export function confirmDraft(
  layoutId: number, ver: string, rowVersion: number, applyFrom: string, warningsAcknowledged: boolean,
): Promise<ConfirmResult> {
  return callOasis<ConfirmResult>("confirm", { layoutId, ver, rowVersion, applyFrom, warningsAcknowledged });
}
