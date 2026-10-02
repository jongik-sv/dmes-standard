/** @vitest-environment happy-dom */
/**
 * 포털 기본 화면(처음 시작할 때 자동으로 여는 화면)과 탭 컨텍스트 메뉴(왼쪽·오른쪽·모든 탭 닫기, 기본 화면 등록/해제).
 * 순수 계산(start-pages.ts)·TabsBar·Sidebar·PortalShell 기동 흐름을 함께 검증한다.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearStartPagesOpened,
  getTabCloseTargets,
  hasOpenedStartPages,
  markStartPagesOpened,
  planStartPageOpen,
  type PortalStartPageRecord,
} from "../../src/portal-shell/start-pages";
import { adaptStartPageRow } from "../../src/portal-shell/use-portal-start-pages";
import { PortalShell } from "../../src/portal-shell/portal-shell";
import { TabsBar } from "../../src/portal-shell/tabs-bar/TabsBar";
import { Sidebar } from "../../src/portal-shell/sidebar/Sidebar";
import type { PortalShellMenuItem, PortalShellPageComponent } from "../../src/portal-shell/types";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

for (const name of ["localStorage", "sessionStorage"] as const) {
  if (typeof globalThis[name] !== "undefined") continue;
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

vi.mock("next-auth/react", () => ({ signOut: vi.fn(async () => undefined) }));

// ─────────────────────────────────────────────────────────── 순수 계산

describe("planStartPageOpen", () => {
  const allowed = new Set(["t:g/a", "t:g/b", "t:g/c"]);

  it("등록 순서를 지키고, 이미 열린 화면·홈·메뉴에 없는 화면·중복을 뺀다", () => {
    expect(
      planStartPageOpen({
        tabs: [{ pageId: "t:home" }, { pageId: "t:g/b" }],
        startPageIds: ["t:g/c", "t:g/b", "t:g/x", "t:home", "t:g/a", "t:g/c"],
        allowedPageIds: new Set([...allowed, "t:home"]),
        homePageId: "t:home",
      })
    ).toEqual(["t:g/c", "t:g/a"]);
  });

  it("목록이 비면 빈 배열", () => {
    expect(
      planStartPageOpen({ tabs: [], startPageIds: [], allowedPageIds: allowed, homePageId: null })
    ).toEqual([]);
  });
});

describe("getTabCloseTargets", () => {
  // 화면 순서: 홈, c, a, b (생성 순서와 무관하게 TabsBar 가 받은 순서)
  const tabs = [
    { id: "home", isHome: true },
    { id: "c", isHome: false },
    { id: "a", isHome: false },
    { id: "b", isHome: false },
  ];

  it("왼쪽·오른쪽은 보이는 순서의 비-홈 탭 기준이고 홈은 닫지 않는다", () => {
    expect(getTabCloseTargets(tabs, "a", "left")).toEqual(["c"]);
    expect(getTabCloseTargets(tabs, "a", "right")).toEqual(["b"]);
    expect(getTabCloseTargets(tabs, "c", "left")).toEqual([]);
    expect(getTabCloseTargets(tabs, "b", "right")).toEqual([]);
  });

  it("this·others·all", () => {
    expect(getTabCloseTargets(tabs, "a", "this")).toEqual(["a"]);
    expect(getTabCloseTargets(tabs, "a", "others")).toEqual(["c", "b"]);
    expect(getTabCloseTargets(tabs, "a", "all")).toEqual(["c", "a", "b"]);
  });

  it("기준 탭이 없으면 all 외에는 빈 배열", () => {
    expect(getTabCloseTargets(tabs, "zz", "left")).toEqual([]);
    expect(getTabCloseTargets(tabs, "zz", "others")).toEqual([]);
  });
});

describe("기본 화면 세션 표지", () => {
  it("열었음 표지는 storageKey 별로 남고 로그아웃 때 지운다", () => {
    const key = `flag-${Math.random()}`;
    expect(hasOpenedStartPages(key)).toBe(false);
    markStartPagesOpened(key);
    expect(hasOpenedStartPages(key)).toBe(true);
    expect(hasOpenedStartPages(`${key}-other`)).toBe(false);
    clearStartPagesOpened(key);
    expect(hasOpenedStartPages(key)).toBe(false);
  });
});

describe("adaptStartPageRow", () => {
  it("sysCd + componentPath 로 pageId 를 조립하고 메뉴명을 표시명으로 쓴다", () => {
    expect(
      adaptStartPageRow({
        sysCd: "mcm",
        componentPath: "csa/commUserMng",
        menuId: "M1",
        menuNm: "사용자 관리",
        startSeq: 2,
      })
    ).toEqual({
      pageId: "mcm:csa/commUserMng",
      menuId: "M1",
      displayText: "사용자 관리",
      sortOrder: 2,
    });
  });

  it("조립할 수 없는 행(메뉴가 사라져 sysCd 없음)은 버린다", () => {
    expect(adaptStartPageRow({ sysCd: null, componentPath: "csa/x", menuId: "M1" })).toBeNull();
    expect(adaptStartPageRow({ sysCd: "mcm", componentPath: "noslash" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────── TabsBar 컨텍스트 메뉴

const tab = (id: string, title: string, pageId: string, isHome = false) => ({
  id,
  title,
  pageId,
  isHome,
});

function openContextMenu(host: HTMLElement, tabId: string) {
  const el = host.querySelector<HTMLElement>(`[data-tab-id="${tabId}"]`);
  expect(el).not.toBeNull();
  act(() => {
    el!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    );
  });
}

const menuItem = (label: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".tab-context-menu .tab-context-menu-item")
  ).find((el) => el.textContent?.trim() === label);

describe("TabsBar 컨텍스트 메뉴", () => {
  const tabs = [
    tab("home", "홈", "t:home", true),
    tab("c", "C", "t:g/c"),
    tab("a", "A", "t:g/a"),
    tab("b", "B", "t:g/b"),
  ];

  it("탭·왼쪽·오른쪽·다른·모든 탭 닫기 항목이 있고, 닫을 탭이 없는 쪽은 disabled 다", () => {
    const onTabClose = vi.fn();
    const r = renderWithMantine(
      createElement(TabsBar, {
        tabs,
        activeTabId: "c",
        onTabClick: () => {},
        onTabClose,
        onGoHome: () => {},
      })
    );
    openContextMenu(r.host, "c");
    const labels = Array.from(
      document.querySelectorAll(".tab-context-menu .tab-context-menu-item")
    ).map((el) => el.textContent?.trim());
    expect(labels).toEqual([
      "탭 닫기",
      "왼쪽 탭 닫기",
      "오른쪽 탭 닫기",
      "다른 탭 닫기",
      "모든 탭 닫기",
    ]);
    expect(menuItem("왼쪽 탭 닫기")!.getAttribute("aria-disabled")).toBe("true");
    expect(menuItem("왼쪽 탭 닫기")!.classList.contains("is-disabled")).toBe(true);
    expect(menuItem("왼쪽 탭 닫기")!.classList.contains("tab-context-menu-item")).toBe(true);
    expect(menuItem("오른쪽 탭 닫기")!.getAttribute("aria-disabled")).toBeNull();
    expect(menuItem("오른쪽 탭 닫기")!.classList.contains("is-disabled")).toBe(false);
    // 콜백이 없으면 기본 화면 항목·구분선을 숨긴다.
    expect(document.querySelector(".tab-context-menu-separator")).toBeNull();

    act(() => menuItem("왼쪽 탭 닫기")!.click());
    expect(onTabClose).not.toHaveBeenCalled();
    r.unmount();
  });

  it("오른쪽 탭 닫기는 보이는 순서로 오른쪽만 닫고, 보던 탭이 닫히면 우클릭한 탭으로 옮긴다", () => {
    const onTabClose = vi.fn();
    const onTabClick = vi.fn();
    const r = renderWithMantine(
      createElement(TabsBar, { tabs, activeTabId: "b", onTabClick, onTabClose, onGoHome: () => {} })
    );
    openContextMenu(r.host, "c");
    act(() => menuItem("오른쪽 탭 닫기")!.click());
    expect(onTabClose.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
    expect(onTabClick).toHaveBeenCalledWith("c");
    expect(document.querySelector(".tab-context-menu")).toBeNull();
    r.unmount();
  });

  it("왼쪽 탭 닫기 — 보던 탭이 남으면 활성 탭을 바꾸지 않는다", () => {
    const onTabClose = vi.fn();
    const onTabClick = vi.fn();
    const r = renderWithMantine(
      createElement(TabsBar, { tabs, activeTabId: "b", onTabClick, onTabClose, onGoHome: () => {} })
    );
    openContextMenu(r.host, "b");
    act(() => menuItem("왼쪽 탭 닫기")!.click());
    expect(onTabClose.mock.calls.map((c) => c[0])).toEqual(["c", "a"]);
    expect(onTabClick).not.toHaveBeenCalled();
    r.unmount();
  });

  it("모든 탭 닫기는 홈을 빼고 다 닫고 홈으로 간다", () => {
    const onTabClose = vi.fn();
    const onGoHome = vi.fn();
    const r = renderWithMantine(
      createElement(TabsBar, { tabs, activeTabId: "a", onTabClick: () => {}, onTabClose, onGoHome })
    );
    openContextMenu(r.host, "a");
    act(() => menuItem("모든 탭 닫기")!.click());
    expect(onTabClose.mock.calls.map((c) => c[0])).toEqual(["c", "a", "b"]);
    expect(onGoHome).toHaveBeenCalled();
    r.unmount();
  });

  it("기본 화면 등록/해제는 활성 탭이 아니라 우클릭한 탭 기준이고 라벨이 등록 여부를 따른다", () => {
    const onToggleStartPage = vi.fn();
    const r = renderWithMantine(
      createElement(TabsBar, {
        tabs,
        activeTabId: "c",
        onTabClick: () => {},
        onTabClose: () => {},
        onGoHome: () => {},
        startPageIds: new Set(["t:g/a"]),
        onToggleStartPage,
      })
    );
    openContextMenu(r.host, "a");
    expect(document.querySelector(".tab-context-menu-separator")).not.toBeNull();
    act(() => menuItem("기본 화면 해제")!.click());
    expect(onToggleStartPage).toHaveBeenLastCalledWith("t:g/a");

    openContextMenu(r.host, "b");
    act(() => menuItem("기본 화면 등록")!.click());
    expect(onToggleStartPage).toHaveBeenLastCalledWith("t:g/b");
    r.unmount();
  });

  it("메뉴에 없는 화면은 등록 항목이 disabled 이고 눌러도 부르지 않는다", () => {
    const onToggleStartPage = vi.fn();
    const r = renderWithMantine(
      createElement(TabsBar, {
        tabs,
        activeTabId: "c",
        onTabClick: () => {},
        onTabClose: () => {},
        onGoHome: () => {},
        startPageIds: new Set<string>(),
        onToggleStartPage,
        canRegisterStartPage: (pageId: string) => pageId !== "t:g/b",
      })
    );
    openContextMenu(r.host, "b");
    const item = menuItem("기본 화면 등록")!;
    expect(item.getAttribute("aria-disabled")).toBe("true");
    expect(item.classList.contains("is-disabled")).toBe(true);
    act(() => item.click());
    expect(onToggleStartPage).not.toHaveBeenCalled();
    r.unmount();
  });
});

// ─────────────────────────────────────────────────────────── Sidebar '기본 화면' 칸

describe("Sidebar 기본 화면 칸", () => {
  const baseProps = {
    appName: "T",
    menuItems: [] as PortalShellMenuItem[],
    favoriteFolders: [],
    isExpanded: true,
    onExpandedChange: () => {},
    activePageId: null,
    onMenuItemClick: () => {},
  };

  it("startPages 를 받으면 3칸이고, 목록 클릭은 탭 열기·해제 버튼은 해제를 부른다", () => {
    const onMenuItemClick = vi.fn();
    const onRemoveStartPage = vi.fn();
    const onNavigationViewModeChange = vi.fn();
    const r = renderWithMantine(
      createElement(Sidebar, {
        ...baseProps,
        navigationViewMode: "startup",
        onNavigationViewModeChange,
        onMenuItemClick,
        startPages: [
          { pageId: "t:g/c", displayText: "C 화면" },
          { pageId: "t:g/a", displayText: "A 화면" },
        ],
        onRemoveStartPage,
      })
    );
    const radios = Array.from(r.host.querySelectorAll<HTMLInputElement>("input[type=radio]")).map(
      (i) => i.value
    );
    expect(radios).toEqual(["menu", "favorites", "startup"]);

    const rows = Array.from(r.host.querySelectorAll<HTMLElement>(".start-pages-list .tree-item"));
    expect(rows.map((el) => el.querySelector(".item-name")?.textContent)).toEqual([
      "C 화면",
      "A 화면",
    ]);
    act(() => rows[1].click());
    expect(onMenuItemClick).toHaveBeenCalledWith("t:g/a");
    act(() => rows[0].querySelector<HTMLElement>(".fav-delete-btn")!.click());
    expect(onRemoveStartPage).toHaveBeenCalledWith("t:g/c");
    expect(onMenuItemClick).toHaveBeenCalledTimes(1);
    r.unmount();
  });

  it("목록이 비면 등록 안내를 보이고, startPages 를 안 받으면 2칸 그대로다", () => {
    const r = renderWithMantine(
      createElement(Sidebar, {
        ...baseProps,
        navigationViewMode: "startup",
        onNavigationViewModeChange: () => {},
        startPages: [],
      })
    );
    expect(r.host.querySelector(".start-pages-list .no-results")?.textContent).toContain("우클릭");
    r.unmount();

    const r2 = renderWithMantine(
      createElement(Sidebar, {
        ...baseProps,
        navigationViewMode: "menu",
        onNavigationViewModeChange: () => {},
      })
    );
    const radios = Array.from(r2.host.querySelectorAll<HTMLInputElement>("input[type=radio]")).map(
      (i) => i.value
    );
    expect(radios).toEqual(["menu", "favorites"]);
    r2.unmount();
  });
});

// ─────────────────────────────────────────────────────────── PortalShell 기동 시 자동 열기

const Page: PortalShellPageComponent = () => createElement("div", null, "page");

function pageNode(id: string, text: string): PortalShellMenuItem {
  return {
    id,
    name: id,
    displayText: text,
    type: "page",
    items: [],
    parentId: "g",
    expended: null,
    path: "/",
    moduleId: "t",
    pageName: id,
    componentPath: `g/${id}`,
  };
}

const MENU = {
  items: [
    {
      id: "g",
      name: "g",
      displayText: "그룹",
      type: "dir" as const,
      items: [pageNode("a", "A 화면"), pageNode("b", "B 화면"), pageNode("c", "C 화면")],
      parentId: null,
      expended: null,
      path: "/",
      moduleId: "t",
      pageName: null,
    },
  ],
};

const record = (pageId: string, displayText: string, sortOrder: number): PortalStartPageRecord => ({
  pageId,
  menuId: pageId,
  displayText,
  sortOrder,
});

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

const order = () =>
  [...document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]")].map((el) =>
    (el.querySelector(".tab-title")?.textContent ?? "").trim()
  );
const active = () =>
  (
    document.querySelector(".tabs-scroll-area .tab-item.active .tab-title")?.textContent ?? ""
  ).trim();
const homeActive = () => document.querySelector(".home-tab.active") !== null;

describe("PortalShell 기본 화면 자동 열기", () => {
  let rendered: Rendered | null = null;
  let storageKey = "";

  const shell = (props: Partial<Parameters<typeof PortalShell>[0]> = {}) =>
    createElement(PortalShell, {
      appName: "TEST",
      menu: MENU,
      resolvePage: async () => Page,
      homePageId: "t:home",
      storageKey,
      ...props,
    });

  beforeEach(() => {
    storageKey = `portal-start-${Math.random()}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 })
      )
    );
  });

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("복원된 탭이 없으면 등록 순서대로 맨 끝에 열고 첫 기본 화면을 보여 준다(메뉴에 없는 화면 제외)", async () => {
    rendered = renderWithMantine(
      shell({
        startPages: [
          record("t:g/c", "C", 1),
          record("t:g/zz", "없는 화면", 2),
          record("t:g/a", "A", 3),
        ],
      })
    );
    await flush();
    expect(order()).toEqual(["C 화면", "A 화면"]);
    expect(active()).toBe("C 화면");
  });

  it("복원된 탭이 있으면 그 뒤에 덧붙이고 활성 탭은 그대로 둔다. 이미 열린 화면은 다시 열지 않는다", async () => {
    // 1차 기동: 아무 기본 화면 없이 b·a 를 열어 둔다(저장소에 남는다).
    rendered = renderWithMantine(shell({ startPages: [] }));
    await flush();
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: "t:g/b" } }));
    });
    await flush();
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: "t:g/a" } }));
    });
    await flush();
    expect(order()).toEqual(["B 화면", "A 화면"]);
    rendered.unmount();
    rendered = null;
    // 다음 시작(새 세션): 세션 표지를 지우고 다시 띄운다.
    clearStartPagesOpened(storageKey);

    rendered = renderWithMantine(
      shell({ startPages: [record("t:g/c", "C", 1), record("t:g/a", "A", 2)] })
    );
    await flush();
    expect(order()).toEqual(["B 화면", "A 화면", "C 화면"]);
    expect(active()).toBe("A 화면");
  });

  it("같은 세션의 재마운트·목록 재조회 때는 사용자가 닫은 기본 화면을 다시 열지 않는다", async () => {
    const startPages = [record("t:g/c", "C", 1), record("t:g/a", "A", 2)];
    rendered = renderWithMantine(shell({ startPages }));
    await flush();
    expect(order()).toEqual(["C 화면", "A 화면"]);

    // C 를 닫는다.
    const closeC = document.querySelector<HTMLElement>(
      '.tabs-scroll-area [data-tab-id] .tab-close[aria-label="C 화면 탭 닫기"]'
    );
    act(() => closeC!.click());
    await flush();
    expect(order()).toEqual(["A 화면"]);

    // 재조회(새 배열) — 같은 마운트에서는 다시 열지 않는다.
    rerender(rendered, shell({ startPages: [...startPages, record("t:g/b", "B", 3)] }));
    await flush();
    expect(order()).toEqual(["A 화면"]);

    // 재마운트(같은 세션) — 세션 표지로 막는다.
    rendered.unmount();
    rendered = renderWithMantine(shell({ startPages }));
    await flush();
    expect(order()).toEqual(["A 화면"]);
  });

  it("목록 조회가 끝나기 전에는 열지 않고, 끝난 뒤 한 번 연다", async () => {
    rendered = renderWithMantine(shell({ startPages: [], isStartPagesLoaded: false }));
    await flush();
    expect(order()).toEqual([]);
    expect(homeActive()).toBe(true);

    rendered.unmount();
    rendered = renderWithMantine(
      shell({ startPages: [record("t:g/b", "B", 1)], isStartPagesLoaded: true })
    );
    await flush();
    expect(order()).toEqual(["B 화면"]);
    expect(active()).toBe("B 화면");
  });

  it("목록을 기다리는 사이 사용자가 연 탭은 활성 상태를 뺏기지 않는다", async () => {
    rendered = renderWithMantine(shell({ startPages: [], isStartPagesLoaded: false }));
    await flush();
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: "t:g/b" } }));
    });
    await flush();
    rerender(rendered, shell({ startPages: [record("t:g/c", "C", 1), record("t:g/a", "A", 2)] }));
    await flush();
    expect(order()).toEqual(["B 화면", "C 화면", "A 화면"]);
    expect(active()).toBe("B 화면");
  });
});

describe("PortalShell 탭 컨텍스트 메뉴 묶어 닫기", () => {
  let rendered: Rendered | null = null;

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 })
      )
    );
  });

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function open(pageId: string) {
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
    });
    await flush();
  }

  const tabIdOf = (title: string) =>
    [...document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]")]
      .find((el) => el.querySelector(".tab-title")?.textContent?.trim() === title)
      ?.getAttribute("data-tab-id") ?? "";

  it("오른쪽 탭 닫기로 보던 탭이 닫히면 우클릭한 탭이 활성화되고, 모든 탭 닫기는 홈으로 간다", async () => {
    rendered = renderWithMantine(
      createElement(PortalShell, {
        appName: "TEST",
        menu: MENU,
        resolvePage: async () => Page,
        homePageId: "t:home",
        storageKey: `portal-bulk-close-${Math.random()}`,
      })
    );
    await flush();
    await open("t:g/a");
    await open("t:g/b");
    await open("t:g/c");
    expect(order()).toEqual(["A 화면", "B 화면", "C 화면"]);
    expect(active()).toBe("C 화면");

    openContextMenu(rendered.host, tabIdOf("A 화면"));
    act(() => menuItem("오른쪽 탭 닫기")!.click());
    await flush();
    expect(order()).toEqual(["A 화면"]);
    expect(active()).toBe("A 화면");

    await open("t:g/b");
    openContextMenu(rendered.host, tabIdOf("A 화면"));
    act(() => menuItem("모든 탭 닫기")!.click());
    await flush();
    expect(order()).toEqual([]);
    expect(homeActive()).toBe(true);
  });
});
