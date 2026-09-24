/**
 * codeCateEdit 화면의 OASIS BFF 호출(TSK-06-04 design.md §1·§2). 모양은 codeItemEdit/api.ts 를 복제했다 — 공유 파일을
 * 바꾸지 않는다.
 *
 * 호출: `POST /api/mdm/oasis/codeCateEdit/{action}` — search·view·compare(READ), validate·save·restore(EDIT).
 * 버전은 문자열로 보낸다(JS number 는 2.000 의 소수 자릿수를 잃는다). validate·save 는 그리드 `categories`·`members` 를
 * 빈 배열이라도 늘 보낸다 — 빼면 서버 바인딩이 "No suitable method" 로 실패한다(F9).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { Issue, PreviewResult, SearchResult, ViewResult } from "./types";

const SERVICE = "codeCateEdit";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string | null; code?: string };
  data?: Record<string, unknown>;
}

type Rows = Record<string, unknown>[];

/**
 * 봉투 해제 + 업무 거부 판정. BPMN 안에서 던진 업무 오류는 `meta.message`(서버 예외 message)만 오고 `errors[]` 는
 * 비어 있다(F11). 그래서 message 를 그대로 화면 오류 문구로 쓴다. 성공이면 `data.result` 를 펼친다(output="result").
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
async function callOasis<T>(
  action: string, params: Record<string, unknown>, grids?: Record<string, { rows: Rows }>,
): Promise<T> {
  const cleaned = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== null && v !== undefined));
  const res = await apiRequest<unknown>(`/api/mdm/oasis/${SERVICE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: SERVICE }, params: cleaned, ...(grids ? { grids } : {}) }),
  });
  return unwrap<T>(res);
}

export function searchCodes(keyword = ""): Promise<SearchResult> {
  return callOasis<SearchResult>("search", { keyword });
}

export function viewCategories(maruCodeId: string, ver?: string | null): Promise<ViewResult> {
  return callOasis<ViewResult>("view", { maruCodeId, ver: ver || null });
}

/** REGEX 전용 — 저장 전 후보 defExpr·defTarget 을 서버 Pattern 으로 재해석한다(원천 04:183). */
export function previewRegex(
  maruCodeId: string, ver: string, cateId: string | null, defExpr: string, defTarget: string,
): Promise<PreviewResult> {
  return callOasis<PreviewResult>("compare", { maruCodeId, ver, cateId, defExpr, defTarget });
}

export function validateGrids(
  maruCodeId: string, ver: string, categories: Rows, members: Rows,
): Promise<{ issues?: Issue[] }> {
  return callOasis<{ issues?: Issue[] }>("validate", { maruCodeId, ver },
    { categories: { rows: categories }, members: { rows: members } });
}

export function saveGrids(
  maruCodeId: string, ver: string, rowVersion: number, categories: Rows, members: Rows,
): Promise<{ rowVersion?: number }> {
  return callOasis("save", { maruCodeId, ver, rowVersion },
    { categories: { rows: categories }, members: { rows: members } });
}

export function revertCategory(
  maruCodeId: string, ver: string, rowVersion: number, table: "CATE" | "CATE_ITEM", cateId: string,
  code?: string | null,
): Promise<{ rowVersion?: number }> {
  return callOasis("restore", { maruCodeId, ver, rowVersion, table, cateId, code: code ?? null });
}
