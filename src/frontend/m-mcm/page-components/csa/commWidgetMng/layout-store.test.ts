import { describe, expect, it, vi } from "vitest";

import { createLayoutStore, type LayoutStoreApi } from "./layout-store";
import type { LoadedLayout } from "./layout-model";

const ITEM = { instId: "a", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: false, config: null };

function fakeApi(layout: LoadedLayout | Error): LayoutStoreApi & { loadLayout: ReturnType<typeof vi.fn>; saveLayout: ReturnType<typeof vi.fn> } {
  return {
    loadLayout: vi.fn(async () => {
      if (layout instanceof Error) throw layout;
      return layout;
    }),
    saveLayout: vi.fn(async () => undefined),
  };
}

describe("createLayoutStore.load", () => {
  it("loadLayout(layoutKey, Y) 결과에 항목이 있으면 「홈」 탭 하나로 돌려준다", async () => {
    const api = fakeApi({ layoutKey: "*", sourceKey: "*", items: [ITEM] });
    const store = createLayoutStore("*", null, { api });
    expect(await store.load()).toEqual([{ tabId: "home", name: "홈", seq: 0, locked: false, items: [ITEM] }]);
    expect(api.loadLayout).toHaveBeenCalledWith("*", "N");
  });

  it("항목이 없으면 빈 배열 — WidgetWorkspace 가 코드 기본 배치(HOME_DEFAULT_LAYOUT)를 쓴다", async () => {
    const api = fakeApi({ layoutKey: "*", sourceKey: null, items: [] });
    expect(await createLayoutStore("*", null, { api }).load()).toEqual([]);
  });

  it("상속 배치(sourceKey ≠ layoutKey)도 항목을 홈 탭으로 돌려준다", async () => {
    const api = fakeApi({ layoutKey: "D100", sourceKey: "*", items: [ITEM] });
    const tabs = await createLayoutStore("D100", undefined, { api }).load();
    expect(tabs).toHaveLength(1);
    expect(tabs[0].items).toEqual([ITEM]);
    expect(api.loadLayout).toHaveBeenCalledWith("D100", "N");
  });

  it("미리 받아 둔 배치(initial)가 있으면 첫 load 는 요청 없이 그것을 쓰고, 다시 부르면 서버에서 새로 받는다", async () => {
    const api = fakeApi({ layoutKey: "*", sourceKey: "*", items: [{ ...ITEM, instId: "fresh" }] });
    const store = createLayoutStore("*", { layoutKey: "*", sourceKey: "*", items: [ITEM] }, { api });
    expect((await store.load())[0].items[0].instId).toBe("a");
    expect(api.loadLayout).not.toHaveBeenCalled();
    expect((await store.load())[0].items[0].instId).toBe("fresh");
    expect(api.loadLayout).toHaveBeenCalledTimes(1);
  });

  it("불러오기 실패는 빈 배열이 아니라 던진다(빈 상태를 저장해 배치를 지우지 않게)", async () => {
    const api = fakeApi(new Error("조회 실패"));
    await expect(createLayoutStore("*", null, { api }).load()).rejects.toThrow("조회 실패");
  });
});

describe("createLayoutStore.saveTab", () => {
  const TAB = { tabId: "home", name: "홈", seq: 0, locked: false, items: [ITEM] };

  it("saveLayout(layoutKey, 항목들)으로 넘기고 저장된 키를 알린다", async () => {
    const api = fakeApi({ layoutKey: "D100", sourceKey: null, items: [] });
    const onSaved = vi.fn();
    await createLayoutStore("D100", null, { api, onSaved }).saveTab(TAB);
    expect(api.saveLayout).toHaveBeenCalledTimes(1);
    expect(api.saveLayout).toHaveBeenCalledWith("D100", [ITEM]);
    expect(onSaved).toHaveBeenCalledWith("D100");
  });

  it("서버가 거절하면 던지고 저장 알림은 하지 않는다", async () => {
    const api = fakeApi({ layoutKey: "*", sourceKey: null, items: [] });
    api.saveLayout.mockRejectedValueOnce(new Error("위젯이 하나도 없는 기본 배치는 저장할 수 없습니다."));
    const onSaved = vi.fn();
    await expect(createLayoutStore("*", null, { api, onSaved }).saveTab({ ...TAB, items: [] })).rejects.toThrow("위젯이 하나도 없는");
    expect(onSaved).not.toHaveBeenCalled();
  });
});

describe("createLayoutStore — 쓰지 않는 동작은 거절", () => {
  it("resetHome·deleteTab·reorderTabs 는 Error 로 거절하고 서버를 부르지 않는다", async () => {
    const api = fakeApi({ layoutKey: "*", sourceKey: null, items: [] });
    const store = createLayoutStore("*", null, { api });
    await expect(store.resetHome()).rejects.toThrow(Error);
    await expect(store.deleteTab("home")).rejects.toThrow(Error);
    await expect(store.reorderTabs(["a"])).rejects.toThrow(Error);
    expect(api.loadLayout).not.toHaveBeenCalled();
    expect(api.saveLayout).not.toHaveBeenCalled();
  });
});
