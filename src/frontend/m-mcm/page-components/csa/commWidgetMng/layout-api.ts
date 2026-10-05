/**
 * 위젯관리 「기본 배치」 탭의 서버 호출 — POST /api/mcm/oasis/commWidgetMng/{action}, 등록부용 POST /api/mcm/oasis/widgetDef/list.
 * 계약: 스펙 2026-10-02-widget-admin-generic §5.1·§5.2, 계획 Task 2 표.
 * 요청 봉투는 CactusRequest 표준(params 는 평평한 값, 목록은 grids.{이름}.rows). meta.userId·요청 본문 userId 는 보내지 않는다 — 서버가 인증 정보로 채운다.
 * 응답 해제는 screenUsageStat/api.ts 와 같은 규칙: meta.success=false 거절, data(+data.result) 펼침, grids.{key}.rows.
 * @dk-oasis/shared 를 런타임 import 하지 않는다(m-mcm vitest 가 shared dist 없이 시험한다).
 */
import type { WidgetItem } from "@dk-oasis/shared/widget";

import { createJsonApiClient } from "@/lib/http/json-api-client";

import {
  defaultTabsFromRows,
  layoutItemsFromRows,
  layoutItemsToRows,
  type DeptRow,
  type LayoutSummary,
  type LoadedDefaultTab,
  type LoadedLayout,
} from "./layout-model";

const api = createJsonApiClient();

const SCREEN_ID = "commWidgetMng";
const OASIS_BASE = "/api/mcm/oasis";

interface CactusEnvelope {
  meta?: { success?: boolean; message?: string };
  data?: Record<string, unknown>;
  grids?: Record<string, { rows?: unknown[] }>;
}

function unwrapPayload(res: unknown): Record<string, unknown> {
  const env = res as CactusEnvelope;
  // OASIS 실행기는 업무 거절을 HTTP 200 + meta.success=false 로 돌려준다.
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
  if (env?.grids) {
    for (const [key, val] of Object.entries(env.grids)) {
      out[key] = val?.rows ?? [];
    }
  }
  return out;
}

async function call(
  objId: string,
  action: string,
  params: Record<string, unknown> = {},
  grids?: Record<string, readonly unknown[]>
): Promise<Record<string, unknown>> {
  const body: Record<string, unknown> = { meta: { menuId: SCREEN_ID }, params };
  if (grids) body.grids = Object.fromEntries(Object.entries(grids).map(([name, rows]) => [name, { rows }]));
  const res = await api.request<unknown>(`${OASIS_BASE}/${objId}/${action}`, { method: "POST", body });
  return unwrapPayload(res);
}

const records = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((r): r is Record<string, unknown> => r != null && typeof r === "object" && !Array.isArray(r)) : [];

/** 기본 배치나 기본 탭이 저장된 키 목록(전사 먼저는 서버가 정하지만 화면이 다시 정렬한다). tabCount 는 응답에 있을 때만 싣는다. */
export async function searchLayouts(): Promise<LayoutSummary[]> {
  const out = await call(SCREEN_ID, "searchLayouts");
  return records(out.layouts)
    .filter((r) => r.layoutKey != null && String(r.layoutKey) !== "")
    .map((r) => ({
      layoutKey: String(r.layoutKey),
      deptNm: r.deptNm == null ? "" : String(r.deptNm),
      count: Number(r.count) || 0,
      ...(r.tabCount != null ? { tabCount: Number(r.tabCount) || 0 } : {}),
    }));
}

/**
 * 한 키의 배치. effective=Y 이고 그 키에 행이 없으면 서버가 상위 부서 → 전사 순으로 처음 찾은 배치를 돌려주고
 * sourceKey 에 실제 키를 적는다. 아무것도 없으면 items=[]·sourceKey=null(화면이 코드 기본 배치를 쓴다).
 */
export async function loadLayout(layoutKey: string, effective: "Y" | "N" = "Y"): Promise<LoadedLayout> {
  const out = await call(SCREEN_ID, "loadLayout", { layoutKey, effective });
  return {
    layoutKey: out.layoutKey == null || out.layoutKey === "" ? layoutKey : String(out.layoutKey),
    sourceKey: out.sourceKey == null || out.sourceKey === "" ? null : String(out.sourceKey),
    items: layoutItemsFromRows(out.items),
  };
}

/** 그 키의 배치를 통째로 바꾼다(서버가 지우고 다시 넣는다). 빈 목록은 서버가 거절한다. */
export async function saveLayout(layoutKey: string, items: readonly WidgetItem[]): Promise<{ layoutKey: string; count: number }> {
  const out = await call(SCREEN_ID, "saveLayout", { layoutKey }, { widgets: layoutItemsToRows(items) });
  return { layoutKey: out.layoutKey == null ? layoutKey : String(out.layoutKey), count: Number(out.count) || 0 };
}

/** 그 키의 「홈」 기본 배치와 기본 탭을 모두 지운다. */
export async function deleteLayout(layoutKey: string): Promise<void> {
  await call(SCREEN_ID, "deleteLayout", { layoutKey });
}

/* ── 관리자 기본 탭(widget-tabs 2026-10-05, 설계 design-widget-tabs §3.2) ── */

/** 그 키의 기본 탭(def-N)만, 순서대로. 물려받지 않는다. */
export async function loadDefaultTabs(layoutKey: string): Promise<LoadedDefaultTab[]> {
  const out = await call(SCREEN_ID, "loadDefaultTabs", { layoutKey });
  return defaultTabsFromRows(out.tabs);
}

/**
 * 기본 탭 하나를 통째로 저장한다(빈 목록 허용). tabId 가 없거나 서버에 없는 def-N 이면 서버가 새 ID 를 채번해 돌려준다.
 * 서버 거절: 키당 5개 초과, 같은 키 안 이름 중복, 이름 20자 초과.
 */
export async function saveDefaultTab(
  layoutKey: string,
  tab: { tabId?: string; tabNm: string; tabSeq: number },
  items: readonly WidgetItem[]
): Promise<{ layoutKey: string; tabId: string; count: number }> {
  const params: Record<string, unknown> = { layoutKey, tabNm: tab.tabNm, tabSeq: tab.tabSeq };
  if (tab.tabId) params.tabId = tab.tabId;
  const out = await call(SCREEN_ID, "saveDefaultTab", params, { widgets: layoutItemsToRows(items) });
  const savedId = out.tabId == null ? "" : String(out.tabId);
  // 새 탭인데 채번한 ID 가 없으면 화면이 서버 탭을 가리킬 수 없다 — 다시 저장할 때마다 탭이 하나씩 더 생긴다.
  if (!tab.tabId && !savedId) throw new Error("서버가 새 기본 탭 ID 를 돌려주지 않았습니다.");
  return {
    layoutKey: out.layoutKey == null ? layoutKey : String(out.layoutKey),
    tabId: savedId || (tab.tabId ?? ""),
    count: Number(out.count) || 0,
  };
}

export async function deleteDefaultTab(layoutKey: string, tabId: string): Promise<void> {
  await call(SCREEN_ID, "deleteDefaultTab", { layoutKey, tabId });
}

/** 기본 탭 순서(def-N 목록). */
export async function reorderDefaultTabs(layoutKey: string, tabIds: readonly string[]): Promise<void> {
  await call(SCREEN_ID, "reorderDefaultTabs", { layoutKey }, { tabs: tabIds.map((tabId) => ({ tabId })) });
}

/** 부서 고르기 — 코드·이름 앞부분 일치, 서버가 최대 50건. */
export async function searchDepts(keyword: string): Promise<DeptRow[]> {
  const out = await call(SCREEN_ID, "searchDepts", { keyword: keyword.trim() });
  return records(out.depts)
    .filter((r) => r.deptCd != null && String(r.deptCd) !== "")
    .map((r) => ({
      deptCd: String(r.deptCd),
      deptNm: r.deptNm == null ? "" : String(r.deptNm),
      upperDeptCd: r.upperDeptCd == null || r.upperDeptCd === "" ? null : String(r.upperDeptCd),
    }));
}

/**
 * 위젯 정의 목록(widgetDef/list — 로그인만 되면 호출 가능) 줄을 변환 없이 돌려준다.
 * 화면이 shared toWidgetDefRow 로 바꿔 mergeWidgetRegistry 에 넘긴다(이 파일은 shared 런타임을 쓰지 않는다).
 */
export async function fetchWidgetDefRows(): Promise<Record<string, unknown>[]> {
  const out = await call("widgetDef", "list");
  return records(out.defs);
}
