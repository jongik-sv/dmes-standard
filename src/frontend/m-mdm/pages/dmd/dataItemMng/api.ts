/**
 * dataItemMng 화면의 OASIS BFF 호출 래퍼(TSK-07-03 design.md §2, columnMng/api.ts 선례).
 *
 * 호출 패턴: `POST /api/mdm/oasis/dataItemMng/{action}` — view·search(READ), reg·save·delete(닫기)·restore(다시 열기)
 * (EDIT, D9). BFF 가 `MDM_WAS_URL` 로 프록시하고 인증 헤더를 주입한다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { DataItemFilters, DataItemSaveResult, DataItemSearchResult, DataItemViewResult } from "./types";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
}

/**
 * 응답 봉투 해제 + 업무 거부 판정. BPMN 안에서 던진 업무 오류는 `meta.message` 만 오고 `errors[]` 는 비어 있다(F12).
 * 그래서 message 를 그대로 화면 오류 문구로 쓴다(충돌·닫힌 키 판정도 이 글자로 한다). 성공이면 `data.result` 를 펼친다.
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

/** params 의 null·undefined·빈 문자열은 뺀다(A4 — OASIS 가 null 값의 타입을 정하지 못해 요청 전체가 실패한다, F14). */
export function omitNullish(params: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ""));
}

export async function callOasis<T>(serviceId: string, action: string, params: Record<string, unknown>): Promise<T> {
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${serviceId}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: serviceId }, params: omitNullish(params) }),
  });
  return unwrap<T>(res);
}

export function viewDataItems(maruDataId?: string): Promise<DataItemViewResult> {
  return callOasis<DataItemViewResult>("dataItemMng", "view", { maruDataId });
}

/**
 * withTree=true 면 응답에 `tree`(열린 행만, I6)가 함께 온다 — 그리드 페이징(list/totalCount)과는 별개 조회라
 * `ItemTreePanel` 을 처음 그릴 때만 부른다(design.md §2 "별도(비페이징) 조회").
 */
export function searchDataItems(
  filters: DataItemFilters,
  page: number,
  size: number,
  withTree = false,
): Promise<DataItemSearchResult> {
  return callOasis<DataItemSearchResult>("dataItemMng", "search", {
    maruDataId: filters.maruDataId,
    code: filters.code.trim(),
    name: filters.name.trim(),
    cateId: filters.cateId,
    showClosed: filters.showClosed,
    nodeFilter: filters.nodeFilter,
    page,
    size,
    withTree,
  });
}

/** action=reg — 등록(S8). params 는 toSaveParams 결과. */
export function registerDataItem(params: Record<string, unknown>): Promise<DataItemSaveResult> {
  return callOasis<DataItemSaveResult>("dataItemMng", "reg", params);
}

/** action=save — 수정(S1·S5). params 는 toSaveParams 결과(expectedRowVersion 포함). */
export function modifyDataItem(params: Record<string, unknown>): Promise<DataItemSaveResult> {
  return callOasis<DataItemSaveResult>("dataItemMng", "save", params);
}

/** action=delete — 닫기(S6, D9). */
export function closeDataItem(maruDataId: string, code: string, rowVersion: number): Promise<DataItemSaveResult> {
  return callOasis<DataItemSaveResult>("dataItemMng", "delete", { maruDataId, code, expectedRowVersion: rowVersion });
}

/** action=restore — 다시 열기(S7, D9). */
export function reopenDataItem(maruDataId: string, code: string, rowVersion: number): Promise<DataItemSaveResult> {
  return callOasis<DataItemSaveResult>("dataItemMng", "restore", { maruDataId, code, expectedRowVersion: rowVersion });
}
