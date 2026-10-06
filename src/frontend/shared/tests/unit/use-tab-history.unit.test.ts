/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveTargetTabId,
  useTabHistory,
  type TabHistoryTabLike,
  type UseTabHistoryResult,
} from "../../src/portal-shell/use-tab-history";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tab = (id: string, pageId: string, isHome = false): TabHistoryTabLike => ({
  id,
  pageId,
  isHome,
});

describe("resolveTargetTabId — popstate pageId → 유효 탭 id", () => {
  const tabs: TabHistoryTabLike[] = [
    tab("home:mcm:home", "mcm:home", true),
    tab("mcm:csa/commUserMng-1-a", "mcm:csa/commUserMng"),
    tab("mpn:scheduling/operation-list-2-b", "mpn:scheduling/operation-list"),
  ];

  it("열려 있는 탭이면 해당 탭 id 를 반환한다", () => {
    expect(resolveTargetTabId(tabs, "mcm:csa/commUserMng")).toBe("mcm:csa/commUserMng-1-a");
    expect(resolveTargetTabId(tabs, "mpn:scheduling/operation-list")).toBe(
      "mpn:scheduling/operation-list-2-b"
    );
  });

  it("홈 탭도 pageId 로 찾는다", () => {
    expect(resolveTargetTabId(tabs, "mcm:home")).toBe("home:mcm:home");
  });

  it("닫힌 탭(목록에 없는 pageId)이면 null 을 반환한다 — 호출부가 건너뛰기로 처리", () => {
    expect(resolveTargetTabId(tabs, "mcm:csa/commMenuMng")).toBeNull();
  });

  it("빈 탭 목록(홈 미설정 등)이면 null 을 반환한다", () => {
    expect(resolveTargetTabId([], "mcm:home")).toBeNull();
  });

  it("같은 pageId 가 여러 개여도 첫 번째를 반환한다(불변식상 발생하지 않지만 결정적 동작 보장)", () => {
    const dup: TabHistoryTabLike[] = [
      tab("first", "mcm:dup"),
      tab("second", "mcm:dup"),
    ];
    expect(resolveTargetTabId(dup, "mcm:dup")).toBe("first");
  });
});

describe("resolveTargetTabId — 탭 id 지정(같은 화면 탭이 여럿일 때)", () => {
  const dupTabs: TabHistoryTabLike[] = [tab("a1", "x:a"), tab("a2", "x:a")];

  it("targetTabId 가 열린 탭이면 그 탭 id 를 반환한다", () => {
    expect(resolveTargetTabId(dupTabs, "x:a", "a2")).toBe("a2");
  });

  it("targetTabId 가 닫힌 탭이면 pageId 첫 탭으로 대체한다", () => {
    expect(resolveTargetTabId(dupTabs, "x:a", "gone")).toBe("a1");
  });

  it("targetTabId 가 없으면(옛 기록) pageId 첫 탭을 반환한다", () => {
    expect(resolveTargetTabId(dupTabs, "x:a")).toBe("a1");
  });
});

describe("useTabHistory — 같은 화면 탭 사이 이동도 history 에 탭 id 로 쌓는다", () => {
  let host: HTMLDivElement;
  let root: Root;
  let latest: UseTabHistoryResult;

  const dupTabs: TabHistoryTabLike[] = [tab("a1", "x:a"), tab("a2", "x:a")];

  function Probe() {
    latest = useTabHistory({
      tabs: dupTabs,
      activeTab: dupTabs[0],
      setActiveTabId: () => {},
      isStorageHydrated: true,
    });
    return null;
  }

  beforeEach(async () => {
    window.history.replaceState(null, "");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(createElement(Probe)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("활성 탭 a1(x:a) 에서 navigateToTab(a2, x:a) 를 부르면 portalTabId 가 a2 인 엔트리를 한 번 push 한다", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    act(() => latest.navigateToTab("a2", "x:a"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect((window.history.state as { portalTabId?: string }).portalTabId).toBe("a2");
  });

  it("활성 탭과 같은 탭 id 면 push 를 생략한다", () => {
    const pushSpy = vi.spyOn(window.history, "pushState");
    act(() => latest.navigateToTab("a1", "x:a"));
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("baseline 엔트리에 활성 탭 id 가 실린다", () => {
    expect((window.history.state as { portalTabId?: string }).portalTabId).toBe("a1");
  });
});
