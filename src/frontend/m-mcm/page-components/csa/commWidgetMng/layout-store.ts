/**
 * 관리자 기본 배치·기본 탭 편집용 WidgetStore 어댑터 — WidgetWorkspace mode="admin" 에 주입한다
 * (스펙 2026-10-02-widget-admin-generic §2 WidgetStore·§10.2, widget-tabs 설계 design-widget-tabs §3.2·§4).
 *   load()        → 「홈」 = commWidgetMng/loadLayout(layoutKey, effective=Y) 항목(없으면 없음) + 기본 탭 = loadDefaultTabs(layoutKey).
 *   saveTab()     → 「홈」은 saveLayout(그 키의 배치를 통째로), 그 밖의 탭은 saveDefaultTab.
 *   deleteTab()   → deleteDefaultTab(「홈」은 거절 — 지우기는 화면의 [기본 배치 지우기] 가 deleteLayout 을 직접 부른다).
 *   reorderTabs() → reorderDefaultTabs.
 *   resetHome()   → 이 화면에 없으므로 거절.
 * 작업 공간이 새 탭에 붙인 임시 ID(tab-N)는 첫 저장 때 서버가 준 def-N 으로 매핑해 기억한다. 매핑은 load() 때마다 비운다 —
 * 다시 불러온 작업 공간은 def-N 을 들고 있고, 같은 tab-N 이 새 탭에 다시 쓰여도 옛 매핑으로 기존 기본 탭을 덮어쓰지 않게.
 * 기본 탭 API 가 없는 api(옛 시험 대역 등)를 주면 기본 탭 없이 「홈」만 다루고 기본 탭 동작은 거절한다.
 * shared 런타임을 import 하지 않는다(타입만).
 */
import type { WidgetItem, WidgetStore, WidgetTab } from "@dk-oasis/shared/widget";

import * as layoutApi from "./layout-api";
import { HOME_TAB_ID, tabsFromBoard, type LoadedDefaultTab, type LoadedLayout } from "./layout-model";

/** 저장소가 부르는 서버 호출 — 시험이 가짜로 바꿔 끼운다. 기본 탭 메서드는 선택(없으면 「홈」만). */
export interface LayoutStoreApi {
  loadLayout(layoutKey: string, effective: "Y" | "N"): Promise<LoadedLayout>;
  saveLayout(layoutKey: string, items: readonly WidgetItem[]): Promise<unknown>;
  loadDefaultTabs?(layoutKey: string): Promise<LoadedDefaultTab[]>;
  saveDefaultTab?(
    layoutKey: string,
    tab: { tabId?: string; tabNm: string; tabSeq: number },
    items: readonly WidgetItem[]
  ): Promise<{ tabId: string }>;
  deleteDefaultTab?(layoutKey: string, tabId: string): Promise<unknown>;
  reorderDefaultTabs?(layoutKey: string, tabIds: readonly string[]): Promise<unknown>;
}

export interface LayoutStoreOptions {
  /** 기본은 layout-api. */
  api?: LayoutStoreApi;
  /** 저장(홈·기본 탭)·기본 탭 지우기가 성공한 뒤 부른다 — 화면이 배치 목록을 새로 받는다. */
  onSaved?: (layoutKey: string) => void;
}

const unsupported = (what: string) => new Error(`기본 배치 편집에서는 ${what}을(를) 쓰지 않습니다.`);
/** 서버가 채번한 기본 탭 ID. */
const isServerTabId = (tabId: string) => tabId.startsWith("def-");

/**
 * @param layoutKey `*`(전사) 또는 부서 코드.
 * @param initial 화면이 미리 받아 둔 「홈」 배치 — 있으면 첫 load() 가 loadLayout 요청 없이 그것을 쓴다(그 뒤 load() 는 서버에서 새로 받는다).
 *   기본 탭은 늘 load() 가 받는다.
 */
export function createLayoutStore(
  layoutKey: string,
  initial?: LoadedLayout | null,
  options: LayoutStoreOptions = {}
): WidgetStore {
  const api = options.api ?? layoutApi;
  let preloaded = initial ?? null;
  /** 작업 공간 탭 ID(tab-N) → 서버 기본 탭 ID(def-N). */
  const ids = new Map<string, string>();
  const serverId = (tabId: string) => ids.get(tabId) ?? (isServerTabId(tabId) ? tabId : undefined);

  return {
    async load(): Promise<WidgetTab[]> {
      ids.clear();
      const homePromise = preloaded ? Promise.resolve(preloaded) : api.loadLayout(layoutKey, "Y");
      preloaded = null;
      // 실패는 던진다 — 빈 배열이면 작업 공간이 빈 상태를 저장해 배치를 지울 수 있다.
      const [layout, defaultTabs] = await Promise.all([
        homePromise,
        typeof api.loadDefaultTabs === "function" ? api.loadDefaultTabs(layoutKey) : Promise.resolve([]),
      ]);
      return tabsFromBoard(layout, defaultTabs);
    },
    async saveTab(tab: WidgetTab): Promise<void> {
      if (tab.tabId === HOME_TAB_ID) {
        await api.saveLayout(layoutKey, tab.items);
      } else {
        if (typeof api.saveDefaultTab !== "function") throw unsupported("기본 탭 저장");
        const saved = await api.saveDefaultTab(layoutKey, { tabId: serverId(tab.tabId), tabNm: tab.name, tabSeq: tab.seq }, tab.items);
        if (saved.tabId && saved.tabId !== tab.tabId) ids.set(tab.tabId, saved.tabId);
      }
      options.onSaved?.(layoutKey);
    },
    async deleteTab(tabId: string): Promise<void> {
      if (tabId === HOME_TAB_ID || typeof api.deleteDefaultTab !== "function") throw unsupported("탭 지우기");
      const target = serverId(tabId);
      // 한 번도 저장하지 않은 새 탭은 서버에 없다.
      if (!target) return;
      await api.deleteDefaultTab(layoutKey, target);
      // 성공한 뒤에만 매핑을 지운다 — 실패하면 작업 공간이 탭을 되살리므로 다음 저장·지우기가 같은 def-N 을 써야 한다.
      ids.delete(tabId);
      options.onSaved?.(layoutKey);
    },
    async reorderTabs(tabIds: string[]): Promise<void> {
      if (typeof api.reorderDefaultTabs !== "function") throw unsupported("탭 순서 바꾸기");
      const mapped = tabIds.filter((id) => id !== HOME_TAB_ID).flatMap((id) => serverId(id) ?? []);
      if (mapped.length === 0) return;
      await api.reorderDefaultTabs(layoutKey, mapped);
    },
    async resetHome(): Promise<void> {
      throw unsupported("홈 되돌리기");
    },
  };
}
