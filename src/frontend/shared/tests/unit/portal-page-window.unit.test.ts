/** @vitest-environment happy-dom */
/**
 * 단독 창 호스트 PortalPageWindow(설계 2026-10-06-portal-tab-popout §5.4).
 * 탭과 같은 조건(TabPageContext·ErrorBoundary)으로 화면 하나를 그리고, handoff·snapshot·opener 전달을 맡는다.
 */
import { act, createElement, StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalPageWindow } from "../../src/portal-shell/page-window/PortalPageWindow";
import { useTabPage } from "../../src/portal-shell/tab-page-context";
import type { PageProps, PortalShellMenuItem, PortalShellMenuResponse } from "../../src/portal-shell/types";
import { POPOUT_HANDOFF_PREFIX, POPOUT_SNAPSHOT_PREFIX } from "../../src/portal-shell/popout";
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

  it("opener 가 null 이어도 portal-open-tab 에서 오류가 없다", async () => {
    await mount({ opener: null });
    expect(() => {
      act(() => {
        window.dispatchEvent(new CustomEvent("portal-open-tab", { detail: { pageId: "x:b" } }));
      });
    }).not.toThrow();
  });
});
