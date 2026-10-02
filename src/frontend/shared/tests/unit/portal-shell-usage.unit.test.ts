/** @vitest-environment happy-dom */
/**
 * PortalShell 화면 사용 구간 연동 — 탭 열기·전환·닫기·홈·가림·로그아웃 때 onUsageSegments 가 불리는 순서(2026-10-02).
 * 구간은 탭을 연 때가 아니라 그 탭의 첫 업무 호출(입력 뒤 5초 안의 업무 fetch)부터 시작하고, 탭마다 하나를 두어
 * 다른 탭·가림 동안은 일시정지했다가 이어 누적한다. 탭 닫기·pagehide·로그아웃·언마운트 때 내보낸다(설계 §3.1).
 * Date 만 가짜로 돌린다(Mantine·act 가 쓰는 타이머는 그대로). 탭 pageId 는 "t:a" 형식이고 기록 pageId 는 "a" 다.
 */
import { StrictMode, act, createElement } from "react";
import { signOut } from "next-auth/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell, type PortalShellProps } from "../../src/portal-shell/portal-shell";
import type { PortalShellMenuItem, PortalShellPageComponent } from "../../src/portal-shell/types";
import type { UsageSegment } from "../../src/portal-shell/usage-tracker";
import { readSecureJson } from "../../src/secure-storage";
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

const Page: PortalShellPageComponent = () => createElement("div", null, "page");
const BASE = Date.UTC(2026, 9, 2, 0, 0, 0);

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

/** 사용자 입력 없이 나가는 업무 호출(화면을 열 때의 자동 조회 같은 것). */
async function autoFetch(path = "/api/t/oasis/x/search") {
  await act(async () => {
    await fetch(path);
  });
}

function pointerDown() {
  act(() => {
    document.dispatchEvent(new Event("pointerdown"));
  });
}

/** 지금 보고 있는 탭에서 사용자가 입력하고 업무 호출을 보낸다(첫 업무 호출 = 구간 시작). */
async function work(path = "/api/t/oasis/x/search") {
  pointerDown();
  await autoFetch(path);
}

/** BASE 기준 ms 로 시계를 맞춘다. */
const at = (ms: number) => vi.setSystemTime(BASE + ms);

let rendered: Rendered | null = null;
let batches: UsageSegment[][];

function props(overrides: Partial<PortalShellProps> = {}): PortalShellProps {
  return {
    appName: "TEST",
    menu: { items: [] },
    resolvePage: async () => Page,
    homePageId: "t:home",
    storageKey: `portal-shell-usage-${Math.random()}`,
    onUsageSegments: (segments) => {
      batches.push(segments);
    },
    ...overrides,
  };
}

/** 넘긴 묶음마다 [pageId, startKind, 시작, 끝(BASE 기준 ms), 이용 시간]. */
const rows = () =>
  batches.map((batch) =>
    batch.map((s) => [s.pageId, s.startKind, s.startedAt - BASE, s.endedAt - BASE, s.durationMs])
  );

function unmount() {
  rendered?.unmount();
  rendered = null;
}

function clickCloseTab(title: string) {
  return act(async () => {
    document.querySelector<HTMLButtonElement>(`[aria-label="${title} 탭 닫기"]`)!.click();
  });
}

describe("PortalShell 화면 사용 구간(onUsageSegments)", () => {
  let stubFetch: typeof fetch;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    batches = [];
    stubFetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 })
    ) as unknown as typeof fetch;
    vi.stubGlobal("fetch", stubFetch);
  });

  afterEach(() => {
    unmount();
    delete (document as unknown as Record<string, unknown>).visibilityState;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("탭마다 첫 업무 호출부터 재고, 전환·홈 동안은 일시정지했다가 이어 누적해 탭을 닫을 때 한 행으로 넘긴다", async () => {
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    expect(batches).toEqual([]); // 홈만 보고 있다

    await openTab("t:a"); // 0초 — 새 탭 a(아직 기록 안 함)
    at(1_000);
    await work(); // a 첫 업무 호출 → OPEN
    at(5_000);
    await openTab("t:b"); // 새 탭 b — a 일시정지(4초)
    at(6_000);
    await work(); // b 첫 업무 호출 → OPEN
    at(10_000);
    await openTab("t:a"); // 활성화된 탭 a 로 전환 — 같은 구간에 이어 누적, 행 없음
    expect(batches).toEqual([]);
    at(15_000);
    await clickCloseTab("t:a");
    await flush(); // 활성 탭 a 닫힘 → a 를 넘기고 이웃 탭 b(활성화됨)를 이어 잰다
    at(20_000);
    await openTab("t:home"); // 홈 — 일시정지만
    at(30_000);
    await openTab("t:b"); // 홈에서 b
    at(33_000);
    unmount(); // 언마운트 — 남은 구간을 넘긴다

    expect(rows()).toEqual([
      [["a", "OPEN", 1_000, 15_000, 9_000]],
      [["b", "OPEN", 6_000, 33_000, 12_000]],
    ]);
  });

  it("탭을 열기만 하거나 입력 없이 자동 호출만 나가면 구간이 없다", async () => {
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    await openTab("t:a");
    await autoFetch(); // 화면을 열 때의 자동 조회
    at(10_000);
    await openTab("t:b");
    await autoFetch();
    at(20_000);
    pointerDown(); // 입력은 있었지만
    at(25_001);
    await autoFetch(); // 5초가 지난 뒤의 호출
    at(30_000);
    await work("/api/t/lov/codes"); // 입력 직후라도 LOV 는 업무 호출이 아니다
    await work("/api/mcm/oasis/secFavorite/toggle"); // 포털 자체 요청
    at(40_000);
    unmount();
    expect(batches).toEqual([]);
  });

  it("메뉴를 누른 입력은 이전 탭의 것이라 새 탭의 자동 조회를 업무 호출로 치지 않는다", async () => {
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    pointerDown(); // 홈에서 메뉴를 누름
    await openTab("t:a");
    await autoFetch(); // 새 화면의 자동 조회(입력 뒤 5초 안)
    at(2_000);
    await work(); // a 안에서 입력 → OPEN
    at(4_000);
    pointerDown(); // a 를 보던 중 사이드바 메뉴를 누름
    await openTab("t:b");
    await autoFetch();
    at(6_000);
    unmount();
    expect(rows()).toEqual([[["a", "OPEN", 2_000, 4_000, 2_000]]]);
  });

  it("활성화되지 않은 탭을 보는 동안은 재지 않고, 활성화된 탭으로 돌아오면 같은 구간에 이어 누적한다", async () => {
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    await openTab("t:a"); // 열기만
    at(1_000);
    await openTab("t:b");
    await work(); // b OPEN 1초
    at(3_000);
    await openTab("t:a"); // 활성화 안 된 a — 재지 않음, b 일시정지(2초)
    at(8_000);
    await openTab("t:b"); // 활성화된 b — 이어 누적
    at(9_000);
    await openTab("t:a"); // b 일시정지(3초)
    at(10_000);
    await work(); // a 첫 업무 호출 → OPEN
    at(12_000);
    unmount();
    expect(rows()).toEqual([
      [
        ["b", "OPEN", 1_000, 9_000, 3_000],
        ["a", "OPEN", 10_000, 12_000, 2_000],
      ],
    ]);
  });

  it("탭을 닫으면 활성화 상태가 없어지고, 다시 열면 첫 업무 호출부터 OPEN 이다", async () => {
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    await openTab("t:a");
    await work(); // a OPEN 0초
    at(2_000);
    await openTab("t:b"); // b 는 열기만 — a 일시정지(2초)
    await clickCloseTab("t:a"); // 보이지 않는 a 를 닫는다 — 바로 넘긴다
    await flush();
    expect(rows()).toEqual([[["a", "OPEN", 0, 2_000, 2_000]]]);
    at(3_000);
    await openTab("t:a"); // 다시 연 a — 새 탭
    at(5_000);
    await work();
    at(7_000);
    unmount();
    expect(rows()).toEqual([
      [["a", "OPEN", 0, 2_000, 2_000]],
      [["a", "OPEN", 5_000, 7_000, 2_000]],
    ]);
  });

  it("StrictMode 에서 빠르게 오가도 탭마다 OPEN 구간 하나에 누적하고, 같은 clientSegId 가 두 번 나오지 않는다", async () => {
    rendered = renderWithMantine(createElement(StrictMode, null, createElement(PortalShell, props())));
    await flush();
    expect(globalThis.fetch).not.toBe(stubFetch);
    let now = 0;
    for (const pageId of ["t:a", "t:b", "t:c", "t:a", "t:b", "t:home", "t:c", "t:a"]) {
      await openTab(pageId);
      await work();
      now += 1_500;
      at(now);
    }
    unmount();
    expect(globalThis.fetch).toBe(stubFetch); // 이중 effect 뒤에도 원래 fetch 로 돌아온다

    const segs = batches.flat();
    expect(new Set(segs.map((s) => s.clientSegId)).size).toBe(segs.length);
    for (const s of segs) expect(s.durationMs).toBeLessThanOrEqual(s.endedAt - s.startedAt);
    expect(segs.reduce((sum, s) => sum + s.durationMs, 0)).toBeLessThanOrEqual(now);
    expect(segs.map((s) => [s.pageId, s.startKind, s.durationMs])).toEqual([
      ["a", "OPEN", 4_500],
      ["b", "OPEN", 3_000],
      ["c", "OPEN", 3_000],
    ]);
  });

  it("새로고침 뒤 복원된 탭도 첫 업무 호출부터 OPEN 으로 시작한다(실제 업무가 있었으므로 열람)", async () => {
    const storageKey = `portal-shell-usage-restore-${Math.random()}`;
    rendered = renderWithMantine(createElement(PortalShell, props({ storageKey })));
    await flush();
    await openTab("t:a");
    await work();
    at(2_000);
    unmount();

    at(10_000);
    rendered = renderWithMantine(createElement(PortalShell, props({ storageKey })));
    await flush();
    await autoFetch(); // 복원된 화면의 자동 조회
    at(13_000);
    await work(); // 복원 탭의 첫 업무 호출 — 활성화 상태는 새로고침으로 없어졌다
    at(15_000);
    unmount();

    expect(rows()).toEqual([
      [["a", "OPEN", 0, 2_000, 2_000]],
      [["a", "OPEN", 13_000, 15_000, 2_000]],
    ]);
  });

  it("브라우저 탭을 가리면 일시정지했다가 다시 보이면 이어 누적하고, pagehide 에서 일시정지 중인 탭까지 넘긴다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    await openTab("t:a");
    await work();
    at(3_000);
    act(() => {
      visibility = "hidden";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    at(10_000);
    act(() => {
      visibility = "visible";
      document.dispatchEvent(new Event("visibilitychange"));
    });
    at(12_000);
    await openTab("t:b");
    await work();
    at(15_000);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    at(20_000);
    unmount(); // pagehide 뒤 입력이 없었으니 더 넘길 구간이 없다

    expect(rows()).toEqual([
      [
        ["a", "OPEN", 0, 12_000, 5_000],
        ["b", "OPEN", 12_000, 15_000, 3_000],
      ],
    ]);
  });

  it("로그아웃은 signOut 보다 먼저 일시정지 중인 탭까지 모든 구간을 넘기고, fetch 를 원래대로 되돌린다", async () => {
    const order: string[] = [];
    vi.mocked(signOut).mockImplementationOnce(async () => {
      order.push("signOut");
      return undefined as never;
    });
    rendered = renderWithMantine(
      createElement(
        PortalShell,
        props({
          onUsageSegments: (segments) => {
            order.push("usage");
            batches.push(segments);
          },
        })
      )
    );
    await flush();
    await openTab("t:b");
    await work(); // b OPEN 0초
    at(1_000);
    await openTab("t:a"); // b 는 일시정지(1초) 상태로 남는다
    await work(); // a OPEN 1초
    at(4_000);

    act(() => document.querySelector<HTMLElement>(".portal-header__user-button")!.click());
    const logout = [...document.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.textContent?.trim() === "로그아웃" && el.children.length === 0
    );
    expect(logout).toBeDefined();
    await act(async () => logout!.click());

    expect(order).toEqual(["usage", "signOut"]);
    expect(rows()).toEqual([
      [
        ["b", "OPEN", 0, 1_000, 1_000], // 일시정지 중인 탭도 함께 넘긴다
        ["a", "OPEN", 1_000, 4_000, 3_000],
      ],
    ]);
    expect(globalThis.fetch).toBe(stubFetch);
    unmount();
    expect(batches).toHaveLength(1); // 로그아웃으로 이미 닫았다
  });

  async function clickLogout() {
    act(() => document.querySelector<HTMLElement>(".portal-header__user-button")!.click());
    const logout = [...document.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.textContent?.trim() === "로그아웃" && el.children.length === 0
    );
    expect(logout).toBeDefined();
    await act(async () => logout!.click());
  }

  it("로그아웃은 reason logout 으로 넘긴 Promise 가 1500ms 안에 끝나면 그 뒤에 signOut 한다", async () => {
    vi.mocked(signOut).mockClear();
    const reasons: string[] = [];
    let finish: () => void = () => {};
    rendered = renderWithMantine(
      createElement(
        PortalShell,
        props({
          onUsageSegments: (segments, info) => {
            reasons.push(info.reason);
            batches.push(segments);
            if (info.reason !== "logout") return undefined;
            return new Promise<void>((resolve) => {
              finish = resolve;
            });
          },
        })
      )
    );
    await flush();
    await openTab("t:a");
    await work();
    at(4_000);
    await openTab("t:b");
    await work();
    await clickCloseTab("t:a"); // 보이지 않는 a 를 닫는다 — reason normal
    await flush();
    at(7_000);

    await clickLogout();
    expect(reasons).toEqual(["normal", "logout"]);
    expect(signOut).not.toHaveBeenCalled(); // flush 가 끝나기 전

    await act(async () => finish());
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("로그아웃 flush 가 끝나지 않으면 1500ms 뒤에는 기다리지 않고 signOut 한다", async () => {
    vi.mocked(signOut).mockClear();
    rendered = renderWithMantine(
      createElement(
        PortalShell,
        props({
          onUsageSegments: (segments, info) => {
            batches.push(segments);
            return info.reason === "logout" ? new Promise<void>(() => {}) : undefined;
          },
        })
      )
    );
    await flush();
    await openTab("t:a");
    await work();
    at(4_000);
    // 이미 Date 만 가짜인 상태에서 다시 켜면 setTimeout 이 가짜로 바뀌지 않으므로 한 번 되돌린 뒤 켠다.
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    at(4_000);

    await clickLogout();
    expect(signOut).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1_499);
    });
    expect(signOut).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("로그아웃 대기(flush) 중에 탭을 바꾸거나 업무 호출이 나가도 저장소를 다시 쓰거나 구간을 열지 않는다", async () => {
    vi.mocked(signOut).mockClear();
    const storageKey = `portal-shell-usage-logout-${Math.random()}`;
    rendered = renderWithMantine(
      createElement(
        PortalShell,
        props({
          storageKey,
          onUsageSegments: (segments, info) => {
            batches.push(segments);
            return info.reason === "logout" ? new Promise<void>(() => {}) : undefined;
          },
        })
      )
    );
    await flush();
    await openTab("t:a");
    await work();
    at(2_000);
    await openTab("t:b");
    await work();
    at(4_000); // 1초 이상 열려 있어야 logout 구간이 나가고 대기가 생긴다
    expect(readSecureJson<{ tabs: unknown[] }>(storageKey)?.tabs).toHaveLength(2);

    await clickLogout();
    expect(signOut).not.toHaveBeenCalled(); // 아직 대기 중
    expect(readSecureJson(storageKey)).toEqual({ tabs: [], activeTabId: null });
    const closed = batches.length;

    await openTab("t:a"); // 대기 중 탭 전환(활성화된 탭)
    await openTab("t:c"); // 대기 중 새 탭
    await work();
    at(8_000);
    unmount();
    expect(readSecureJson(storageKey)).toEqual({ tabs: [], activeTabId: null });
    expect(batches).toHaveLength(closed);
  });

  it("doLogout 이 두 번 불려도 signOut 은 한 번만 나간다", async () => {
    vi.mocked(signOut).mockClear();
    rendered = renderWithMantine(
      createElement(
        PortalShell,
        props({
          onBeforeLogout: (doLogout) => {
            doLogout();
            doLogout();
          },
        })
      )
    );
    await flush();
    await openTab("t:a");
    await work();
    at(4_000);

    await clickLogout();
    await flush();
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("기본 화면 자동 열기로 열린 탭은 모두 첫 업무 호출부터 OPEN 으로 시작한다", async () => {
    const node = (id: string): PortalShellMenuItem => ({
      id,
      name: id,
      displayText: id,
      type: "page",
      items: [],
      parentId: "g",
      expended: null,
      path: "/",
      moduleId: "t",
      pageName: id,
      componentPath: `g/${id}`,
    });
    const menu = {
      items: [
        {
          id: "g",
          name: "g",
          displayText: "그룹",
          type: "dir" as const,
          items: [node("a"), node("b")],
          parentId: null,
          expended: null,
          path: "/",
          moduleId: "t",
          pageName: null,
        },
      ],
    };
    rendered = renderWithMantine(
      createElement(
        PortalShell,
        props({
          menu,
          startPages: [
            { pageId: "t:g/a", menuId: "a", displayText: "a", sortOrder: 1 },
            { pageId: "t:g/b", menuId: "b", displayText: "b", sortOrder: 2 },
          ],
        })
      )
    );
    await flush();
    await autoFetch(); // 자동으로 연 화면의 자동 조회
    at(1_000);
    await work(); // 첫 기본 화면 a
    at(3_000);
    await openTab("t:g/b"); // 보이지 않던 기본 화면 b 로 전환 — 아직 기록 안 함
    at(4_000);
    await work();
    at(6_000);
    unmount();

    expect(rows()).toEqual([
      [
        ["g/a", "OPEN", 1_000, 3_000, 2_000],
        ["g/b", "OPEN", 4_000, 6_000, 2_000],
      ],
    ]);
  });

  it("onUsageSegments 가 없으면 추적기를 만들지 않고 fetch 도 감싸지 않는다", async () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const listenedTypes = () =>
      [...docAdd.mock.calls, ...winAdd.mock.calls].map(([type]) => type);

    rendered = renderWithMantine(createElement(PortalShell, props({ onUsageSegments: undefined })));
    await flush();
    await openTab("t:a");
    expect(listenedTypes()).not.toContain("visibilitychange");
    expect(listenedTypes()).not.toContain("pagehide");
    expect(globalThis.fetch).toBe(stubFetch);
    unmount();

    // 대조 — prop 이 있으면 단다.
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    expect(listenedTypes()).toContain("visibilitychange");
    expect(listenedTypes()).toContain("pagehide");
    expect(globalThis.fetch).not.toBe(stubFetch);
    expect(window.fetch).toBe(globalThis.fetch); // 브라우저와 같이 window 와 globalThis 가 같은 fetch 를 본다
    unmount();
    expect(globalThis.fetch).toBe(stubFetch); // 언마운트하면 원래 fetch
  });
});
