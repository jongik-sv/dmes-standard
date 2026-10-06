/** @vitest-environment happy-dom */
/**
 * usePortalTabs.duplicateTab · 같은 화면 열기 규칙 — 탭 우클릭 '새 탭으로 하나 더 열기'(2026-10-06).
 *  - 같은 화면 탭을 원래 탭 바로 오른쪽에 하나 더 열고 snapshot 을 복사한다. 홈은 안 한다.
 *  - 같은 화면 탭이 여럿일 때 그 화면을 열면, 보고 있는 탭이 그 화면이면 머물고 아니면 표시 순서상 첫 탭으로 간다.
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortalShellPageComponent } from "../../src/portal-shell/types";
import { usePortalTabs } from "../../src/portal-shell/use-portal-tabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

type Tabs = ReturnType<typeof usePortalTabs>;

const Page: PortalShellPageComponent = () => createElement("div", null, "page");

// 훅 파라미터 중 참조가 안정적이어야 하는 것(resolvePage·resolveDisplayText 등)은 모듈 상수로 둔다.
const resolvePage = async () => Page;
const resolveDisplayText = (_pageId: string, fallback: string) => fallback;
const rememberRecentMenuPage = () => {};
const noLeaves: never[] = [];
const noSearch = new Map<string, unknown>();
const loggingOutRef = { current: false };

const HOME_PAGE_ID = "t:home";
const HOME_TAB_ID = "home:t:home";

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

describe("usePortalTabs — duplicateTab · 같은 화면 열기", () => {
  let host: HTMLDivElement;
  let root: Root | null;
  let latest: Tabs;
  let storageKey: string;

  function Probe() {
    latest = usePortalTabs({
      storageKey,
      resolvedHomePageId: HOME_PAGE_ID,
      homeTabId: HOME_TAB_ID,
      resolvePage,
      resolveDisplayText,
      menuLeaves: noLeaves,
      menuSearchItemByPageId: noSearch,
      isStartPagesLoaded: true,
      rememberRecentMenuPage,
      loggingOutRef,
    });
    return null;
  }

  async function mount() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(createElement(Probe)));
    await flush();
  }

  async function unmount() {
    await act(async () => root?.unmount());
    root = null;
    host.remove();
  }

  async function openTab(pageId: string) {
    await act(async () => {
      window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId } }));
    });
    await flush();
  }

  async function duplicate(tabId: string) {
    await act(async () => latest.duplicateTab(tabId));
    await flush();
  }

  const pageIds = () => latest.orderedTabs.map((tab) => tab.pageId);
  const idsOf = (pageId: string) =>
    latest.orderedTabs.filter((tab) => tab.pageId === pageId).map((tab) => tab.id);

  beforeEach(async () => {
    storageKey = `portal-shell-duplicate-tab-${Math.random()}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 })
      )
    );
    await mount();
  });

  afterEach(async () => {
    if (root) await unmount();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("a 탭을 하나 더 열면 원래 탭 바로 오른쪽에 새 탭이 생기고 그 탭이 활성이다", async () => {
    await openTab("t:a");
    const aId = idsOf("t:a")[0];
    await openTab("t:b");

    await duplicate(aId);

    expect(pageIds()).toEqual(["t:home", "t:a", "t:a", "t:b"]);
    const [first, second] = idsOf("t:a");
    expect(first).toBe(aId);
    expect(second).not.toBe(aId);
    expect(latest.activeTabId).toBe(second);
  });

  it("snapshot 은 복사된다(값은 같고 다른 객체)", async () => {
    await openTab("t:a");
    const aId = idsOf("t:a")[0];
    await act(async () => latest.onTabSnapshotChange(aId, { q: 1 }));
    await flush();

    await duplicate(aId);

    const [original, created] = idsOf("t:a").map((id) => latest.tabs.find((tab) => tab.id === id)!);
    expect(created.snapshot).toEqual({ q: 1 });
    expect(created.snapshot).not.toBe(original.snapshot);
  });

  it("같은 화면 탭이 여럿이면 보던 탭이 그 화면일 때 머물고, 아니면 순서상 첫 탭으로 간다", async () => {
    await openTab("t:a");
    const a1 = idsOf("t:a")[0];
    await duplicate(a1);
    const a2 = idsOf("t:a")[1];
    await openTab("t:b");
    expect(pageIds()).toEqual(["t:home", "t:a", "t:a", "t:b"]);

    // a2 로 옮겨 가 있을 때 t:a 를 열면 a2 에 머문다.
    await act(async () => latest.setActiveTabId(a2));
    await flush();
    await openTab("t:a");
    expect(latest.activeTabId).toBe(a2);

    // b 를 보고 있을 때 t:a 를 열면 순서상 첫 a1 로 간다.
    await act(async () => latest.setActiveTabId(idsOf("t:b")[0]));
    await flush();
    await openTab("t:a");
    expect(latest.activeTabId).toBe(a1);
    expect(pageIds()).toEqual(["t:home", "t:a", "t:a", "t:b"]); // 새 탭을 만들지 않는다
  });

  it("중복 탭 두 개가 저장·복원된다", async () => {
    await openTab("t:a");
    const a1 = idsOf("t:a")[0];
    await duplicate(a1);
    const a2 = idsOf("t:a")[1];
    expect(idsOf("t:a")).toEqual([a1, a2]);

    await unmount();
    await mount();

    expect(idsOf("t:a")).toEqual([a1, a2]);
  });

  it("홈 탭에는 아무 일도 하지 않는다", async () => {
    await openTab("t:a");
    const tabsBefore = latest.tabs;
    const activeBefore = latest.activeTabId;

    await duplicate(HOME_TAB_ID);

    expect(latest.tabs).toBe(tabsBefore);
    expect(pageIds()).toEqual(["t:home", "t:a"]);
    expect(latest.activeTabId).toBe(activeBefore);
  });
});
