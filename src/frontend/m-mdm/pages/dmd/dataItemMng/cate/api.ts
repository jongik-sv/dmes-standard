/**
 * dataCateEdit 서비스의 OASIS BFF 호출 래퍼(TSK-07-02 design.md §2, dataMng/api.ts 선례). 화면은 D-104 로 항목 편집
 * [카테고리] 탭에 합쳤고, 서비스 경로·액션은 그대로 부른다.
 *
 * 호출 패턴: `POST /api/mdm/oasis/dataCateEdit/{action}` — search·view·compare(READ), reg·save·delete·restore(EDIT).
 * `save` 는 서버가 대상 카테고리의 실제 defKind 로 REGEX 정의 수정과 TABLE 소속 일괄 적용을 스스로 가른다(design.md §2)
 * — 화면은 REGEX 필드(cateName·defExpr·defTarget·description)는 params 로, TABLE 소속(addCodes·removeCodes)은 grids 로 보낸다.
 */
import { callOasisAt, unwrapOasis, type OasisCallOptions } from "@dk-oasis/shared/http";

import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import type { CateSearchResult, CateViewResult, ComparePreview } from "./types";

const SERVICE = "dataCateEdit";

/** 지금 동작 그대로 — params 는 null·undefined 만 빼고, 성공은 `data.result` 만 펴고, 거부는 meta.message 만 담은 일반 Error. */
const OASIS: OasisCallOptions = { merge: "result", details: "none", errorFactory: plainError };

/** 응답 봉투 해제 + 업무 거부 판정. 성공이면 `data.result` 를 펼친다. */
export function unwrap<T = Record<string, unknown>>(res: unknown): T {
  return unwrapOasis<T>(res, OASIS);
}

type Rows = Record<string, unknown>[];

function callOasis<T>(
  action: string, params: Record<string, unknown>, grids?: Record<string, { rows: Rows }>,
): Promise<T> {
  return callOasisAt<T>(MDM_OASIS_BASE, SERVICE, action, params, grids, OASIS);
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

/**
 * TABLE 소속 일괄 적용(R12, 전부-아니면-전무는 서버가 한 트랜잭션으로 한다). 목록은 params 가 아니라 grids 로 보낸다
 * — OASIS 는 params 의 배열을 받지 못한다("Generic type…"). 빈 목록은 grid 를 빼고 보낸다.
 */
export function saveMembers(
  maruDataId: string, cateId: string, addCodes: string[], removeCodes: string[],
): Promise<CateViewResult> {
  const grids: Record<string, { rows: Rows }> = {};
  if (addCodes.length > 0) grids.addCodes = { rows: addCodes.map((code) => ({ code })) };
  if (removeCodes.length > 0) grids.removeCodes = { rows: removeCodes.map((code) => ({ code })) };
  return callOasis<CateViewResult>("save", { maruDataId, cateId }, grids);
}

export function closeCategory(maruDataId: string, cateId: string): Promise<CateViewResult> {
  return callOasis<CateViewResult>("delete", { maruDataId, cateId });
}

export function reopenCategory(maruDataId: string, cateId: string): Promise<CateViewResult> {
  return callOasis<CateViewResult>("restore", { maruDataId, cateId });
}
