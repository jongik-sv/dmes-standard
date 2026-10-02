/**
 * secWidget(mcm OASIS)을 부르는 WidgetStore — 사용자 위젯 탭·배치 저장(스펙 §4.2).
 * 요청 본문은 CactusRequest 표준(params 는 평평한 값, 목록은 grids.{파라미터명}.rows — BackEnd 표준 §6-E).
 * 응답은 data.result(Map) — api.ts unwrap 이 풀어 준다. 실패(meta.success=false)는 Error(message) 로 던진다.
 */
import { apiRequest } from "@dk-oasis/shared/http";
import type { WidgetItem, WidgetStore, WidgetTab } from "@dk-oasis/shared/widget";

import { unwrap } from "./api";

const url = (action: string) => `/api/mcm/oasis/secWidget/${action}`;

async function call(action: string, params: Record<string, unknown> = {}, grids?: Record<string, unknown[]>) {
  const body: Record<string, unknown> = { meta: { menuId: "HOME" }, params };
  if (grids) body.grids = Object.fromEntries(Object.entries(grids).map(([k, rows]) => [k, { rows }]));
  const res = await apiRequest<unknown>(url(action), { method: "POST", body: JSON.stringify(body) });
  return unwrap(res);
}

interface TabRow { tabId: string; tabNm: string; tabSeq: number; lockYn: string }
interface WidgetRow { tabId: string; instId: string; widgetId: string; posX: number; posY: number; sizeW: number; sizeH: number; lockYn: string; configJson: string | null }

function parseConfig(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export const secWidgetStore: WidgetStore = {
  async load(): Promise<WidgetTab[]> {
    const out = await call("search");
    const tabs = (Array.isArray(out.tabs) ? out.tabs : []) as TabRow[];
    const widgets = (Array.isArray(out.widgets) ? out.widgets : []) as WidgetRow[];
    return tabs.map((t) => ({
      tabId: t.tabId,
      name: t.tabNm,
      seq: Number(t.tabSeq) || 0,
      locked: t.lockYn === "Y",
      items: widgets
        .filter((w) => w.tabId === t.tabId)
        .map<WidgetItem>((w) => ({
          instId: w.instId,
          widgetId: w.widgetId,
          x: Number(w.posX),
          y: Number(w.posY),
          w: Number(w.sizeW),
          h: Number(w.sizeH),
          locked: w.lockYn === "Y",
          config: parseConfig(w.configJson),
        })),
    }));
  },
  async saveTab(tab) {
    await call(
      "saveTab",
      { tabId: tab.tabId, tabNm: tab.name, tabSeq: tab.seq, lockYn: tab.locked ? "Y" : "N" },
      {
        widgets: tab.items.map((i) => ({
          instId: i.instId,
          widgetId: i.widgetId,
          posX: i.x,
          posY: i.y,
          sizeW: i.w,
          sizeH: i.h,
          lockYn: i.locked ? "Y" : "N",
          configJson: i.config == null ? null : JSON.stringify(i.config),
        })),
      }
    );
  },
  async deleteTab(tabId) {
    await call("deleteTab", { tabId });
  },
  async reorderTabs(tabIds) {
    await call("reorderTabs", {}, { tabs: tabIds.map((tabId) => ({ tabId })) });
  },
  async resetHome() {
    await call("resetHome");
  },
};
