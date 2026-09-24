/**
 * layoutMng 화면의 OASIS BFF 호출 래퍼 — `POST /api/mdm/oasis/layoutMng/{action}`(TSK-05-02 design.md §6.1).
 *
 * TSK-04-03 B0 실측 규칙(F11): grid `headers`·`consts`·`items` 셋을 **빈 배열이라도 늘 보내고**, params 의 null·빈 값 키는
 * 뺀다. 헤더 항목을 보내는 grid 는 없다 — 전문에서 헤더 구성·길이는 잠긴다(불변 I8). 공유 헬퍼는 두지 않는다.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { ColumnInfo, LayoutItemRow } from "@/layout/types";
import type { ConstRow, HeaderOption, LayoutDraft, SaveResult, SearchFilters, SearchResult, ViewResult } from "./types";

const OASIS_BASE = "/api/mdm/oasis/layoutMng";
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

async function callAction<T>(action: string, params: object, grids?: Grids): Promise<T> {
  const res = await apiRequest<unknown>(`${OASIS_BASE}/${action}`, {
    method: "POST",
    body: JSON.stringify({ meta: { menuId: "layoutMng" }, params: cleanParams(params), ...(grids ? { grids } : {}) }),
  });
  return unwrap<T>(res);
}

/** 전문 목록 + 조회 조건용 시스템·EAI·헤더. */
export function searchLayouts(f: SearchFilters): Promise<SearchResult> {
  return callAction("search", {
    keyword: f.keyword, headerLayoutId: f.headerLayoutId ? Number(f.headerLayoutId) : null, sndSystem: f.sndSystem,
    rcvSystem: f.rcvSystem,
  });
}

/** 헤더 추가 팝업(D8 — search target=HEADER). 헤더 항목을 함께 받는다. */
export async function searchHeaders(keyword: string): Promise<HeaderOption[]> {
  const out = await callAction<SearchResult>("search", { target: "HEADER", keyword });
  return out.headers ?? [];
}

/** 컬럼 사전 검색(D8 — search target=COLUMN). */
export async function searchColumns(keyword: string): Promise<ColumnInfo[]> {
  const out = await callAction<SearchResult>("search", { target: "COLUMN", keyword });
  return out.columns ?? [];
}

export function viewLayout(layoutId: number): Promise<ViewResult> {
  return callAction("view", { layoutId });
}

/** 저장 — 헤더 구성(행 순서가 쌓는 순서)·상수 재정의·본문 항목(행 순서가 SEQ). */
export function saveLayout(draft: LayoutDraft, headers: Array<{ HEADER_LAYOUT_ID: number }>, consts: ConstRow[],
                           items: LayoutItemRow[]): Promise<SaveResult> {
  return callAction("save", draft, {
    headers: { rows: headers.map((h, i) => ({ SEQ: i + 1, HEADER_LAYOUT_ID: h.HEADER_LAYOUT_ID })) },
    consts: { rows: consts.map((c) => ({ HEADER_LAYOUT_ID: c.HEADER_LAYOUT_ID, HEADER_SEQ: c.HEADER_SEQ, CONST_VALUE: c.CONST_VALUE })) },
    items: { rows: items.map((r) => cleanParams(Object.fromEntries(ITEM_KEYS.map((k) => [k, r[k]])))) },
  });
}
