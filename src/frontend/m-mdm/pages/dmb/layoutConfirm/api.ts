/**
 * layoutConfirm 화면의 OASIS BFF 호출(D-144 3단계). 모양은 dme/ruleConfirm/api.ts 와 같다 — 공유 파일을 바꾸지 않는다.
 *
 * 호출: `POST /api/mdm/oasis/layoutConfirm/{action}` — search·view(READ), validate(EDIT), confirm(CONFIRM).
 * 레이아웃 버전은 소수 셋째 자리 문자열로 보낸다(`"1.001"`).
 */
import { callOasisAt, unwrapOasis, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, mdmFieldLabel, plainError } from "@/oasis-screen";

import { LAYOUT_MNG_FIELD_LABELS } from "../layoutMng/fieldLabels";

import type { ConfirmResult, SearchResult, ValidateResult, ViewResult } from "./types";

const SERVICE = "layoutConfirm";

/** params 는 null·undefined 만 빼고, 성공은 `data.result` 만 펴고, 거부는 일반 Error 이고 문구는 `기본 문구 + "\n- 항목명: 메시지"`(서버 field 코드는 안 보임, 기본 문구에 든 메시지는 뺌). */
const OASIS: OasisCallOptions = { merge: "result", fieldLabel: mdmFieldLabel(LAYOUT_MNG_FIELD_LABELS), errorFactory: plainError };

/** 봉투 해제 + 업무 거부 판정. 거부 message 는 그대로 화면 오류 문구가 된다. 성공이면 `data.result` 를 펼친다. */
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
