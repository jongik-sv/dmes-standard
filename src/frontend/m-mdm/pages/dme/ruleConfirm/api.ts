/**
 * ruleConfirm 화면의 OASIS BFF 호출(TSK-08-05 design.md §6.5). 모양은 dmc/codeConfirm/api.ts 를 복제했다 — 공유 파일을
 * 바꾸지 않는다.
 *
 * 호출: `POST /api/mdm/oasis/ruleConfirm/{action}` — search·view(READ), validate(EDIT), confirm(CONFIRM).
 * 룰 버전은 정수로 보낸다(I37). 그리드가 없는 액션이라 `grids` 를 보내지 않는다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { ConfirmResult, SearchResult, ValidateResult, ViewResult } from "./types";

const SERVICE = "ruleConfirm";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
}

/**
 * 봉투 해제 + 업무 거부 판정. BPMN 안에서 던진 업무 오류는 `meta.message`(서버 예외 message)만 오고 `errors[]` 는
 * 비어 있다(06-04 F11). 그래서 message 를 그대로 화면 오류 문구로 쓴다(I39). 성공이면 `data.result` 를 펼친다.
 */
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

/** ver 를 비우면 서버가 그 룰의 DRAFT 를 고른다. */
export function viewDraft(maruRuleId: string, ver?: number | null): Promise<ViewResult> {
  return callOasis<ViewResult>("view", { maruRuleId, ver });
}

/** 쓰기 없는 사전 검사 — 항목 4행·적용 순서와 서버 시계 기준 `futureApplyFrom` 을 받는다. */
export function validateDraft(maruRuleId: string, ver: number, applyFrom: string): Promise<ValidateResult> {
  return callOasis<ValidateResult>("validate", { maruRuleId, ver, applyFrom });
}

export function confirmDraft(
  maruRuleId: string, ver: number, rowVersion: number, applyFrom: string, warningsAcknowledged: boolean,
): Promise<ConfirmResult> {
  return callOasis<ConfirmResult>("confirm", { maruRuleId, ver, rowVersion, applyFrom, warningsAcknowledged });
}
