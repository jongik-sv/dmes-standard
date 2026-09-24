/**
 * headerMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/headerMng/{action}`(TSK-05-02 design.md §6.1).
 *
 * TSK-04-03 B0 실측 규칙(F11)을 따른다. 공유 헬퍼를 새로 두지 않고 domainMng/api.ts 와 같은 모양으로 이 파일 안에 둔다.
 *  - grid `items` 는 **빈 배열이라도 늘 보낸다** — 빠지면 OASIS 가 메서드를 찾지 못한다.
 *  - params 에서 **null·undefined·빈 문자열 값은 키째 뺀다** — null 값 하나로 요청 전체가 S999 로 실패한다.
 *  - 행은 서버가 읽는 키만 보낸다(화면 전용 KEY·파생 표시 칸·OFFSET·LENGTH 는 서버가 다시 계산하므로 빼고, 빈 값도 뺀다).
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { ColumnInfo, LayoutItemRow } from "@/layout/types";
import type { HeaderDraft, SaveResult, SearchResult, ViewResult } from "./types";

const OASIS_BASE = "/api/mdm/oasis/headerMng";
const ITEM_KEYS = ["SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT", "DEFAULT_VALUE", "FILLER_LENGTH"] as const;

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string; code?: string };
  data?: Record<string, unknown>;
}

type Grids = Record<string, { rows: Array<Record<string, unknown>> }>;

function unwrap<T>(res: unknown): T {
  const env = res as CactusEnvelope;
  if (env?.meta && env.meta.success === false) {
    throw new Error(env.meta.message?.trim() || "요청이 거부되었습니다.");
  }
  const out: Record<string, unknown> = {};
  if (env?.data) {
    Object.assign(out, env.data);
    const inner = env.data["result"];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) {
      Object.assign(out, inner as Record<string, unknown>);
    }
  }
  return out as T;
}

/** null·undefined·빈 문자열 값을 뺀다(B0 e). 숫자 0 과 false 는 남긴다. */
export function cleanParams(params: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

export function itemRows(items: LayoutItemRow[]): Array<Record<string, unknown>> {
  return items.map((r) => cleanParams(Object.fromEntries(ITEM_KEYS.map((k) => [k, r[k]]))));
}

async function callAction<T>(action: string, params: object, grids?: Grids): Promise<T> {
  const res = await apiRequest<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "headerMng" }, params: cleanParams(params), ...(grids ? { grids } : {}) }),
  });
  return unwrap<T>(res);
}

/** 헤더 목록·EAI 목록. */
export function searchHeaders(keyword: string): Promise<SearchResult> {
  return callAction("search", { keyword });
}

/** 컬럼 사전 검색(D8 — search target=COLUMN). */
export async function searchColumns(keyword: string): Promise<ColumnInfo[]> {
  const out = await callAction<SearchResult>("search", { target: "COLUMN", keyword });
  return out.columns ?? [];
}

/** 헤더 상세·항목·사용 전문. */
export function viewHeader(layoutId: number): Promise<ViewResult> {
  return callAction("view", { layoutId });
}

/** 저장 — 항목은 grid items(행 순서가 SEQ). */
export function saveHeader(draft: HeaderDraft, items: LayoutItemRow[]): Promise<SaveResult> {
  return callAction("save", draft, { items: { rows: itemRows(items) } });
}
