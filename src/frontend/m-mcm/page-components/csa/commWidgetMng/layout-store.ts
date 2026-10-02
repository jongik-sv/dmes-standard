/**
 * 관리자 기본 배치 편집용 WidgetStore 어댑터 — WidgetWorkspace singleTab 에 주입한다(스펙 2026-10-02-widget-admin-generic §2 WidgetStore·§10.2).
 *   load()    → commWidgetMng/loadLayout(layoutKey, effective=Y) 의 항목을 「홈」 탭 하나로(없으면 []).
 *   saveTab() → commWidgetMng/saveLayout(layoutKey, 항목들). 그 키의 배치를 통째로 바꾼다.
 * 탭 지우기·순서 바꾸기·홈 되돌리기는 이 화면에 없으므로 거절한다(지우기는 화면의 [기본 배치 지우기] 가 deleteLayout 을 직접 부른다).
 * shared 런타임을 import 하지 않는다(타입만).
 */
import type { WidgetItem, WidgetStore, WidgetTab } from "@dk-oasis/shared/widget";

import * as layoutApi from "./layout-api";
import { tabsFromLayout, type LoadedLayout } from "./layout-model";

/** 저장소가 부르는 서버 호출 — 시험이 가짜로 바꿔 끼운다. */
export interface LayoutStoreApi {
  loadLayout(layoutKey: string, effective: "Y" | "N"): Promise<LoadedLayout>;
  saveLayout(layoutKey: string, items: readonly WidgetItem[]): Promise<unknown>;
}

export interface LayoutStoreOptions {
  /** 기본은 layout-api. */
  api?: LayoutStoreApi;
  /** saveTab 이 성공한 뒤 부른다 — 화면이 배치 목록을 새로 받는다. */
  onSaved?: (layoutKey: string) => void;
}

const unsupported = (what: string) => new Error(`기본 배치 편집에서는 ${what}을(를) 쓰지 않습니다.`);

/**
 * @param layoutKey `*`(전사) 또는 부서 코드.
 * @param initial 화면이 미리 받아 둔 배치 — 있으면 첫 load() 가 요청 없이 그것을 쓴다(그 뒤 load() 는 서버에서 새로 받는다).
 */
export function createLayoutStore(
  layoutKey: string,
  initial?: LoadedLayout | null,
  options: LayoutStoreOptions = {}
): WidgetStore {
  const api = options.api ?? layoutApi;
  let preloaded = initial ?? null;

  return {
    async load(): Promise<WidgetTab[]> {
      if (preloaded) {
        const layout = preloaded;
        preloaded = null;
        return tabsFromLayout(layout);
      }
      // 실패는 던진다 — 빈 배열이면 작업 공간이 빈 상태를 저장해 배치를 지울 수 있다.
      return tabsFromLayout(await api.loadLayout(layoutKey, "Y"));
    },
    async saveTab(tab: WidgetTab): Promise<void> {
      await api.saveLayout(layoutKey, tab.items);
      options.onSaved?.(layoutKey);
    },
    async deleteTab(): Promise<void> {
      throw unsupported("탭 지우기");
    },
    async reorderTabs(): Promise<void> {
      throw unsupported("탭 순서 바꾸기");
    },
    async resetHome(): Promise<void> {
      throw unsupported("홈 되돌리기");
    },
  };
}
