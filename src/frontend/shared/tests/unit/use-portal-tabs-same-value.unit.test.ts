/** @vitest-environment happy-dom */
/**
 * usePortalTabs — 값이 그대로면 셸 상태 참조도 그대로다(Screen-Performance-Guide K1·K2).
 *  - K1: 같은 snapshot 으로 onTabSnapshotChange 를 다시 불러도 tabs 참조가 그대로이고 셸이 다시 그려지지 않는다.
 *  - K2: snapshot 이 바뀌면 셸 렌더는 1회뿐이다(tabOrder 동기화 effect 가 새 배열을 넣어 한 번 더 그리지 않는다).
 */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePortalTabs } from "../../src/portal-shell/use-portal-tabs";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Tabs = ReturnType<typeof usePortalTabs>;

const PAGE_ID = "mcm:csa/sample";
const resolvePage = async () => () => null;
const resolveDisplayText = (_pageId: string, fallback: string) => fallback;
const remember = () => {};
const noLeaves: never[] = [];
const noSearch = new Map<string, unknown>();
const loggingOutRef = { current: false };

describe("usePortalTabs — 같은 값이면 같은 참조(K1·K2)", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: Tabs;
  let renders = 0;

  function Probe() {
    latest = usePortalTabs({
      storageKey: "test.portal.tabs",
      resolvedHomePageId: null,
      homeTabId: null,
      resolvePage,
      resolveDisplayText,
      menuLeaves: noLeaves,
      menuSearchItemByPageId: noSearch,
      isStartPagesLoaded: true,
      rememberRecentMenuPage: remember,
      loggingOutRef,
    });
    renders += 1;
    return null;
  }

  async function flush() {
    for (let i = 0; i < 5; i += 1) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }
  }

  beforeEach(async () => {
    renders = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
    await flush();
    await act(async () => latest.openPageTab(PAGE_ID));
    await flush();
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("K1: 같은 snapshot 을 다시 보내면 tabs 참조가 그대로이고 다시 그리지 않는다", async () => {
    const tab = latest.tabs.find((t) => t.pageId === PAGE_ID);
    expect(tab).toBeDefined();
    await act(async () => latest.onTabSnapshotChange(tab!.id, { selected: "R1" }));
    await flush();

    const tabsBefore = latest.tabs;
    const orderedBefore = latest.orderedTabs;
    const rendersBefore = renders;
    await act(async () => latest.onTabSnapshotChange(tab!.id, { selected: "R1" }));
    await flush();

    expect(latest.tabs).toBe(tabsBefore);
    expect(latest.orderedTabs).toBe(orderedBefore);
    expect(renders).toBe(rendersBefore);
  });

  it("K2: snapshot 이 바뀌면 셸 렌더는 1회이고, 순서 동기화가 새 배열을 넣지 않는다", async () => {
    const tab = latest.tabs.find((t) => t.pageId === PAGE_ID)!;
    const rendersBefore = renders;
    await act(async () => latest.onTabSnapshotChange(tab.id, { selected: "R2" }));
    await flush();

    expect(latest.tabs.find((t) => t.id === tab.id)?.snapshot).toEqual({ selected: "R2" });
    expect(renders - rendersBefore).toBe(1);
  });

  it("렌더 전에 A→B→A 로 바뀌어도 마지막 값(A)이 남는다(사전 비교가 아직 그려지지 않은 변경을 놓치지 않는다)", async () => {
    const tab = latest.tabs.find((t) => t.pageId === PAGE_ID)!;
    await act(async () => latest.onTabSnapshotChange(tab.id, { selected: "A" }));
    await flush();
    await act(async () => {
      latest.onTabSnapshotChange(tab.id, { selected: "B" });
      latest.onTabSnapshotChange(tab.id, { selected: "A" });
    });
    await flush();
    expect(latest.tabs.find((t) => t.id === tab.id)?.snapshot).toEqual({ selected: "A" });
  });
});
