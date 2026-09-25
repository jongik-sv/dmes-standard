/**
 * dataCateEdit 화면의 OASIS BFF 호출 래퍼(TSK-07-02 design.md §2, dataMng/api.ts 선례).
 *
 * 호출 패턴: `POST /api/mdm/oasis/dataCateEdit/{action}` — search·view·compare(READ), reg·save·delete·restore(EDIT).
 * `save` 는 서버가 대상 카테고리의 실제 defKind 로 REGEX 정의 수정과 TABLE 소속 일괄 적용을 스스로 가른다(design.md §2)
 * — 화면은 REGEX 필드(cateName·defExpr·defTarget·description)와 TABLE 필드(addCodes·removeCodes)를 각각의 헬퍼로 보낸다.
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { CateSearchResult, CateViewResult, ComparePreview } from "./types";

const SERVICE = "dataCateEdit";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
}

/** 응답 봉투 해제 + 업무 거부 판정. 성공이면 `data.result` 를 펼친다. */
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

async function callOasis<T>(action: string, params: Record<string, unknown>): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${SERVICE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: SERVICE }, params: cleaned }),
  });
  return unwrap<T>(res);
}

export function searchCategories(maruDataId: string): Promise<CateSearchResult> {
  return callOasis<CateSearchResult>("search", { maruDataId });
}

export function viewCategory(maruDataId: string, cateId: string): Promise<CateViewResult> {
  return callOasis<CateViewResult>("view", { maruDataId, cateId });
}

/** REGEX 미리보기 — 저장 전 후보 defExpr·defTarget 을 재해석한다(04 선례, 정규식은 서버만 실행한다). */
export function compareRegex(maruDataId: string, defExpr: string, defTarget: string): Promise<ComparePreview> {
  return callOasis<ComparePreview>("compare", { maruDataId, defExpr, defTarget });
}

export function registerCategory(
  maruDataId: string, cateId: string, cateName: string, defKind: "REGEX" | "TABLE", defExpr: string | null,
  defTarget: string | null, description: string,
): Promise<CateViewResult> {
  return callOasis<CateViewResult>("reg", { maruDataId, cateId, cateName, defKind, defExpr, defTarget, description });
}

/** REGEX 정의 수정. */
export function saveRegex(
  maruDataId: string, cateId: string, cateName: string, defExpr: string, defTarget: string, description: string,
): Promise<CateViewResult> {
  return callOasis<CateViewResult>("save", { maruDataId, cateId, cateName, defExpr, defTarget, description });
}

/** TABLE 소속 일괄 적용(R12, 전부-아니면-전무는 서버가 한 트랜잭션으로 한다). */
export function saveMembers(
  maruDataId: string, cateId: string, addCodes: string[], removeCodes: string[],
): Promise<CateViewResult> {
  return callOasis<CateViewResult>("save", { maruDataId, cateId, addCodes, removeCodes });
}

export function closeCategory(maruDataId: string, cateId: string): Promise<CateViewResult> {
  return callOasis<CateViewResult>("delete", { maruDataId, cateId });
}

export function reopenCategory(maruDataId: string, cateId: string): Promise<CateViewResult> {
  return callOasis<CateViewResult>("restore", { maruDataId, cateId });
}
