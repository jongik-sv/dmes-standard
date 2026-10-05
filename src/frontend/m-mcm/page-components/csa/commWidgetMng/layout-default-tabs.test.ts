/**
 * 위젯관리 「기본 배치」 — 기본 탭(widget-tabs 2026-10-05, 설계 design-widget-tabs §3.2·§4).
 * 서버 호출(layout-api 의 새 action)·목록 표시(tabCount)·어댑터(layout-store)의 홈/기본 탭 나눠 보내기와 tab-N → def-N 매핑.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteDefaultTab, loadDefaultTabs, reorderDefaultTabs, saveDefaultTab, searchLayouts } from "./layout-api";
import {
  buildLayoutList,
  defaultTabsFromRows,
  deleteConfirmMessage,
  tabsFromBoard,
  type LayoutSummary,
  type LoadedDefaultTab,
  type LoadedLayout,
} from "./layout-model";
import { createLayoutStore, type LayoutStoreApi } from "./layout-store";

const ITEM = { instId: "a", widgetId: "home.kpi", x: 0, y: 0, w: 24, h: 7, locked: false, config: null };
const ROW = { instId: "a", widgetId: "home.kpi", posX: 0, posY: 0, sizeW: 24, sizeH: 7, lockYn: "N" };

/* ── 서버 호출 ── */
const fetchMock = vi.fn();
function reply(result: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ meta: { success: true }, data: { result } }), { status: 200, headers: { "Content-Type": "application/json" } })
  );
}
function sent(i = 0): { url: string; body: { params: Record<string, unknown>; grids?: Record<string, { rows: unknown[] }> } } {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) };
}

describe("layout-api — 기본 탭", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("searchLayouts 는 tabCount 가 있는 줄에만 싣는다", async () => {
    reply({ layouts: [{ layoutKey: "*", deptNm: "전사", count: 11, tabCount: "2" }, { layoutKey: "D100", deptNm: "생산팀", count: 0 }] });
    expect(await searchLayouts()).toEqual([
      { layoutKey: "*", deptNm: "전사", count: 11, tabCount: 2 },
      { layoutKey: "D100", deptNm: "생산팀", count: 0 },
    ]);
  });

  it("loadDefaultTabs 는 layoutKey 를 보내고 tabs[] 를 tabSeq 순 기본 탭으로 푼다", async () => {
    reply({ layoutKey: "*", tabs: [{ tabId: "def-9", tabNm: "품질", tabSeq: 2, items: [] }, { tabId: "def-3", tabNm: "생산", tabSeq: "1", items: [ROW] }] });
    const tabs = await loadDefaultTabs("*");
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/loadDefaultTabs");
    expect(sent().body.params).toEqual({ layoutKey: "*" });
    expect(tabs).toEqual([
      { tabId: "def-3", tabNm: "생산", tabSeq: 1, items: [ITEM] },
      { tabId: "def-9", tabNm: "품질", tabSeq: 2, items: [] },
    ]);
  });

  it("saveDefaultTab 은 새 탭이면 tabId 없이, 있으면 tabId 와 함께 widgets.rows 를 보내고 서버 ID 를 돌려준다", async () => {
    reply({ layoutKey: "D100", tabId: "def-12", count: 1 });
    expect(await saveDefaultTab("D100", { tabNm: "생산", tabSeq: 1 }, [ITEM])).toEqual({ layoutKey: "D100", tabId: "def-12", count: 1 });
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/saveDefaultTab");
    expect(sent().body.params).toEqual({ layoutKey: "D100", tabNm: "생산", tabSeq: 1 });
    expect(sent().body.grids).toEqual({ widgets: { rows: [ROW] } });
    reply({ layoutKey: "D100", tabId: "def-12", count: 0 });
    await saveDefaultTab("D100", { tabId: "def-12", tabNm: "생산2", tabSeq: 2 }, []);
    expect(sent(1).body.params).toEqual({ layoutKey: "D100", tabId: "def-12", tabNm: "생산2", tabSeq: 2 });
    expect(sent(1).body.grids).toEqual({ widgets: { rows: [] } });
  });

  it("deleteDefaultTab·reorderDefaultTabs 호출 모양", async () => {
    reply({ deleted: 1 });
    await deleteDefaultTab("*", "def-3");
    expect(sent().url).toBe("/api/mcm/oasis/commWidgetMng/deleteDefaultTab");
    expect(sent().body.params).toEqual({ layoutKey: "*", tabId: "def-3" });
    reply({});
    await reorderDefaultTabs("*", ["def-9", "def-3"]);
    expect(sent(1).url).toBe("/api/mcm/oasis/commWidgetMng/reorderDefaultTabs");
    expect(sent(1).body.params).toEqual({ layoutKey: "*" });
    expect(sent(1).body.grids).toEqual({ tabs: { rows: [{ tabId: "def-9" }, { tabId: "def-3" }] } });
  });

  it("업무 거절(키당 5개 초과 등)은 메시지로 던진다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ meta: { success: false, message: "기본 탭은 5개까지 둘 수 있습니다." } }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    await expect(saveDefaultTab("*", { tabNm: "여섯째", tabSeq: 6 }, [])).rejects.toThrow("기본 탭은 5개까지");
  });
});

/* ── 목록 표시 ── */
describe("layout-model — 기본 탭", () => {
  const S = (layoutKey: string, deptNm: string, count: number, tabCount?: number): LayoutSummary => ({ layoutKey, deptNm, count, ...(tabCount != null ? { tabCount } : {}) });

  it("목록 이름에 기본 탭 수를 붙이고, 기본 탭만 있는 키는 홈을 코드 기본값·물려받음으로 보인다", () => {
    const rows = buildLayoutList([S("*", "전사", 0, 2), S("D100", "생산팀", 0, 1), S("D200", "품질팀", 4)], []);
    expect(rows.map((r) => [r.label, r.saved, r.tabCount])).toEqual([
      ["전사(*) · 코드 기본값 사용 중 · 기본 탭 2개", true, 2],
      ["생산팀(D100) · 홈 물려받음 · 기본 탭 1개", true, 1],
      ["품질팀(D200) · 4개", true, 0],
    ]);
  });

  it("지우기 확인 문구는 기본 탭이 있을 때만 함께 지워진다고 덧붙인다", () => {
    const rows = buildLayoutList([S("*", "전사", 3, 2), S("D100", "생산팀", 4)], []);
    expect(deleteConfirmMessage("*", rows)).toBe("전사 기본 배치를 삭제하시겠습니까? 삭제하면 코드 기본값이 적용됩니다. 이 배치의 기본 탭 2개도 함께 지워집니다.");
    expect(deleteConfirmMessage("D100", rows)).toBe("생산팀 기본 배치를 삭제하시겠습니까? 삭제하면 상위 부서 또는 전사 배치가 적용됩니다.");
  });

  it("defaultTabsFromRows 는 배열이 아니거나 tabId 가 빈 줄을 건너뛴다", () => {
    expect(defaultTabsFromRows(undefined)).toEqual([]);
    expect(defaultTabsFromRows([null, { tabNm: "이름만" }, { tabId: "def-1", tabNm: "가", tabSeq: 1 }])).toEqual([{ tabId: "def-1", tabNm: "가", tabSeq: 1, items: [] }]);
  });

  it("tabsFromBoard 는 홈(항목이 있을 때) + 기본 탭이고, 기본 탭에 defaultTab 표시를 붙이지 않는다", () => {
    const layout: LoadedLayout = { layoutKey: "*", sourceKey: "*", items: [ITEM] };
    const defs: LoadedDefaultTab[] = [{ tabId: "def-3", tabNm: "생산", tabSeq: 1, items: [] }];
    expect(tabsFromBoard(layout, defs)).toEqual([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [ITEM] },
      { tabId: "def-3", name: "생산", seq: 1, locked: false, items: [] },
    ]);
    expect(tabsFromBoard({ ...layout, items: [] }, defs).map((t) => t.tabId)).toEqual(["def-3"]);
  });
});

/* ── 어댑터 ── */
type FakeApi = Required<LayoutStoreApi> & { [K in keyof LayoutStoreApi]-?: ReturnType<typeof vi.fn> };
function fakeApi(defs: LoadedDefaultTab[] = [{ tabId: "def-3", tabNm: "생산", tabSeq: 1, items: [ITEM] }]): FakeApi {
  let n = 20;
  return {
    loadLayout: vi.fn(async () => ({ layoutKey: "*", sourceKey: "*", items: [ITEM] })),
    saveLayout: vi.fn(async () => undefined),
    loadDefaultTabs: vi.fn(async () => defs),
    saveDefaultTab: vi.fn(async (_key: string, tab: { tabId?: string }) => ({ tabId: tab.tabId ?? `def-${(n += 1)}` })),
    deleteDefaultTab: vi.fn(async () => undefined),
    reorderDefaultTabs: vi.fn(async () => undefined),
  } as unknown as FakeApi;
}
const tab = (tabId: string, name: string, seq: number) => ({ tabId, name, seq, locked: false, items: [ITEM] });

describe("createLayoutStore — 기본 탭", () => {
  it("load 는 홈(미리 받은 배치)과 그 키의 기본 탭을 함께 돌려준다", async () => {
    const api = fakeApi();
    const store = createLayoutStore("*", { layoutKey: "*", sourceKey: "*", items: [ITEM] }, { api });
    expect((await store.load()).map((t) => t.tabId)).toEqual(["home", "def-3"]);
    expect(api.loadLayout).not.toHaveBeenCalled();
    expect(api.loadDefaultTabs).toHaveBeenCalledWith("*");
  });

  it("기본 탭을 못 받으면 load 가 던진다(빈 상태를 저장하지 않게)", async () => {
    const api = fakeApi();
    api.loadDefaultTabs.mockRejectedValueOnce(new Error("조회 실패"));
    await expect(createLayoutStore("*", null, { api }).load()).rejects.toThrow("조회 실패");
  });

  it("홈은 saveLayout, 기존 기본 탭은 saveDefaultTab(tabId) 으로 보내고 저장을 알린다", async () => {
    const api = fakeApi();
    const onSaved = vi.fn();
    const store = createLayoutStore("D100", null, { api, onSaved });
    await store.saveTab(tab("home", "홈", 0));
    await store.saveTab(tab("def-3", "생산 현황", 1));
    expect(api.saveLayout).toHaveBeenCalledWith("D100", [ITEM]);
    expect(api.saveDefaultTab).toHaveBeenCalledWith("D100", { tabId: "def-3", tabNm: "생산 현황", tabSeq: 1 }, [ITEM]);
    expect(onSaved).toHaveBeenCalledTimes(2);
  });

  it("새 탭(tab-N)은 tabId 없이 보내고, 받은 def-N 을 기억해 다음 저장·순서·지우기에 쓴다", async () => {
    const api = fakeApi();
    const store = createLayoutStore("*", null, { api });
    await store.load();
    await store.saveTab(tab("tab-1", "새 탭", 2));
    expect(api.saveDefaultTab).toHaveBeenLastCalledWith("*", { tabId: undefined, tabNm: "새 탭", tabSeq: 2 }, [ITEM]);
    await store.saveTab(tab("tab-1", "새 이름", 2));
    expect(api.saveDefaultTab).toHaveBeenLastCalledWith("*", { tabId: "def-21", tabNm: "새 이름", tabSeq: 2 }, [ITEM]);
    await store.reorderTabs(["tab-1", "def-3"]);
    expect(api.reorderDefaultTabs).toHaveBeenCalledWith("*", ["def-21", "def-3"]);
    await store.deleteTab("tab-1");
    expect(api.deleteDefaultTab).toHaveBeenCalledWith("*", "def-21");
    // 지운 뒤 같은 tab-1 을 새 탭에 다시 써도 옛 def-21 을 덮어쓰지 않는다.
    await store.saveTab(tab("tab-1", "또 새 탭", 2));
    expect(api.saveDefaultTab).toHaveBeenLastCalledWith("*", { tabId: undefined, tabNm: "또 새 탭", tabSeq: 2 }, [ITEM]);
  });

  it("load 는 매핑을 비운다 — 다시 불러온 뒤 tab-1 이 새 탭이면 새로 만든다", async () => {
    const api = fakeApi();
    const store = createLayoutStore("*", null, { api });
    await store.saveTab(tab("tab-1", "새 탭", 2));
    await store.load();
    await store.saveTab(tab("tab-1", "다른 새 탭", 3));
    expect(api.saveDefaultTab).toHaveBeenLastCalledWith("*", { tabId: undefined, tabNm: "다른 새 탭", tabSeq: 3 }, [ITEM]);
  });

  it("한 번도 저장하지 않은 새 탭 지우기·순서는 서버를 부르지 않는다", async () => {
    const api = fakeApi();
    const onSaved = vi.fn();
    const store = createLayoutStore("*", null, { api, onSaved });
    await store.deleteTab("tab-4");
    await store.reorderTabs(["tab-4"]);
    expect(api.deleteDefaultTab).not.toHaveBeenCalled();
    expect(api.reorderDefaultTabs).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("「홈」 지우기·홈 되돌리기는 거절한다", async () => {
    const store = createLayoutStore("*", null, { api: fakeApi() });
    await expect(store.deleteTab("home")).rejects.toThrow(Error);
    await expect(store.resetHome()).rejects.toThrow(Error);
  });

  it("기본 탭 저장이 실패하면 던지고 매핑·알림을 남기지 않는다", async () => {
    const api = fakeApi();
    api.saveDefaultTab.mockRejectedValueOnce(new Error("같은 이름의 기본 탭이 있습니다."));
    const onSaved = vi.fn();
    const store = createLayoutStore("*", null, { api, onSaved });
    await expect(store.saveTab(tab("tab-1", "생산", 2))).rejects.toThrow("같은 이름");
    expect(onSaved).not.toHaveBeenCalled();
    await store.deleteTab("tab-1");
    expect(api.deleteDefaultTab).not.toHaveBeenCalled();
  });
});
