/** @vitest-environment happy-dom */
/**
 * 탭 우클릭 '새 창으로 분리'·'새 탭으로 하나 더 열기'(2026-10-06) — popout·allowDuplicateTabs prop 이 있을 때만 항목이 생긴다.
 * 분리는 window.open 이 열리면 탭을 닫고, 차단되면 탭을 두고 onBlocked 로 알린다. 로그아웃은 셸이 연 분리 창을 닫는다.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell, type PortalShellProps } from "../../src/portal-shell/portal-shell";
import { PortalPageWindow } from "../../src/portal-shell/page-window/PortalPageWindow";
import { useCarryRefetch, useCarryState } from "../../src/portal-shell/carry-state";
import { clearPopoutHandoffs, POPOUT_CARRY_GLOBAL, takePopoutHandoff, type PortalPopoutHandoff } from "../../src/portal-shell/popout";
import type { PortalShellMenuItem, PortalShellPageComponent } from "../../src/portal-shell/types";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";

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

// 셸의 탭 등록소 지도와 셸 렌더 수를 밖에서 보려고 원래 구현을 감싼다(동작은 그대로).
const spy = vi.hoisted(() => ({ maps: [] as Array<{ size: number }>, shellRenders: 0 }));
vi.mock("../../src/portal-shell/carry-state", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/portal-shell/carry-state")>();
  return {
    ...mod,
    createCarryRegistryMap: () => {
      const map = mod.createCarryRegistryMap();
      spy.maps.push(map);
      return map;
    },
  };
});
vi.mock("../../src/portal-shell/use-portal-tabs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../src/portal-shell/use-portal-tabs")>();
  return {
    ...mod,
    // PortalShell 은 렌더마다 이 훅을 한 번 부른다 — 호출 수가 셸 렌더 수다.
    usePortalTabs: ((...args: Parameters<typeof mod.usePortalTabs>) => {
      spy.shellRenders += 1;
      return mod.usePortalTabs(...args);
    }) as typeof mod.usePortalTabs,
  };
});

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

// t:g/a·t:g/b 만 메뉴에 있다. t:g/zzz 는 메뉴에 없는 화면이다.
const MENU = {
  items: [
    {
      id: "g",
      name: "g",
      displayText: "그룹",
      type: "dir" as const,
      items: [pageNode("a", "A"), pageNode("b", "B")],
      parentId: null,
      expended: null,
      path: "/",
      moduleId: "t",
      pageName: null,
    },
  ],
};

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

async function openTab(pageId: string) {
  await act(async () => {
    window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
  });
  await flush();
}

const order = () =>
  Array.from(document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]")).map((el) =>
    (el.querySelector(".tab-title")?.textContent ?? "").trim()
  );
const active = () =>
  (
    document.querySelector(".tabs-scroll-area .tab-item.active .tab-title")?.textContent ?? ""
  ).trim();

function openContextMenuOf(el: HTMLElement | null) {
  expect(el).not.toBeNull();
  act(() => {
    el!.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })
    );
  });
}
/** 탭 제목으로 우클릭. */
function openContextMenu(title: string) {
  const el = Array.from(
    document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]")
  ).find((tab) => tab.querySelector(".tab-title")?.textContent?.trim() === title);
  openContextMenuOf(el ?? null);
}
const contextItem = (label: string) =>
  Array.from(
    document.querySelectorAll<HTMLElement>(".tab-context-menu .tab-context-menu-item")
  ).find((el) => el.textContent?.trim() === label);

const POPOUT_LABEL = "새 창으로 분리";
const DUPLICATE_LABEL = "새 탭으로 하나 더 열기";

function popoutKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key?.startsWith("oasis.portal.popout.")) keys.push(key);
  }
  return keys;
}

describe("PortalShell 탭 분리·하나 더 열기", () => {
  let rendered: Rendered | null = null;
  let storageKey = "";

  function shell(props: Partial<PortalShellProps> = {}) {
    return createElement(PortalShell, {
      appName: "TEST",
      menu: MENU,
      resolvePage: async () => Page,
      homePageId: "t:home",
      storageKey,
      ...props,
    });
  }

  beforeEach(() => {
    storageKey = `portal-shell-popout-${Math.random()}`;
    spy.maps.length = 0;
    spy.shellRenders = 0;
    localStorage.clear(); // 앞 시험이 분리 성공으로 남긴 handoff 키를 지운다
    clearPopoutHandoffs(); // opener 메모리 보관소도 비운다
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

  it("popout·allowDuplicateTabs 가 없으면 우클릭 메뉴에 두 항목이 없다", async () => {
    rendered = renderWithMantine(shell());
    await flush();
    await openTab("t:g/a");
    openContextMenu("A");
    expect(contextItem("탭 닫기")).toBeDefined();
    expect(contextItem(POPOUT_LABEL)).toBeUndefined();
    expect(contextItem(DUPLICATE_LABEL)).toBeUndefined();
  });

  it("allowDuplicateTabs 면 '새 탭으로 하나 더 열기' 로 같은 화면 탭이 번호가 붙어 생기고 그 탭이 활성이다", async () => {
    rendered = renderWithMantine(shell({ allowDuplicateTabs: true }));
    await flush();
    await openTab("t:g/a");
    openContextMenu("A");
    expect(contextItem(POPOUT_LABEL)).toBeUndefined(); // popout 은 따로 켠다
    await act(async () => contextItem(DUPLICATE_LABEL)!.click());
    await flush();
    expect(order()).toEqual(["A", "A (2)"]);
    expect(active()).toBe("A (2)");
  });

  it("'새 창으로 분리' 는 window.open 이 열리면 탭을 닫고 onBlocked 를 부르지 않는다", async () => {
    const fakeWin = { close: vi.fn() } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(fakeWin);
    const onBlocked = vi.fn();
    rendered = renderWithMantine(
      shell({ popout: { buildUrl: (_p, t) => `/popup/x?h=${t}`, onBlocked } })
    );
    await flush();
    await openTab("t:g/a");
    expect(order()).toEqual(["A"]);
    openContextMenu("A");
    expect(contextItem(DUPLICATE_LABEL)).toBeUndefined(); // allowDuplicateTabs 는 따로 켠다
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    expect(order()).toEqual([]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(onBlocked).not.toHaveBeenCalled();
  });

  it("팝업이 차단되면(window.open → null) 탭이 남고 onBlocked 가 한 번 불리며 handoff 키가 남지 않는다", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const onBlocked = vi.fn();
    rendered = renderWithMantine(
      shell({ popout: { buildUrl: (_p, t) => `/popup/x?h=${t}`, onBlocked } })
    );
    await flush();
    await openTab("t:g/a");
    openContextMenu("A");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    expect(order()).toEqual(["A"]);
    expect(open).toHaveBeenCalledTimes(1);
    expect(onBlocked).toHaveBeenCalledTimes(1);
    expect(popoutKeys()).toEqual([]);
  });

  it("window.open 이 던지면 탭이 남고 onError 가 한 번, onBlocked 는 부르지 않으며 console.error 를 남긴다", async () => {
    const boom = new Error("open boom");
    vi.spyOn(window, "open").mockImplementation(() => {
      throw boom;
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onBlocked = vi.fn();
    const onError = vi.fn();
    rendered = renderWithMantine(
      shell({ popout: { buildUrl: (_p, t) => `/popup/x?h=${t}`, onBlocked, onError } })
    );
    await flush();
    await openTab("t:g/a");
    openContextMenu("A");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    expect(order()).toEqual(["A"]);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(boom);
    expect(onBlocked).not.toHaveBeenCalled();
    expect(popoutKeys()).toEqual([]);
    expect(consoleError).toHaveBeenCalledWith("[PortalShell] popout failed", "t:g/a", boom);
  });

  it("onError 가 없어도 window.open 예외가 밖으로 나오지 않고 탭이 남는다", async () => {
    vi.spyOn(window, "open").mockImplementation(() => {
      throw new Error("open boom");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    rendered = renderWithMantine(shell({ popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` } }));
    await flush();
    await openTab("t:g/a");
    openContextMenu("A");
    expect(() => act(() => contextItem(POPOUT_LABEL)!.click())).not.toThrow();
    await flush();
    expect(order()).toEqual(["A"]);
  });

  it("메뉴에 없는 화면 탭은 '새 창으로 분리' 가 is-disabled 다", async () => {
    rendered = renderWithMantine(
      shell({ popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` } })
    );
    await flush();
    await openTab("t:g/zzz");
    openContextMenu("t:g/zzz");
    expect(contextItem(POPOUT_LABEL)?.classList.contains("is-disabled")).toBe(true);
  });

  it("홈 탭 우클릭에는 두 항목이 없다", async () => {
    rendered = renderWithMantine(
      shell({
        popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` },
        allowDuplicateTabs: true,
      })
    );
    await flush();
    openContextMenuOf(document.querySelector<HTMLElement>(".home-tab"));
    expect(contextItem("탭 닫기")).toBeDefined();
    expect(contextItem(POPOUT_LABEL)).toBeUndefined();
    expect(contextItem(DUPLICATE_LABEL)).toBeUndefined();
  });

  it("로그아웃하면 셸이 연 분리 창을 닫는다", async () => {
    const fakeWin = { close: vi.fn() } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(fakeWin);
    rendered = renderWithMantine(
      shell({
        popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` },
        onBeforeLogout: (go) => go(),
      })
    );
    await flush();
    await openTab("t:g/a");
    openContextMenu("A");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    expect(fakeWin.close).not.toHaveBeenCalled();

    act(() => document.querySelector<HTMLElement>(".portal-header__user-button")!.click());
    const logout = [...document.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.textContent?.trim() === "로그아웃" && el.children.length === 0
    );
    expect(logout).toBeDefined();
    await act(async () => logout!.click());
    expect(fakeWin.close).toHaveBeenCalledTimes(1);
  });

  it("로그아웃하면 새 창이 아직 가져가지 않은 handoff 키가 지워진다", async () => {
    vi.spyOn(window, "open").mockReturnValue({ close: vi.fn() } as unknown as Window);
    rendered = renderWithMantine(
      shell({
        popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` },
        onBeforeLogout: (go) => go(),
      })
    );
    await flush();
    await openTab("t:g/a");
    openContextMenu("A");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    expect(popoutKeys()).toHaveLength(1);

    act(() => document.querySelector<HTMLElement>(".portal-header__user-button")!.click());
    const logout = [...document.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.textContent?.trim() === "로그아웃" && el.children.length === 0
    );
    expect(logout).toBeDefined();
    await act(async () => logout!.click());
    expect(popoutKeys()).toEqual([]);
  });

  // ── 화면 상태 이어받기(carry-state) ───────────────────────────────────────────────

  /** t:g/a 는 useCarryState 를 쓰는 화면, t:g/b 는 쓰지 않는 화면이다. */
  const carryApi: {
    setFilters?: (v: { q: string }) => void;
    setRows?: (v: number[]) => void;
    refetch: ReturnType<typeof vi.fn>;
  } = { refetch: vi.fn() };
  const CarryPage: PortalShellPageComponent = () => {
    const [filters, setFilters] = useCarryState("filters", { q: "" });
    const [rows, setRows] = useCarryState<number[]>("rows", [], { bulky: true });
    useCarryRefetch(() => carryApi.refetch());
    carryApi.setFilters = setFilters;
    carryApi.setRows = setRows;
    return createElement("div", { "data-testid": "carry-screen", "data-q": filters.q, "data-rows": rows.join(",") });
  };
  const resolveCarry = async (pageId: string) => (pageId === "t:g/a" ? CarryPage : Page);
  const bridge = () =>
    (window as unknown as Record<string, { take: (token: string) => { light: unknown; bulky: unknown } | null } | undefined>)[
      POPOUT_CARRY_GLOBAL
    ];
  const tokenOf = (open: { mock: { calls: unknown[][] } }) => String(open.mock.calls[0][1]).replace("dmes-popout-", "");
  const screenData = () => {
    const el = document.querySelector('[data-testid="carry-screen"]');
    return { q: el?.getAttribute("data-q"), rows: el?.getAttribute("data-rows") };
  };

  async function popoutCarryTab() {
    const open = vi.spyOn(window, "open").mockReturnValue({ close: vi.fn() } as unknown as Window);
    rendered = renderWithMantine(shell({ resolvePage: resolveCarry, popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` } }));
    await flush();
    await openTab("t:g/a");
    await act(async () => {
      carryApi.setFilters?.({ q: "조건" });
      carryApi.setRows?.([1, 2, 3]);
    });
    openContextMenu("A");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    return open;
  }

  it("화면이 useCarryState 를 쓰면 분리 때 값이 모여 opener 보관소(light+bulky)와 handoff(light)로 간다", async () => {
    const open = await popoutCarryTab();
    expect(order()).toEqual([]);
    expect(open).toHaveBeenCalledTimes(1);
    const token = tokenOf(open);
    const handoff = takePopoutHandoff(token);
    expect(handoff?.carry).toEqual({ light: { filters: { q: "조건" } }, hadBulky: true });
    expect(bridge()!.take(token)).toEqual({ pageId: "t:g/a", light: { filters: { q: "조건" } }, bulky: { rows: [1, 2, 3] } });
  });

  it("훅을 쓰지 않는 탭은 handoff 에 carry 가 없고 보관소에도 넣지 않는다", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({ close: vi.fn() } as unknown as Window);
    rendered = renderWithMantine(shell({ resolvePage: resolveCarry, popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` } }));
    await flush();
    await openTab("t:g/b");
    openContextMenu("B");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    const token = tokenOf(open);
    const handoff = takePopoutHandoff(token) as PortalPopoutHandoff;
    expect(handoff.pageId).toBe("t:g/b");
    expect("carry" in handoff).toBe(false);
    expect(bridge()?.take(token) ?? null).toBeNull();
  });

  it("팝업이 차단되면 보관소에 값이 남지 않는다", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    rendered = renderWithMantine(shell({ resolvePage: resolveCarry, popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` } }));
    await flush();
    await openTab("t:g/a");
    await act(async () => carryApi.setFilters?.({ q: "조건" }));
    openContextMenu("A");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    expect(order()).toEqual(["A"]);
    expect(bridge()?.take(tokenOf(open)) ?? null).toBeNull();
  });

  it("왕복 고정: 셸 탭 화면의 상태 → 분리 → 같은 화면을 PortalPageWindow 로 그리면 초기값이 같고 재조회하지 않는다", async () => {
    carryApi.refetch.mockClear();
    const open = await popoutCarryTab();
    const token = tokenOf(open);
    const before = { q: "조건", rows: "1,2,3" };
    // 분리 뒤 셸의 탭은 닫혔으므로 화면 하나만 남는다 — 새 창 쪽을 그려 비교한다.
    expect(document.querySelector('[data-testid="carry-screen"]')).toBeNull();
    carryApi.refetch.mockClear();
    const popupWindow = renderWithMantine(
      createElement(PortalPageWindow, {
        pageId: "t:g/a",
        menu: MENU,
        appName: "TEST",
        resolvePage: resolveCarry,
        handoffToken: token,
        opener: window, // 같은 문서의 창 전역 보관소를 opener 의 것으로 쓴다
      })
    );
    try {
      await flush();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(screenData()).toEqual(before);
      expect(carryApi.refetch).not.toHaveBeenCalled();
    } finally {
      popupWindow.unmount();
    }
  });

  it("보조 경로 왕복: 셸 탭 상태 → 분리 → opener 없는 PortalPageWindow 에서 light 로 복원되고 행은 재조회 1회", async () => {
    carryApi.refetch.mockClear();
    const open = await popoutCarryTab();
    const token = tokenOf(open);
    carryApi.refetch.mockClear();
    const popupWindow = renderWithMantine(
      createElement(PortalPageWindow, {
        pageId: "t:g/a",
        menu: MENU,
        appName: "TEST",
        resolvePage: resolveCarry,
        handoffToken: token,
        opener: null, // opener 를 못 쓰는 경우 — handoff 의 light 만 온다
      })
    );
    try {
      await flush();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      // 조건(light)은 이어받고 행(bulky)은 오지 않았으니 비어 있다. 원래 행이 있었으므로 재조회를 한 번 부른다.
      expect(screenData()).toEqual({ q: "조건", rows: "" });
      expect(carryApi.refetch).toHaveBeenCalledTimes(1);
    } finally {
      popupWindow.unmount();
    }
  });

  it("조회하지 않은 탭(rows 빈 배열)을 분리해 opener 없이 열면 재조회하지 않는다", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue({ close: vi.fn() } as unknown as Window);
    rendered = renderWithMantine(shell({ resolvePage: resolveCarry, popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` } }));
    await flush();
    await openTab("t:g/a");
    await act(async () => carryApi.setFilters?.({ q: "조건만" })); // rows 는 빈 배열 그대로
    openContextMenu("A");
    act(() => contextItem(POPOUT_LABEL)!.click());
    await flush();
    const token = tokenOf(open);
    carryApi.refetch.mockClear();
    const popupWindow = renderWithMantine(
      createElement(PortalPageWindow, {
        pageId: "t:g/a",
        menu: MENU,
        appName: "TEST",
        resolvePage: resolveCarry,
        handoffToken: token,
        opener: null,
      })
    );
    try {
      await flush();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      expect(screenData()).toEqual({ q: "조건만", rows: "" });
      expect(carryApi.refetch).not.toHaveBeenCalled();
    } finally {
      popupWindow.unmount();
    }
  });

  it("탭을 닫으면 그 탭의 등록소가 지워진다", async () => {
    rendered = renderWithMantine(shell({ resolvePage: resolveCarry, popout: { buildUrl: (_p, t) => `/popup/x?h=${t}` } }));
    await flush();
    const map = spy.maps[spy.maps.length - 1];
    const baseline = map.size;
    await openTab("t:g/a");
    await openTab("t:g/b");
    expect(map.size).toBe(baseline + 2);
    openContextMenu("A");
    await act(async () => contextItem("탭 닫기")!.click());
    await flush();
    expect(order()).toEqual(["B"]);
    expect(map.size).toBe(baseline + 1);
  });

  it("탭 화면이 useCarryState 로 상태를 바꿔도 셸(PortalShell)의 렌더 수는 늘지 않는다", async () => {
    rendered = renderWithMantine(shell({ resolvePage: resolveCarry }));
    await flush();
    await openTab("t:g/a");
    await flush();
    const before = spy.shellRenders;
    expect(before).toBeGreaterThan(0);
    await act(async () => {
      carryApi.setFilters?.({ q: "하나" });
      carryApi.setRows?.([1, 2, 3]);
    });
    await act(async () => {
      carryApi.setFilters?.({ q: "둘" });
      carryApi.setRows?.([4]);
    });
    expect(screenData()).toEqual({ q: "둘", rows: "4" }); // 화면은 다시 그려졌고
    expect(spy.shellRenders).toBe(before); // 셸은 그대로다
  });
});
