/** @vitest-environment happy-dom */
/**
 * PortalShell 화면 사용 구간 연동 — 탭 열기·전환·닫기·홈·가림·로그아웃 때 onUsageSegments 가 불리는 순서(2026-10-02).
 * Date 만 가짜로 돌린다(Mantine·act 가 쓰는 타이머는 그대로). 탭 pageId 는 "t:a" 형식이고 기록 pageId 는 "a" 다.
 */
import { StrictMode, act, createElement } from "react";
import { signOut } from "next-auth/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell, type PortalShellProps } from "../../src/portal-shell/portal-shell";
import type { PortalShellMenuItem, PortalShellPageComponent } from "../../src/portal-shell/types";
import type { UsageSegment } from "../../src/portal-shell/usage-tracker";
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

/** 넘긴 묶음마다 [pageId, startKind, 시작, 끝](BASE 기준 ms). */
const rows = () =>
  batches.map((batch) =>
    batch.map((s) => [s.pageId, s.startKind, s.startedAt - BASE, s.endedAt - BASE])
  );

function unmount() {
  rendered?.unmount();
  rendered = null;
}

describe("PortalShell 화면 사용 구간(onUsageSegments)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    at(0);
    batches = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 })
      )
    );
  });

  afterEach(() => {
    unmount();
    delete (document as unknown as Record<string, unknown>).visibilityState;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("탭 열기·전환·닫기·홈 이동 때 이전 구간을 닫아 순서대로 넘기고, 홈은 기록하지 않는다", async () => {
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    expect(batches).toEqual([]); // 홈만 보고 있다

    await openTab("t:a"); // 0초 — 새 탭 a
    at(5_000);
    await openTab("t:b"); // 새 탭 b
    at(10_000);
    await openTab("t:a"); // 열린 탭 a 로 전환
    at(15_000);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[aria-label="t:a 탭 닫기"]')!.click();
    });
    await flush(); // 활성 탭 a 닫힘 → 이웃 탭 b
    at(20_000);
    await openTab("t:home"); // 홈 — 끝내기만
    at(30_000);
    await openTab("t:b"); // 홈에서 b
    at(33_000);
    unmount(); // 언마운트 — 열린 구간을 닫는다

    expect(rows()).toEqual([
      [["a", "OPEN", 0, 5_000]],
      [["b", "OPEN", 5_000, 10_000]],
      [["a", "SWITCH", 10_000, 15_000]],
      [["b", "SWITCH", 15_000, 20_000]],
      [["b", "SWITCH", 30_000, 33_000]],
    ]);
  });

  it("StrictMode 에서 빠르게 오가도 구간이 겹치거나 같은 clientSegId 가 두 번 나오지 않고, 새 탭마다 OPEN 이 한 번이다", async () => {
    rendered = renderWithMantine(createElement(StrictMode, null, createElement(PortalShell, props())));
    await flush();
    let now = 0;
    for (const pageId of ["t:a", "t:b", "t:c", "t:a", "t:b", "t:home", "t:c", "t:a"]) {
      await openTab(pageId);
      now += 1_500;
      at(now);
    }
    unmount();

    const segs = batches.flat();
    expect(segs).toHaveLength(7);
    expect(new Set(segs.map((s) => s.clientSegId)).size).toBe(segs.length);
    const sorted = [...segs].sort((x, y) => x.startedAt - y.startedAt);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(sorted[i].startedAt).toBeGreaterThanOrEqual(sorted[i - 1].endedAt);
    }
    expect(segs.filter((s) => s.startKind === "OPEN").map((s) => s.pageId)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(segs.some((s) => s.pageId === "home")).toBe(false);
  });

  it("새로고침 뒤 복원된 활성 탭은 SWITCH 로 시작한다(설계 §9.3)", async () => {
    const storageKey = `portal-shell-usage-restore-${Math.random()}`;
    rendered = renderWithMantine(createElement(PortalShell, props({ storageKey })));
    await flush();
    await openTab("t:a");
    at(2_000);
    unmount();

    at(10_000);
    rendered = renderWithMantine(createElement(PortalShell, props({ storageKey })));
    await flush();
    at(13_000);
    await openTab("t:b");

    expect(rows()).toEqual([
      [["a", "OPEN", 0, 2_000]],
      [["a", "SWITCH", 10_000, 13_000]],
    ]);
  });

  it("브라우저 탭을 가리면 닫고 다시 보이면 RESUME 으로 잇고, pagehide 에서도 닫는다", async () => {
    let visibility: DocumentVisibilityState = "visible";
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => visibility,
    });
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    await openTab("t:a");
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
    at(15_000);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    at(20_000);
    unmount(); // pagehide 뒤 입력이 없었으니 더 넘길 구간이 없다

    expect(rows()).toEqual([
      [["a", "OPEN", 0, 3_000]],
      [["a", "RESUME", 10_000, 12_000]],
      [["b", "OPEN", 12_000, 15_000]],
    ]);
  });

  it("로그아웃은 signOut 보다 먼저 열린 구간을 닫아 넘긴다", async () => {
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
    await openTab("t:a");
    at(4_000);

    act(() => document.querySelector<HTMLElement>(".portal-header__user-button")!.click());
    const logout = [...document.querySelectorAll<HTMLElement>("*")].find(
      (el) => el.textContent?.trim() === "로그아웃" && el.children.length === 0
    );
    expect(logout).toBeDefined();
    await act(async () => logout!.click());

    expect(order).toEqual(["usage", "signOut"]);
    expect(rows()).toEqual([[["a", "OPEN", 0, 4_000]]]);
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
    at(4_000);
    await openTab("t:b"); // 일반 전환 — reason normal
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

  it("기본 화면 자동 열기로 열린 탭은 OPEN 으로 시작한다", async () => {
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
    at(3_000);
    await openTab("t:home");

    expect(rows()).toEqual([[["g/a", "OPEN", 0, 3_000]]]);
  });

  it("onUsageSegments 가 없으면 추적기를 만들지 않는다(가림·pagehide 리스너 없음)", async () => {
    const docAdd = vi.spyOn(document, "addEventListener");
    const winAdd = vi.spyOn(window, "addEventListener");
    const listenedTypes = () =>
      [...docAdd.mock.calls, ...winAdd.mock.calls].map(([type]) => type);

    rendered = renderWithMantine(createElement(PortalShell, props({ onUsageSegments: undefined })));
    await flush();
    await openTab("t:a");
    expect(listenedTypes()).not.toContain("visibilitychange");
    expect(listenedTypes()).not.toContain("pagehide");
    unmount();

    // 대조 — prop 이 있으면 단다.
    rendered = renderWithMantine(createElement(PortalShell, props()));
    await flush();
    expect(listenedTypes()).toContain("visibilitychange");
    expect(listenedTypes()).toContain("pagehide");
  });
});
