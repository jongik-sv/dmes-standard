/** @vitest-environment happy-dom */
/**
 * WidgetWorkspace — 기본 탭(고정 탭)·되돌리기·공유·내보내기·가져오기·admin 모드(widget-tabs 2026-10-05, 설계 design-widget-tabs §4).
 * 공유 창은 Mantine 이라 그 시험만 renderWithMantine 으로 그린다.
 */
import { act, createElement as h } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WidgetWorkspace } from "../../src/widget";
import type { WidgetItem, WidgetRegistry, WidgetStore, WidgetTab } from "../../src/widget";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

let host: HTMLDivElement;
let root: Root;
let mantine: Rendered | null = null;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  mantine?.unmount();
  mantine = null;
  vi.restoreAllMocks();
});

const load = async () => ({ default: () => h("p", null, "위젯") });
const REG: WidgetRegistry = {
  "t.a": { meta: { id: "t.a", title: "가", defaultSize: { w: 6, h: 6 } }, load },
  "t.off": { meta: { id: "t.off", title: "꺼짐", defaultSize: { w: 6, h: 6 }, disabled: true }, load },
};
const it_ = (instId: string, x = 0, y = 0): WidgetItem => ({ instId, widgetId: "t.a", x, y, w: 6, h: 6, locked: false, config: null });
const HOME_DEFAULT = [it_("d1")];

type Store = WidgetStore & { calls: string[] };
function makeStore(tabs: WidgetTab[] | (() => WidgetTab[]), extra: Partial<WidgetStore> = {}): Store {
  const calls: string[] = [];
  return {
    calls,
    load: vi.fn(async () => {
      calls.push("load");
      return typeof tabs === "function" ? tabs() : tabs;
    }),
    saveTab: vi.fn(async (t: WidgetTab) => {
      calls.push(`saveTab:${t.tabId}:${t.name}:${t.items.length}`);
    }),
    deleteTab: vi.fn(async (id: string) => {
      calls.push(`deleteTab:${id}`);
    }),
    reorderTabs: vi.fn(async (ids: string[]) => {
      calls.push(`reorder:${ids.join(",")}`);
    }),
    resetHome: vi.fn(async () => {
      calls.push("resetHome");
    }),
    ...extra,
  };
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  });
}
const $ = (sel: string) => document.querySelector(sel) as HTMLButtonElement | null;
const click = (sel: string) => act(() => $(sel)!.click());
const tabIds = () => [...document.querySelectorAll('[role="tab"]')].map((e) => e.getAttribute("data-tab-id"));
const openMenu = (tabId: string) => click(`[data-tab-menu="${tabId}"]`);
const menuItem = (label: string) => [...document.querySelectorAll(".cm-widget-menu button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
const menuLabels = () => [...document.querySelectorAll(".cm-widget-menu button")].map((b) => `${b.textContent?.trim()}${(b as HTMLButtonElement).disabled ? "(off)" : ""}`);

async function mount(store: WidgetStore, extra: Record<string, unknown> = {}) {
  const confirm = vi.fn(async () => true);
  const notify = vi.fn();
  act(() => root.render(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store, confirm, notify, boardWidth: 1440, ...extra })));
  await flush();
  return { confirm, notify };
}

/** 서버 응답 모양 — 기본 탭 tabSeq 는 100+관리자 순서다. */
const serverTabs = (custom = false): WidgetTab[] => [
  { tabId: "tab-1", name: "내 탭", seq: 1, locked: false, items: [it_("u1")] },
  { tabId: "def-7", name: "품질 현황", seq: 102, locked: false, items: [it_("q1")], defaultTab: true },
  { tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("h1")] },
  { tabId: "def-3", name: "생산 현황", seq: 101, locked: false, items: custom ? [it_("p1"), it_("p2", 6, 0)] : [it_("p1")], defaultTab: true, customized: custom },
];

describe("WidgetWorkspace — 기본 탭", () => {
  it("홈 → 기본 탭(관리자 순서) → 일반 탭 순서로 보인다", async () => {
    await mount(makeStore(serverTabs()));
    expect(tabIds()).toEqual(["home", "def-3", "def-7", "tab-1"]);
  });

  it("일반 탭은 기본 탭 앞으로 못 가고, 순서 저장에는 일반 탭만 넘긴다", async () => {
    const tabs = [...serverTabs(), { tabId: "tab-2", name: "둘째", seq: 2, locked: false, items: [] }];
    const store = makeStore(tabs);
    await mount(store);
    openMenu("tab-1");
    expect(menuItem("왼쪽으로")!.disabled).toBe(true);
    act(() => menuItem("오른쪽으로")!.click());
    await flush();
    expect(tabIds()).toEqual(["home", "def-3", "def-7", "tab-2", "tab-1"]);
    expect(store.calls).toContain("reorder:tab-2,tab-1");
  });

  it("기본 탭은 이름 바꾸기·지우기가 없다", async () => {
    await mount(makeStore(serverTabs()), {});
    openMenu("def-3");
    expect(menuItem("이름 바꾸기")).toBeUndefined();
    expect(menuItem("탭 지우기")).toBeUndefined();
  });

  it("기본 탭을 [배치 편집]→[완료] 로 저장하면 saveTab 하고 다시 불러오지 않아도 되돌리기가 켜진다", async () => {
    const store = makeStore(serverTabs(), { resetTab: vi.fn(async () => {}) });
    await mount(store);
    click('[data-tab-id="def-3"]');
    openMenu("def-3");
    expect(menuLabels()).toContain("기본으로 되돌리기(off)");
    openMenu("def-3");
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="p1"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:def-3:생산 현황:0"]);
    openMenu("def-3");
    expect(menuLabels()).toContain("기본으로 되돌리기");
  });

  it("되돌리기는 확인 뒤 resetTab 을 부르고 스켈레톤 없이 조용히 다시 불러와 관리자 배치를 보인다", async () => {
    let custom = true;
    const resetTab = vi.fn(async () => {
      custom = false;
    });
    const store = makeStore(() => serverTabs(custom), { resetTab });
    const { confirm } = await mount(store, { testId: "ws" });
    click('[data-tab-id="def-3"]');
    expect(document.querySelectorAll(".cm-widget").length).toBe(2);
    openMenu("def-3");
    let busy = false;
    const watcher = new MutationObserver(() => {
      if ($('[data-testid="ws"]')?.getAttribute("aria-busy") === "true") busy = true;
    });
    watcher.observe(host, { subtree: true, attributes: true, childList: true });
    act(() => menuItem("기본으로 되돌리기")!.click());
    await flush();
    watcher.disconnect();
    expect(confirm).toHaveBeenCalledWith("기본으로 되돌릴까요?", expect.stringContaining("생산 현황"));
    expect(resetTab).toHaveBeenCalledWith("def-3");
    expect(store.calls.filter((c) => c === "load")).toHaveLength(2);
    expect(busy).toBe(false);
    // 같은 탭에 머물고 관리자 배치(위젯 1개)로 바뀌며 되돌리기는 다시 꺼진다.
    expect($('[data-tab-id="def-3"]')!.getAttribute("aria-selected")).toBe("true");
    expect(document.querySelectorAll(".cm-widget").length).toBe(1);
    openMenu("def-3");
    expect(menuLabels()).toContain("기본으로 되돌리기(off)");
  });

  it("되돌리기를 취소하면 부르지 않고, 실패하면 알린다", async () => {
    const resetTab = vi.fn(async () => {
      throw new Error("되돌리지 못했습니다.");
    });
    const store = makeStore(serverTabs(true), { resetTab });
    const { confirm, notify } = await mount(store);
    confirm.mockResolvedValueOnce(false);
    openMenu("def-3");
    act(() => menuItem("기본으로 되돌리기")!.click());
    await flush();
    expect(resetTab).not.toHaveBeenCalled();
    openMenu("def-3");
    act(() => menuItem("기본으로 되돌리기")!.click());
    await flush();
    expect(notify).toHaveBeenCalledWith("되돌리지 못했습니다.", "error");
    expect(store.calls).toEqual(["load"]);
  });

  it("홈 되돌리기는 기존대로 resetHome 을 쓴다", async () => {
    const resetTab = vi.fn(async () => {});
    const store = makeStore(serverTabs(), { resetTab });
    await mount(store);
    openMenu("home");
    act(() => menuItem("기본 배치로 되돌리기")!.click());
    await flush();
    expect(store.calls).toContain("resetHome");
    expect(resetTab).not.toHaveBeenCalled();
  });
});

describe("WidgetWorkspace — 공유", () => {
  it("store 에 shareTab·searchUsers 가 없으면 공유 메뉴가 없다", async () => {
    await mount(makeStore(serverTabs()));
    openMenu("tab-1");
    expect(menuItem("공유…")).toBeUndefined();
  });

  it("받는 사람을 찾아 고르고 [보내기] 하면 shareTab(tabId, userIds) 를 부르고 결과를 알린 뒤 창을 닫는다", async () => {
    const searchUsers = vi.fn(async () => [
      { userId: "u2", userNm: "김철수", deptNm: "생산팀" },
      { userId: "me", userNm: "나", deptNm: "생산팀" },
    ]);
    const shareTab = vi.fn(async (_tabId: string, ids: string[]) => ids.map((userId) => ({ userId, ok: true, tabNm: "(공유) 내 탭", message: "" })));
    const store = makeStore(serverTabs(), { searchUsers, shareTab });
    const notify = vi.fn();
    mantine = renderWithMantine(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store, notify, confirm: vi.fn(async () => true), boardWidth: 1440, userId: "me" }));
    await flush();
    openMenu("tab-1");
    act(() => menuItem("공유…")!.click());
    await flush();
    const dialog = document.querySelector('[data-testid="widget-share-dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(document.body.textContent).toContain("「(공유) 내 탭」");
    const input = document.querySelector('input[aria-label="검색어"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "김철");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click('[data-action="lookup-multi-search"]');
    await flush();
    expect(searchUsers).toHaveBeenCalledWith("김철");
    // 나 자신은 결과에서 빠진다.
    expect(document.querySelector('[data-code="me"]')).toBeNull();
    act(() => (document.querySelector('[data-code="u2"] input[type="checkbox"]') as HTMLInputElement).click());
    click('[data-action="lookup-multi-confirm"]');
    await flush();
    expect(shareTab).toHaveBeenCalledWith("tab-1", ["u2"]);
    expect(notify).toHaveBeenCalledWith("1명에게 공유했습니다.", "success");
    expect(document.querySelector('[data-testid="widget-share-dialog"]')).toBeNull();
  });

  it("공유 호출이 실패하면 알리고 창을 그대로 둔다", async () => {
    const store = makeStore(serverTabs(), {
      searchUsers: vi.fn(async () => [{ userId: "u2", userNm: "김철수", deptNm: "" }]),
      shareTab: vi.fn(async () => {
        throw new Error("공유하지 못했습니다.");
      }),
    });
    const notify = vi.fn();
    mantine = renderWithMantine(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store, notify, confirm: vi.fn(async () => true), boardWidth: 1440 }));
    await flush();
    openMenu("def-3");
    act(() => menuItem("공유…")!.click());
    await flush();
    const input = document.querySelector('input[aria-label="검색어"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "김철");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click('[data-action="lookup-multi-search"]');
    await flush();
    act(() => (document.querySelector('[data-code="u2"] input[type="checkbox"]') as HTMLInputElement).click());
    click('[data-action="lookup-multi-confirm"]');
    await flush();
    expect(notify).toHaveBeenCalledWith("공유하지 못했습니다.", "error");
    expect(document.querySelector('[data-testid="widget-share-dialog"]')).not.toBeNull();
  });
});

describe("WidgetWorkspace — 내보내기", () => {
  it("탭을 version 1 JSON 파일로 내려받는다(파일 이름 「탭 이름_날짜.json」)", async () => {
    const blobs: Blob[] = [];
    const urlApi = URL as unknown as { createObjectURL?: (b: Blob) => string; revokeObjectURL?: (u: string) => void };
    const origCreate = urlApi.createObjectURL;
    const origRevoke = urlApi.revokeObjectURL;
    urlApi.createObjectURL = (b: Blob) => {
      blobs.push(b);
      return "blob:x";
    };
    urlApi.revokeObjectURL = () => {};
    const clicked: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    try {
      await mount(makeStore(serverTabs()));
      openMenu("tab-1");
      act(() => menuItem("내보내기")!.click());
      expect(clicked).toHaveLength(1);
      expect(clicked[0]).toMatch(/^내 탭_\d{8}\.json$/);
      const json = JSON.parse(await blobs[0].text());
      expect(json).toEqual({ version: 1, kind: "dmes-widget-tab", name: "내 탭", items: [{ widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null }] });
    } finally {
      urlApi.createObjectURL = origCreate;
      urlApi.revokeObjectURL = origRevoke;
    }
  });
});

describe("WidgetWorkspace — 가져오기", () => {
  async function pick(text: string) {
    const input = document.querySelector('[data-action="import-file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [new File([text], "tab.json", { type: "application/json" })], configurable: true });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
  }
  const fileText = (over: Record<string, unknown> = {}) =>
    JSON.stringify({
      version: 1,
      kind: "dmes-widget-tab",
      name: "내 탭",
      items: [
        { widgetId: "t.a", x: 0, y: 0, w: 6, h: 6, locked: false, config: null },
        { widgetId: "t.gone", x: 6, y: 0, w: 6, h: 6, locked: false, config: null },
        { widgetId: "t.off", x: 12, y: 0, w: 6, h: 6, locked: false, config: null },
      ],
      ...over,
    });

  it("가져온 탭을 새 일반 탭으로 바로 저장하고 고르며, 뺀 위젯을 알린다(이름이 겹치면 숫자 꼬리)", async () => {
    const store = makeStore(serverTabs());
    const { notify } = await mount(store);
    await pick(fileText());
    expect(store.calls).toEqual(["load", "saveTab:tab-2:내 탭 2:1"]);
    expect(tabIds()).toEqual(["home", "def-3", "def-7", "tab-1", "tab-2"]);
    expect($('[data-tab-id="tab-2"]')!.getAttribute("aria-selected")).toBe("true");
    expect(notify).toHaveBeenCalledWith("「내 탭 2」 탭을 가져왔습니다. 없는 위젯(t.gone), 사용 중지 위젯(t.off)은(는) 빼고 가져왔습니다.", "success");
  });

  it("버전이 다르면 거절하고 알린다(저장하지 않는다)", async () => {
    const store = makeStore(serverTabs());
    const { notify } = await mount(store);
    await pick(fileText({ version: 9 }));
    expect(store.calls).toEqual(["load"]);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("version 9"), "error");
  });

  it("저장이 실패하면 탭을 되돌리고 알린다", async () => {
    const store = makeStore(serverTabs());
    (store.saveTab as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("탭 수 한도를 넘습니다."));
    const { notify } = await mount(store);
    await pick(fileText());
    expect(tabIds()).toEqual(["home", "def-3", "def-7", "tab-1"]);
    expect(notify).toHaveBeenCalledWith("탭 수 한도를 넘습니다.", "error");
  });

  it("정의 목록이 준비되지 않았거나 편집 중이면 가져오기가 꺼진다", async () => {
    await mount(makeStore(serverTabs()), { registryStatus: "loading" });
    expect($('[data-action="import-tab"]')!.disabled).toBe(true);
    act(() => root.render(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store: makeStore(serverTabs()), boardWidth: 1440 })));
    await flush();
    expect($('[data-action="import-tab"]')!.disabled).toBe(false);
    click('[data-action="start-edit"]');
    expect($('[data-action="import-tab"]')!.disabled).toBe(true);
  });
});

/* ── 리뷰 수정(2026-10-05) ── */

describe("WidgetWorkspace — 새 탭 ID 교체(공유 사본 덮어쓰기 방지)", () => {
  /** saveTab 이 fresh 탭을 받으면 ID 를 옮겨 저장한 것처럼 돌려주는 저장소. */
  function movingStore(tabs: WidgetTab[], moveTo: string | null) {
    const saved: WidgetTab[] = [];
    const store = makeStore(tabs);
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementation(async (t: WidgetTab) => {
      saved.push(t);
      store.calls.push(`saveTab:${t.tabId}:${t.fresh ? "fresh" : "-"}`);
      return t.fresh && moveTo ? { tabId: moveTo } : { tabId: t.tabId };
    });
    return { store, saved };
  }
  const base = (): WidgetTab[] => [{ tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("h1")] }];

  it("(+) 새 탭의 첫 저장은 fresh 이고, 저장소가 다른 ID 를 돌려주면 탭·고른 탭·마지막 탭 기억이 그 ID 로 바뀐다(instId 유지)", async () => {
    // happy-dom 이 localStorage 를 노출하지 않을 수 있어 Map 스텁을 잠깐 둔다(widget-workspace 시험 방식).
    const mem = new Map<string, string>();
    const prev = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      value: { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) },
      configurable: true,
    });
    try {
      const { store, saved } = movingStore(base(), "tab-5");
      await mount(store, { userId: "u1" });
      click('[data-action="add-tab"]');
      act(() => (document.querySelector(".cm-widget-tab__name") as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
      click('.cm-widget-picker [data-widget-id="t.a"]');
      const instId = document.querySelector(".cm-widget")!.getAttribute("data-inst-id");
      // 마지막 탭 기억이 옛 ID 를 가리키는 경우(탭을 골라 둔 뒤 저장)
      mem.set("dmes:widget:lastTab:u1", "tab-1");
      click('[data-action="done-edit"]');
      await flush();
      expect(store.calls).toEqual(["load", "saveTab:tab-1:fresh"]);
      expect(saved[0].fresh).toBe(true);
      expect(tabIds()).toEqual(["home", "tab-5"]);
      expect($('[data-tab-id="tab-5"]')!.getAttribute("aria-selected")).toBe("true");
      expect(document.querySelector(".cm-widget")!.getAttribute("data-inst-id")).toBe(instId);
      expect(mem.get("dmes:widget:lastTab:u1")).toBe("tab-5");
      // 다음 저장은 새 ID 로, fresh 없이
      openMenu("tab-5");
      act(() => menuItem("탭 잠그기")!.click());
      await flush();
      expect(store.calls).toEqual(["load", "saveTab:tab-1:fresh", "saveTab:tab-5:-"]);
    } finally {
      if (prev) Object.defineProperty(window, "localStorage", prev);
      else delete (window as unknown as { localStorage?: unknown }).localStorage;
    }
  });

  it("충돌이 없으면 ID 는 그대로이고 두 번째 저장에는 fresh 를 보내지 않는다", async () => {
    const { store } = movingStore(base(), null);
    await mount(store);
    click('[data-action="add-tab"]');
    act(() => (document.querySelector(".cm-widget-tab__name") as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    click('[data-action="done-edit"]');
    await flush();
    expect(tabIds()).toEqual(["home", "tab-1"]);
    openMenu("tab-1");
    act(() => menuItem("탭 잠그기")!.click());
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:tab-1:fresh", "saveTab:tab-1:-"]);
  });

  it("새 탭 둘 중 첫 탭을 서버가 둘째 탭의 ID 로 옮겨도 ID 가 겹치지 않고, 둘째도 정상 저장된다(재리뷰)", async () => {
    // 서버 쪽 탭 ID — 공유 사본 tab-1 이 이미 있다. fresh 저장이 이미 있는 ID 면 다음 빈 번호로 옮긴다.
    const server = new Set(["home", "tab-1"]);
    const store = makeStore(base());
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementation(async (t: WidgetTab) => {
      let id = t.tabId;
      if (t.fresh && server.has(id)) {
        let n = 1;
        while (server.has(`tab-${n}`)) n += 1;
        id = `tab-${n}`;
      }
      server.add(id);
      store.calls.push(`saveTab:${t.tabId}->${id}:${t.fresh ? "fresh" : "-"}:${t.name}`);
      return { tabId: id };
    });
    await mount(store);
    const enter = () =>
      act(() => (document.querySelector(".cm-widget-tab__name") as HTMLInputElement).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    click('[data-action="add-tab"]');
    enter();
    click('[data-action="add-tab"]');
    enter();
    expect(tabIds()).toEqual(["home", "tab-1", "tab-2"]);
    click('[data-action="done-edit"]');
    await flush();
    // tab-1 은 서버에 있어 tab-2 로 옮겨지고, 화면의 tab-2(아직 저장 전)는 빈 ID 로 비켜 저장된다.
    expect(store.calls[1]).toBe("saveTab:tab-1->tab-2:fresh:새 탭");
    expect(store.calls[2]).toMatch(/^saveTab:tab-3->tab-3:fresh:새 탭 2$/);
    const ids = tabIds();
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(["home", "tab-2", "tab-3"]);
    expect($('[data-action="start-edit"]')).not.toBeNull(); // [완료] 성공
    // 둘째 저장 뒤 같은 탭을 다시 저장하면 fresh 없이 제 ID 로 간다.
    openMenu("tab-3");
    act(() => menuItem("탭 잠그기")!.click());
    await flush();
    expect(store.calls[3]).toBe("saveTab:tab-3->tab-3:-:새 탭 2");
    expect([...document.querySelectorAll('[role="tab"]')].map((e) => e.textContent?.replace(/[⋯🔒]/g, ""))).toEqual(["홈", "새 탭", "새 탭 2"]);
  });

  it("가져오기도 fresh 로 저장하고, 옮겨진 ID 로 탭을 고른다", async () => {
    const { store } = movingStore(base(), "tab-4");
    await mount(store);
    const input = document.querySelector('[data-action="import-file"]') as HTMLInputElement;
    const text = JSON.stringify({ version: 1, kind: "dmes-widget-tab", name: "가져옴", items: [{ widgetId: "t.a", x: 0, y: 0, w: 6, h: 6 }] });
    Object.defineProperty(input, "files", { value: [new File([text], "t.json")], configurable: true });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:tab-1:fresh"]);
    expect(tabIds()).toEqual(["home", "tab-4"]);
    expect($('[data-tab-id="tab-4"]')!.getAttribute("aria-selected")).toBe("true");
  });
});

describe("WidgetWorkspace — 리뷰 낮음 항목", () => {
  it("되돌리기 요청 중에는 [배치 편집]·(+) 가 막힌다(리뷰 6)", async () => {
    let release!: () => void;
    const resetTab = vi.fn(() => new Promise<void>((r) => (release = r)));
    await mount(makeStore(serverTabs(true), { resetTab }));
    openMenu("def-3");
    act(() => menuItem("기본으로 되돌리기")!.click());
    await flush();
    expect($('[data-action="start-edit"]')!.disabled).toBe(true);
    expect($('[data-action="add-tab"]')!.disabled).toBe(true);
    await act(async () => release());
    await flush();
    expect($('[data-action="start-edit"]')!.disabled).toBe(false);
  });

  it("기본 탭 저장 뒤 다른 탭 저장이 실패하고 [취소]해도 되돌리기는 켜져 있다(리뷰 7)", async () => {
    const store = makeStore(serverTabs(), { resetTab: vi.fn(async () => {}) });
    (store.saveTab as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {}).mockRejectedValueOnce(new Error("저장 실패"));
    await mount(store);
    click('[data-action="start-edit"]');
    click('[data-tab-id="def-3"]');
    click('.cm-widget[data-inst-id="p1"] [data-action="remove"]');
    click('[data-tab-id="tab-1"]');
    click('.cm-widget[data-inst-id="u1"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    click('[data-action="cancel-edit"]');
    await flush();
    openMenu("def-3");
    expect(menuLabels()).toContain("기본으로 되돌리기");
  });

  it("1MB 를 넘는 파일은 읽지 않고 거절하고, 읽기 실패는 알린다(리뷰 8)", async () => {
    const store = makeStore(serverTabs());
    const { notify } = await mount(store);
    const input = document.querySelector('[data-action="import-file"]') as HTMLInputElement;
    const big = new File(["x"], "big.json");
    Object.defineProperty(big, "size", { value: 1024 * 1024 + 1 });
    const textSpy = vi.fn();
    Object.defineProperty(big, "text", { value: textSpy });
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    expect(textSpy).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith("파일이 너무 큽니다(최대 1MB).", "error");
    const broken = new File(["{}"], "broken.json");
    Object.defineProperty(broken, "text", { value: () => Promise.reject(new Error("읽기 실패")) });
    Object.defineProperty(input, "files", { value: [broken], configurable: true });
    act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    expect(notify).toHaveBeenCalledWith("파일을 읽지 못했습니다.", "error");
    expect(store.calls).toEqual(["load"]);
  });

  async function openShare(store: WidgetStore, notify = vi.fn()) {
    mantine = renderWithMantine(h(WidgetWorkspace, { registry: REG, homeDefault: HOME_DEFAULT, store, notify, confirm: vi.fn(async () => true), boardWidth: 1440 }));
    await flush();
    openMenu("tab-1");
    act(() => menuItem("공유…")!.click());
    await flush();
    const input = document.querySelector('input[aria-label="검색어"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "팀원");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click('[data-action="lookup-multi-search"]');
    await flush();
    return notify;
  }
  const people = [
    { userId: "u2", userNm: "김철수", deptNm: "생산팀" },
    { userId: "u3", userNm: "이영희", deptNm: "품질팀" },
  ];
  const box = (code: string) => document.querySelector(`[data-code="${code}"] input[type="checkbox"]`) as HTMLInputElement;

  it("일부만 실패하면 알리고 창을 둔 채 실패한 사람만 고른 상태로 남긴다(리뷰 10)", async () => {
    const shareTab = vi.fn(async () => [
      { userId: "u2", ok: true, tabNm: "(공유) 내 탭", message: "" },
      { userId: "u3", ok: false, tabNm: "", message: "탭 수 한도를 넘습니다." },
    ]);
    const notify = await openShare(makeStore(serverTabs(), { searchUsers: vi.fn(async () => people), shareTab }));
    act(() => box("u2").click());
    act(() => box("u3").click());
    click('[data-action="lookup-multi-confirm"]');
    await flush();
    expect(notify).toHaveBeenCalledWith("1명에게 공유했고 1명은 보내지 못했습니다. 이영희: 탭 수 한도를 넘습니다.", "error");
    expect(document.querySelector('[data-testid="widget-share-dialog"]')).not.toBeNull();
    expect(box("u2").checked).toBe(false);
    expect(box("u3").checked).toBe(true);
  });

  it("[보내기]를 두 번 눌러도 shareTab 은 한 번이다(리뷰 15)", async () => {
    let release!: () => void;
    const shareTab = vi.fn(
      () =>
        new Promise<{ userId: string; ok: boolean; tabNm: string; message: string }[]>((r) => (release = () => r([{ userId: "u2", ok: true, tabNm: "x", message: "" }])))
    );
    await openShare(makeStore(serverTabs(), { searchUsers: vi.fn(async () => people), shareTab }));
    act(() => box("u2").click());
    await act(async () => {
      $('[data-action="lookup-multi-confirm"]')!.click();
      $('[data-action="lookup-multi-confirm"]')!.click();
    });
    await act(async () => release());
    await flush();
    expect(shareTab).toHaveBeenCalledTimes(1);
  });
});

describe("WidgetWorkspace — admin 모드 저장 순서", () => {
  it("[완료]는 기본 탭을 먼저, 「홈」을 마지막에 저장한다(리뷰 5)", async () => {
    const store = makeStore([
      { tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("h1"), it_("h2", 6, 0)] },
      { tabId: "def-3", name: "생산 현황", seq: 1, locked: false, items: [it_("p1"), it_("p2", 6, 0)] },
    ]);
    await mount(store, { mode: "admin" });
    click('[data-action="start-edit"]');
    click('.cm-widget[data-inst-id="h1"] [data-action="remove"]');
    click('[data-tab-id="def-3"]');
    click('.cm-widget[data-inst-id="p1"] [data-action="remove"]');
    click('[data-action="done-edit"]');
    await flush();
    expect(store.calls).toEqual(["load", "saveTab:def-3:생산 현황:1", "saveTab:home:홈:1"]);
  });
});

describe("WidgetWorkspace — admin 모드", () => {
  const adminTabs = (): WidgetTab[] => [
    { tabId: "home", name: "홈", seq: 0, locked: false, items: [it_("h1")] },
    { tabId: "def-3", name: "생산 현황", seq: 1, locked: false, items: [it_("p1")] },
  ];
  const fullStore = () =>
    makeStore(adminTabs(), { resetTab: vi.fn(), shareTab: vi.fn(), searchUsers: vi.fn() });

  it("가져오기가 없고 홈에는 ⋯ 가 없으며, 기본 탭 메뉴에는 잠그기·공유·내보내기가 없다", async () => {
    await mount(fullStore(), { mode: "admin" });
    expect($('[data-action="import-tab"]')).toBeNull();
    expect($('[data-tab-menu="home"]')).toBeNull();
    openMenu("def-3");
    expect(menuLabels()).toEqual(["이름 바꾸기", "왼쪽으로(off)", "오른쪽으로(off)", "탭 지우기"]);
  });

  it("홈 외 탭은 이름 바꾸기·지우기가 된다", async () => {
    const store = fullStore();
    await mount(store, { mode: "admin" });
    openMenu("def-3");
    act(() => menuItem("탭 지우기")!.click());
    await flush();
    expect(store.calls).toContain("deleteTab:def-3");
    expect(tabIds()).toEqual(["home"]);
  });

  it("탭 한도는 홈 + 5 — 여섯 개면 (+) 가 꺼진다", async () => {
    const six = [...adminTabs(), ...[4, 5, 6, 7].map((n) => ({ tabId: `def-${n}`, name: `탭${n}`, seq: n, locked: false, items: [] }))];
    await mount(makeStore(six), { mode: "admin" });
    expect(tabIds()).toHaveLength(6);
    expect($('[data-action="add-tab"]')!.disabled).toBe(true);
  });
});
