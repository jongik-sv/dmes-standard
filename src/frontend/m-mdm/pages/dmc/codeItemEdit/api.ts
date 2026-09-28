/**
 * codeItemEdit 화면의 OASIS BFF 호출(TSK-06-03 design.md §6.6). 모양은 columnMng/api.ts 를 복제했다 — 공유 파일을
 * 바꾸지 않는다.
 *
 * 호출: `POST /api/mdm/oasis/codeItemEdit/{action}` — search·view·compare(READ), validate·save·restore·execute(EDIT).
 * 버전은 문자열로 보낸다(JS number 는 2.000 의 소수 자릿수를 잃는다). validate·save 는 코드 행(`rows`)·카테고리
 * (`categories`)·소속(`members`) 세 그리드를 빈 배열이라도 늘 보낸다 — 빼면 서버 바인딩이 "No suitable method" 로
 * 실패한다(F9, 서버 시험 O6). 카테고리 편집을 이 화면에 합치며(D-101) 저장은 이 서비스 한 번이다. 카테고리 조회·REGEX
 * 미리보기·되돌리기는 codeCateEdit 서비스 그대로다(cate/api.ts).
 */
import { apiRequest } from "@dk-oasis/shared/http";

import type { Issue as CateIssue } from "./cate/types";
import type { Issue, PatchParams, PreviewResult, SearchResult, ViewResult } from "./types";

const SERVICE = "codeItemEdit";

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
async function callOasis<T>(action: string, params: Record<string, unknown>, grids?: Record<string, { rows: Rows }>): Promise<T> {
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

export function viewCode(maruCodeId: string, ver?: string | null): Promise<ViewResult> {
  return callOasis<ViewResult>("view", { maruCodeId, ver: ver || null });
}

export function previewCategory(maruCodeId: string, ver: string, cateId: string): Promise<PreviewResult> {
  return callOasis<PreviewResult>("compare", { maruCodeId, ver, cateId });
}

/** 합친 저장의 세 그리드 변경 — 코드 행(grid-state changesOf)·카테고리(categoryChangesOf)·소속(memberChangesOf). */
export interface SaveChanges {
  rows: Rows;
  categories: Rows;
  members: Rows;
}

const gridsOf = (c: SaveChanges) => ({
  rows: { rows: c.rows }, categories: { rows: c.categories }, members: { rows: c.members },
});

/** 코드 행 이슈(`issues`, itemKey = 코드)와 카테고리·소속 이슈(`cateIssues`, codeCateEdit validate 모양). */
export function validateAll(
  maruCodeId: string, ver: string, changes: SaveChanges,
): Promise<{ issues?: Issue[]; cateIssues?: CateIssue[] }> {
  return callOasis("validate", { maruCodeId, ver }, gridsOf(changes));
}

export function saveAll(
  maruCodeId: string, ver: string, rowVersion: number, changes: SaveChanges,
): Promise<{ rowVersion?: number; closedCategories?: Record<string, string[]> }> {
  return callOasis("save", { maruCodeId, ver, rowVersion }, gridsOf(changes));
}

export function revertRow(maruCodeId: string, ver: string, rowVersion: number, code: string): Promise<{ rowVersion?: number }> {
  return callOasis("restore", { maruCodeId, ver, rowVersion, code });
}

export function patchRow(params: PatchParams): Promise<{ row?: Record<string, unknown> }> {
  return callOasis("execute", { ...params });
}
