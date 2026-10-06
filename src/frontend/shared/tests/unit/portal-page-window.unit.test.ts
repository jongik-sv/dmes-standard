/** @vitest-environment happy-dom */
/**
 * 단독 창 호스트 PortalPageWindow(설계 2026-10-06-portal-tab-popout §5.4).
 * 탭과 같은 조건(TabPageContext·ErrorBoundary)으로 화면 하나를 그리고, handoff·snapshot·opener 전달을 맡는다.
 */
import { act, createElement, StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalPageWindow } from "../../src/portal-shell/page-window/PortalPageWindow";
import { useTabPage } from "../../src/portal-shell/tab-page-context";
import type { PageProps, PortalShellMenuItem, PortalShellMenuResponse } from "../../src/portal-shell/types";
import { useCarryRefetch, useCarryRestored, useCarryState } from "../../src/portal-shell/carry-state";
import {
  openPagePopout,
  POPOUT_CARRY_GLOBAL,
  POPOUT_CARRY_SESSION_PREFIX,
  POPOUT_HANDOFF_PREFIX,
  POPOUT_SNAPSHOT_PREFIX,
} from "../../src/portal-shell/popout";
import { readSecureJson, writeSecureJson } from "../../src/secure-storage";
import { resetMdmMetaStore } from "../../src/mdm-meta";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";
import { settle } from "./mdm-meta-fixtures";

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

const PAGE_ID = "x:grp/p1";
const MENU: PortalShellMenuResponse = {
  items: [
    {
      id: "d1",
      name: "d1",
      displayText: "폴더",
      type: "dir",
      items: [
        {
          id: "m1",
          name: "m1",
          displayText: "공지 관리",
          type: "page",
          items: [],
          parentId: "d1",
          expended: null,
          path: "",
          moduleId: "x",
          pageName: "p1",
          componentPath: "grp/p1",
        } satisfies PortalShellMenuItem,
      ],
      parentId: null,
      expended: null,
      path: "",
      moduleId: null,
      pageName: null,
    },
  ],
};

describe("PortalPageWindow", () => {
  let rendered: Rendered | null = null;
  let seen: { ctx: ReturnType<typeof useTabPage>; props: PageProps } | null = null;

  const Page = (props: PageProps) => {
    const ctx = useTabPage();
    seen = { ctx, props };
    return createElement("div", { "data-testid": "page" }, "화면");
  };

  beforeEach(() => {
    seen = null;
    localStorage.clear();
    sessionStorage.clear();
    document.title = "";
    resetMdmMetaStore();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ items: {}, missing: [], unavailable: [] }), { status: 200 })));
  });

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function mount(props: Partial<Parameters<typeof PortalPageWindow>[0]> = {}, strict = false) {
    const resolvePage = (props.resolvePage ?? vi.fn(async () => Page)) as NonNullable<Parameters<typeof PortalPageWindow>[0]["resolvePage"]>;
    const element = createElement(PortalPageWindow, {
      pageId: PAGE_ID,
      menu: MENU,
      appName: "TEST",
      handoffToken: "tok",
      opener: null,
      ...props,
      resolvePage,
    });
    rendered = renderWithMantine(strict ? createElement(StrictMode, null, element) : element);
    await act(async () => {
      await settle(30);
    });
    return resolvePage;
  }

  it("메뉴에 없는 pageId 는 화면을 부르지 않고 권한 없음 문구를 보인다", async () => {
    const resolvePage = vi.fn(async () => Page);
    await mount({ pageId: "x:grp/none", resolvePage });
    expect(resolvePage).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("이 화면을 열 권한이 없습니다.");
  });

  it("메뉴에 있는 pageId 는 화면이 TabPageContext 로 pageId·serviceId·tabId 를 읽는다", async () => {
    await mount();
    expect(seen?.ctx).toEqual({ pageId: PAGE_ID, serviceId: "d1", tabId: "popout-tok" });
  });

  it("handoff 를 한 번 소비해 snapshot 으로 쓰고 이 창 sessionStorage 에 옮긴다", async () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, { pageId: PAGE_ID, snapshot: { q: 1 }, createdAt: Date.now() });
    await mount();
    expect(seen?.props.snapshot).toEqual({ q: 1 });
    expect(readSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`)).toBeNull();
    expect(sessionStorage.getItem(`${POPOUT_SNAPSHOT_PREFIX}tok`)).toBe('{"q":1}');
  });

  it("StrictMode 에서 초기화가 두 번 불려도 같은 snapshot 을 받는다", async () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, { pageId: PAGE_ID, snapshot: { q: 1 }, createdAt: Date.now() });
    await mount({}, true);
    expect(seen?.props.snapshot).toEqual({ q: 1 });
  });

  it("새로고침 — handoff 가 없으면 sessionStorage 의 snapshot 을 쓴다", async () => {
    sessionStorage.setItem(`${POPOUT_SNAPSHOT_PREFIX}tok`, '{"q":2}');
    await mount();
    expect(seen?.props.snapshot).toEqual({ q: 2 });
  });

  it("handoff 도 sessionStorage 도 없으면 snapshot null 로 그린다", async () => {
    await mount();
    expect(document.querySelector('[data-testid="page"]')).not.toBeNull();
    expect(seen?.props.snapshot).toBeNull();
  });

  it("화면이 onSnapshotChange 를 부르면 sessionStorage 를 갱신하고 새 snapshot 을 다시 받는다", async () => {
    await mount();
    await act(async () => {
      seen?.props.onSnapshotChange({ q: 3 });
      await settle(10);
    });
    expect(sessionStorage.getItem(`${POPOUT_SNAPSHOT_PREFIX}tok`)).toBe('{"q":3}');
    expect(seen?.props.snapshot).toEqual({ q: 3 });
  });

  it("document.title 은 '{메뉴 표시명} - {앱 이름}'", async () => {
    await mount();
    expect(document.title).toBe("공지 관리 - TEST");
  });

  it("창 안의 portal-open-tab 은 opener 로 넘기고 opener 를 앞으로 가져온다", async () => {
    const opener = { closed: false, dispatchEvent: vi.fn(), focus: vi.fn() };
    await mount({ opener: opener as unknown as Window });
    act(() => {
      window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: "x:b" } }));
    });
    expect(opener.dispatchEvent).toHaveBeenCalledTimes(1);
    const event = opener.dispatchEvent.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe("portal-open-tab");
    expect(event.detail).toEqual({ pageId: "x:b" });
    expect(opener.focus).toHaveBeenCalledTimes(1);
  });

  it("opener.dispatchEvent 가 던져도(다른 출처로 이동) 오류가 밖으로 나오지 않는다", async () => {
    const opener = {
      closed: false,
      dispatchEvent: vi.fn(() => {
        throw new DOMException("blocked a frame", "SecurityError");
      }),
      focus: vi.fn(),
    };
    await mount({ opener: opener as unknown as Window });
    const errors: unknown[] = [];
    const onError = (event: Event) => errors.push(event);
    window.addEventListener("error", onError);
    try {
      expect(() => {
        act(() => {
          window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: "x:b" } }));
        });
      }).not.toThrow();
    } finally {
      window.removeEventListener("error", onError);
    }
    expect(opener.dispatchEvent).toHaveBeenCalledTimes(1);
    expect(errors).toEqual([]);
  });

  it("opener 가 null 이어도 portal-open-tab 에서 오류가 없다", async () => {
    await mount({ opener: null });
    expect(() => {
      act(() => {
        window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: "x:b" } }));
      });
    }).not.toThrow();
  });

  // ── 화면 상태 이어받기(carry-state) ───────────────────────────────────────────────

  const carry: {
    refetch: ReturnType<typeof vi.fn>;
    restored?: boolean;
    setFilters?: (v: { q: string }) => void;
    setRows?: (v: number[]) => void;
  } = { refetch: vi.fn() };
  const CarryPage = () => {
    const [filters, setFilters] = useCarryState("filters", { q: "" });
    const [rows, setRows] = useCarryState<number[]>("rows", [], { bulky: true });
    carry.restored = useCarryRestored();
    carry.setFilters = setFilters;
    carry.setRows = setRows;
    useCarryRefetch(() => carry.refetch());
    return createElement("div", { "data-testid": "carry", "data-q": filters.q, "data-rows": rows.join(",") });
  };
  const resolveCarryPage = vi.fn(async () => CarryPage) as unknown as NonNullable<Parameters<typeof PortalPageWindow>[0]["resolvePage"]>;
  const shown = () => {
    const el = document.querySelector('[data-testid="carry"]');
    return { q: el?.getAttribute("data-q"), rows: el?.getAttribute("data-rows") };
  };
  const fakeOpener = (taken: unknown) =>
    ({ closed: false, [POPOUT_CARRY_GLOBAL]: { take: vi.fn(() => taken) } }) as unknown as Window;
  const sessionCarry = () => {
    const raw = sessionStorage.getItem(`${POPOUT_CARRY_SESSION_PREFIX}tok`);
    return raw ? JSON.parse(raw) : null;
  };

  beforeEach(() => {
    carry.refetch = vi.fn();
    carry.restored = undefined;
  });

  it("opener 보관소의 값으로 화면 초기값(light·bulky)이 정해지고 재조회하지 않는다", async () => {
    const take = { light: { filters: { q: "조건" } }, bulky: { rows: [1, 2] } };
    await mount({ resolvePage: resolveCarryPage, opener: fakeOpener(take) });
    expect(shown()).toEqual({ q: "조건", rows: "1,2" });
    expect(carry.restored).toBe(true);
    expect(carry.refetch).not.toHaveBeenCalled();
  });

  it("StrictMode 초기화 두 번에도 opener 의 한 번뿐인 값을 받는다", async () => {
    const opener = fakeOpener({ light: { filters: { q: "조건" } }, bulky: { rows: [7] } });
    await mount({ resolvePage: resolveCarryPage, opener }, true);
    expect(shown()).toEqual({ q: "조건", rows: "7" });
    expect(carry.refetch).not.toHaveBeenCalled();
    expect(((opener as unknown as Record<string, { take: ReturnType<typeof vi.fn> }>)[POPOUT_CARRY_GLOBAL]).take).toHaveBeenCalledTimes(1);
  });

  it("opener 보관소의 값은 이 창 sessionStorage 에 light 만 옮겨 두고 hadBulky 를 적는다", async () => {
    await mount({ resolvePage: resolveCarryPage, opener: fakeOpener({ light: { filters: { q: "조건" } }, bulky: { rows: [1] } }) });
    expect(sessionCarry()).toEqual({ light: { filters: { q: "조건" } }, hadBulky: true });
  });

  it("opener 가 없으면 handoff light 로 시작하고 행은 자동 재조회를 한 번 부른다", async () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, {
      pageId: PAGE_ID,
      snapshot: null,
      createdAt: Date.now(),
      carry: { light: { filters: { q: "조건" } }, hadBulky: true },
    });
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(shown()).toEqual({ q: "조건", rows: "" });
    expect(carry.restored).toBe(true);
    expect(carry.refetch).toHaveBeenCalledTimes(1);
    expect(sessionCarry()).toEqual({ light: { filters: { q: "조건" } }, hadBulky: true });
  });

  it("StrictMode 에서도 handoff light 복원 재조회는 한 번이다", async () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, {
      pageId: PAGE_ID,
      snapshot: null,
      createdAt: Date.now(),
      carry: { light: { filters: { q: "조건" } }, hadBulky: true },
    });
    await mount({ resolvePage: resolveCarryPage, opener: null }, true);
    expect(shown()).toEqual({ q: "조건", rows: "" });
    expect(carry.refetch).toHaveBeenCalledTimes(1);
  });

  it("opener 보관소가 비었으면(이미 가져감) handoff light 로 물러선다", async () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, {
      pageId: PAGE_ID,
      snapshot: null,
      createdAt: Date.now(),
      carry: { light: { filters: { q: "조건" } }, hadBulky: false },
    });
    await mount({ resolvePage: resolveCarryPage, opener: fakeOpener(null) });
    expect(shown()).toEqual({ q: "조건", rows: "" });
    expect(carry.refetch).not.toHaveBeenCalled(); // 원래 행이 없었다
  });

  it("새로고침(F5) — opener·handoff 가 없으면 이 창 sessionStorage 의 light 로 시작하고 행을 다시 조회한다", async () => {
    sessionStorage.setItem(`${POPOUT_CARRY_SESSION_PREFIX}tok`, JSON.stringify({ light: { filters: { q: "새로고침" } }, hadBulky: true }));
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(shown()).toEqual({ q: "새로고침", rows: "" });
    expect(carry.refetch).toHaveBeenCalledTimes(1);
  });

  it("복원값이 없으면 초기값으로 그리고 재조회하지 않으며 sessionStorage 에 아무것도 쓰지 않는다", async () => {
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(shown()).toEqual({ q: "", rows: "" });
    expect(carry.restored).toBe(false);
    expect(carry.refetch).not.toHaveBeenCalled();
    expect(sessionCarry()).toBeNull();
  });

  it("pagehide 때 등록소의 light 를 다시 모아 sessionStorage 에 쓴다(hadBulky 는 행이 있을 때만 true)", async () => {
    await mount({ resolvePage: resolveCarryPage, opener: null });
    await act(async () => {
      carry.setFilters?.({ q: "바뀐 조건" });
      await settle(5);
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(sessionCarry()).toEqual({ light: { filters: { q: "바뀐 조건" } }, hadBulky: false }); // 조회하지 않아 rows 가 빈 배열
    await act(async () => {
      carry.setRows?.([4, 5]);
      await settle(5);
    });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(sessionCarry()).toEqual({ light: { filters: { q: "바뀐 조건" } }, hadBulky: true });
  });

  it("이어받은 hadBulky 의 재조회가 끝나기 전에 새로고침되면 지금 행이 없어도 hadBulky true 를 유지한다", async () => {
    sessionStorage.setItem(`${POPOUT_CARRY_SESSION_PREFIX}tok`, JSON.stringify({ light: { filters: { q: "조건" } }, hadBulky: true }));
    carry.refetch = vi.fn(() => new Promise(() => undefined)); // 끝나지 않는 재조회
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(carry.refetch).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(sessionCarry()).toEqual({ light: { filters: { q: "조건" } }, hadBulky: true });
  });

  it("재조회가 끝났는데 행이 없으면(0건) 새로고침 저장은 hadBulky false", async () => {
    sessionStorage.setItem(`${POPOUT_CARRY_SESSION_PREFIX}tok`, JSON.stringify({ light: { filters: { q: "조건" } }, hadBulky: true }));
    carry.refetch = vi.fn(async () => undefined);
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(carry.refetch).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(sessionCarry()).toEqual({ light: { filters: { q: "조건" } }, hadBulky: false });
  });

  // ── 조회하지 않은 탭(빈 배열) / 행이 있는 탭의 실제 분리 → opener 없이 열기 → F5 ─────────────────

  function detach(bulky: Record<string, unknown>) {
    const win = { open: vi.fn(() => ({}) as Window), outerWidth: 1200, outerHeight: 800, screenX: 0, screenY: 0 };
    openPagePopout({
      pageId: PAGE_ID,
      snapshot: null,
      carry: { light: { filters: { q: "조건" } }, bulky },
      buildUrl: (_p, t) => `/popup/x?h=${t}`,
      win,
      createToken: () => "tok",
    });
  }

  it("조회하지 않은 탭(rows 빈 배열)을 분리해 opener 없이 열면 재조회하지 않고, 새로고침(F5)해도 재조회하지 않는다", async () => {
    detach({ rows: [] });
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(shown()).toEqual({ q: "조건", rows: "" });
    expect(carry.restored).toBe(true);
    expect(carry.refetch).not.toHaveBeenCalled();
    expect(sessionCarry()).toEqual({ light: { filters: { q: "조건" } }, hadBulky: false });
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    rendered?.unmount();
    rendered = null;
    // F5 — handoff 는 이미 소비됐고 이 창 sessionStorage 만 남아 있다.
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(shown()).toEqual({ q: "조건", rows: "" });
    expect(carry.refetch).not.toHaveBeenCalled();
  });

  it("행이 있던 탭을 분리해 opener 없이 열면 재조회 1회, 새로고침(F5)에서도 1회", async () => {
    detach({ rows: [1, 2] });
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(carry.refetch).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    rendered?.unmount();
    rendered = null;
    await mount({ resolvePage: resolveCarryPage, opener: null });
    expect(carry.refetch).toHaveBeenCalledTimes(2);
  });

  it("opener 보관소의 값이 빈 배열뿐이면 재조회하지 않고 sessionStorage hadBulky 도 false", async () => {
    await mount({ resolvePage: resolveCarryPage, opener: fakeOpener({ light: { filters: { q: "조건" } }, bulky: { rows: [] } }) });
    expect(shown()).toEqual({ q: "조건", rows: "" });
    expect(carry.refetch).not.toHaveBeenCalled();
    expect(sessionCarry()).toEqual({ light: { filters: { q: "조건" } }, hadBulky: false });
  });

  it("opener 보관소 항목의 pageId 가 이 창의 pageId 와 다르면 버리고 handoff light 로 물러선다", async () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, {
      pageId: PAGE_ID,
      snapshot: null,
      createdAt: Date.now(),
      carry: { light: { filters: { q: "보조" } }, hadBulky: false },
    });
    const take = vi.fn(() => ({ pageId: "x:other/page", light: { filters: { q: "다른 화면" } }, bulky: { rows: [9] } }));
    const opener = { closed: false, [POPOUT_CARRY_GLOBAL]: { take } } as unknown as Window;
    await mount({ resolvePage: resolveCarryPage, opener });
    expect(take).toHaveBeenCalledWith("tok", PAGE_ID);
    expect(shown()).toEqual({ q: "보조", rows: "" });
  });

  it("opener 보관소 값을 JSON 으로 복제하지 못하면(순환) handoff light 로 물러선다", async () => {
    writeSecureJson(`${POPOUT_HANDOFF_PREFIX}tok`, {
      pageId: PAGE_ID,
      snapshot: null,
      createdAt: Date.now(),
      carry: { light: { filters: { q: "보조" } }, hadBulky: true },
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await mount({ resolvePage: resolveCarryPage, opener: fakeOpener({ light: { filters: { q: "주" } }, bulky: { rows: cyclic } }) });
    expect(shown()).toEqual({ q: "보조", rows: "" });
    expect(carry.refetch).toHaveBeenCalledTimes(1);
  });

  it("같은 key 는 한 번만 복원 — 화면 안 목록이 나중에 다시 마운트돼도 이어받은 값을 되살리지 않는다", async () => {
    let rerender: (v: number) => void = () => undefined;
    const Remounting = () => {
      const [n, setN] = useState(0);
      rerender = setN;
      return createElement(CarryPage, { key: n });
    };
    await mount({
      resolvePage: vi.fn(async () => Remounting) as unknown as NonNullable<Parameters<typeof PortalPageWindow>[0]["resolvePage"]>,
      opener: fakeOpener({ light: { filters: { q: "조건" } }, bulky: { rows: [1, 2] } }),
    });
    expect(shown()).toEqual({ q: "조건", rows: "1,2" });
    await act(async () => {
      rerender(1);
      await settle(5);
    });
    expect(shown()).toEqual({ q: "", rows: "" });
  });

  it("훅을 쓰지 않는 화면은 pagehide 에도 sessionStorage carry 를 쓰지 않는다", async () => {
    await mount();
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    expect(sessionCarry()).toBeNull();
  });
});
