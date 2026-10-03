/**
 * codeConfirm 화면의 OASIS BFF 호출(TSK-06-05 design.md §6.5). 모양은 codeItemEdit/cate/api.ts 를 복제했다 — 공유 파일을
 * 바꾸지 않는다.
 *
 * 호출: `POST /api/mdm/oasis/codeConfirm/{action}` — search·view(READ), validate(EDIT), confirm(CONFIRM).
 * 버전은 문자열로 보낸다(JS number 는 2.000 의 소수 자릿수를 잃는다). 그리드가 없는 액션이라 `grids` 를 보내지 않는다.
 */
import { callOasisAt, unwrapOasis, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import type { ConfirmResult, SearchResult, ValidateResult, ViewResult } from "./types";

const SERVICE = "codeConfirm";

/** 지금 동작 그대로 — params 는 null·undefined 만 빼고, 성공은 `data.result` 만 펴고, 거부는 meta.message 만 담은 일반 Error. */
const OASIS: OasisCallOptions = { merge: "result", details: "none", errorFactory: plainError };

/**
 * 봉투 해제 + 업무 거부 판정. BPMN 안에서 던진 업무 오류는 `meta.message`(서버 예외 message)만 오고 `errors[]` 는
 * 비어 있다(F11). 그래서 message 를 그대로 화면 오류 문구로 쓴다. 성공이면 `data.result` 를 펼친다(output="result").
 */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  return unwrapOasis<T>(res, OASIS);
}

/** params 의 null·undefined 는 뺀다 — OASIS 가 null 값의 타입을 정하지 못해 요청 전체가 실패한다(F23). */
function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, undefined, OASIS);
}

export function searchDrafts(keyword = ""): Promise<SearchResult> {
  return callOasis<SearchResult>("search", { keyword });
}

/** ver 를 비우면 서버가 그 코드의 DRAFT 를 고른다. */
export function viewDraft(maruCodeId: string, ver?: string | null): Promise<ViewResult> {
  return callOasis<ViewResult>("view", { maruCodeId, ver: ver || null });
}

/** 쓰기 없는 사전 검사 — 10행 결과와 서버 시계 기준 `futureApplyFrom` 을 받는다. */
export function validateDraft(maruCodeId: string, ver: string, applyFrom: string): Promise<ValidateResult> {
  return callOasis<ValidateResult>("validate", { maruCodeId, ver, applyFrom });
}

export function confirmDraft(
  maruCodeId: string, ver: string, rowVersion: number, applyFrom: string, warningsAcknowledged: boolean,
): Promise<ConfirmResult> {
  return callOasis<ConfirmResult>("confirm", { maruCodeId, ver, rowVersion, applyFrom, warningsAcknowledged });
}
