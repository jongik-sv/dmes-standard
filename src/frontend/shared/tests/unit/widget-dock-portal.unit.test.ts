/** @vitest-environment happy-dom */
/**
 * 포털 셸 위젯 도크 연결 — widgetDock 이 없으면 기존 DOM·요청 그대로, 있으면 머리 「도구」 버튼과 셸 최상위 창 층.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PortalShell, type PortalShellProps } from "../../src/portal-shell/portal-shell";
import type { PortalShellPageComponent } from "../../src/portal-shell/types";
import { readSecureJson, writeSecureJson } from "../../src/secure-storage";
import { WidgetFrame } from "../../src/widget";
import type { WidgetRegistry } from "../../src/widget";
import { DOCK_STORAGE_PREFIX, dockStorageKey, WIDGET_DOCK_Z_INDEX } from "../../src/widget-dock";
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

const Page: PortalShellPageComponent = () => createElement("div", { className: "t-page" }, "page");

const REGISTRY: WidgetRegistry = {
  "def.calc": {
    meta: {
      id: "def.calc",
      title: "계산기",
      defaultSize: { w: 6, h: 8 },
      floatable: true,
      multiple: false,
    },
    load: async () => ({ default: () => createElement("p", { "data-testid": "calc-body" }, "0") }),
  },
  "home.notice": {
    meta: { id: "home.notice", title: "공지", defaultSize: { w: 6, h: 8 } },
    load: async () => ({ default: () => null }),
  },
};

function authFetch(id: string | null) {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify(
          id ? { authenticated: true, user: { id, name: id } } : { authenticated: false }
        ),
        { status: 200 }
      )
  );
}

let rendered: Rendered | null = null;

function shell(props: Partial<PortalShellProps> = {}) {
  return createElement(PortalShell, {
    appName: "TEST",
    menu: { items: [] },
    resolvePage: async () => Page,
    homePageId: null,
    storageKey: `widget-dock-portal-${Math.random()}`,
    userName: "홍길동",
    userLoginId: "hong",
    ...props,
  });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  });
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  rendered?.unmount();
  rendered = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** CSS 규칙 하나의 z-index 를 읽는다(happy-dom 은 css 파일을 적용하지 않으므로 원문에서 읽는다). */
function cssZIndex(file: string, selector: string): number | null {
  const css = readFileSync(resolve(__dirname, "../../src/portal-shell", file), "utf8");
  const start = css.indexOf(`${selector} {`);
  if (start < 0) return null;
  const body = css.slice(start, css.indexOf("}", start));
  const m = /z-index:\s*(\d+)/.exec(body);
  return m ? Number(m[1]) : null;
}

describe("위젯 도크 쌓임 순서(z-index)", () => {
  it("사이드바는 자기 쌓임 맥락(z-index)을 가져 폭 조절 손잡이(1002)가 도구 창 층 위로 새지 않는다", () => {
    const sidebar = cssZIndex("sidebar/Sidebar.css", ".sidebar-container");
    expect(sidebar).not.toBeNull();
    expect(sidebar!).toBeLessThan(WIDGET_DOCK_Z_INDEX);
    expect(cssZIndex("sidebar/Sidebar.css", ".sidebar-resize-handle")).toBe(1002);
  });

  it("탭 전체 화면의 슬라이딩 사이드바(140)와 도구 창 층(160) 모두 Mantine 모달(200) 아래다", () => {
    const sliding = cssZIndex("portal-shell.css", ".portal-shell--tab-fullscreen .sidebar-container");
    expect(sliding).not.toBeNull();
    expect(sliding!).toBeLessThan(WIDGET_DOCK_Z_INDEX);
    expect(WIDGET_DOCK_Z_INDEX).toBeLessThan(200);
  });
});

describe("PortalShell widgetDock", () => {
  it("widgetDock 이 없으면 도구 버튼·창 층이 없다", async () => {
    vi.stubGlobal("fetch", authFetch("u1"));
    rendered = renderWithMantine(shell());
    await flush();
    expect(document.querySelector('[data-testid="widget-dock-tools"]')).toBeNull();
    expect(document.querySelector(".cm-widget-dock")).toBeNull();
  });

  it("widgetDock 을 켜도 사용자 확인 요청은 셸의 것 한 번을 함께 쓴다", async () => {
    const without = authFetch("u1");
    vi.stubGlobal("fetch", without);
    rendered = renderWithMantine(shell());
    await flush();
    rendered.unmount();
    rendered = null;
    // 공유 사용자 캐시를 비워 같은 조건에서 다시 잰다.
    delete (globalThis as Record<string, unknown>).__dkOasisCurrentUserStore__;
    const withDock = authFetch("u1");
    vi.stubGlobal("fetch", withDock);
    rendered = renderWithMantine(
      shell({ widgetDock: { registry: REGISTRY, registryStatus: "ready", frame: WidgetFrame } })
    );
    await flush();
    expect(withDock.mock.calls.length).toBe(without.mock.calls.length);
  });

  it("widgetDock 이 있으면 사용자 메뉴 앞에 「도구」 버튼, 탭 화면 바깥에 창 층을 그린다", async () => {
    vi.stubGlobal("fetch", authFetch("u1"));
    rendered = renderWithMantine(
      shell({ widgetDock: { registry: REGISTRY, registryStatus: "ready", frame: WidgetFrame } })
    );
    await flush();
    const right = document.querySelector(".portal-header__right")!;
    const tools = right.querySelector('[data-testid="widget-dock-tools"]');
    expect(tools).not.toBeNull();
    expect(right.firstElementChild?.contains(tools!) || right.firstElementChild === tools).toBe(
      true
    );
    const layer = document.querySelector(".cm-widget-dock")!;
    expect(layer).not.toBeNull();
    expect(layer.closest(".portal-shell__content-area")).toBeNull();
  });

  it("「도구」 메뉴에서 고르면 창이 뜨고 사용자 키로 저장된다(floatable 아닌 위젯은 목록에 없다)", async () => {
    vi.stubGlobal("fetch", authFetch("u1"));
    rendered = renderWithMantine(
      shell({ widgetDock: { registry: REGISTRY, registryStatus: "ready", frame: WidgetFrame } })
    );
    await flush();
    act(() =>
      (document.querySelector('[data-testid="widget-dock-tools"]') as HTMLButtonElement).click()
    );
    await flush();
    const items = [
      ...document.querySelectorAll('[data-testid="widget-dock-tools-menu"] [data-widget-id]'),
    ];
    expect(items.map((el) => el.getAttribute("data-widget-id"))).toEqual(["def.calc"]);
    act(() => (items[0] as HTMLButtonElement).click());
    await flush();
    expect(document.querySelectorAll(".cm-widget-dock .cm-float-win")).toHaveLength(1);
    expect(document.querySelector('[data-testid="calc-body"]')).not.toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });
    const saved = readSecureJson<{ windows: Array<{ widgetId: string }> }>(dockStorageKey("u1"));
    expect(saved?.windows.map((w) => w.widgetId)).toEqual(["def.calc"]);
  });

  it("저장된 창을 다시 띄운다(접힌 창은 아이콘으로)", async () => {
    writeSecureJson(dockStorageKey("u1"), {
      version: 1,
      windows: [
        {
          id: "dk-calc",
          widgetId: "def.calc",
          x: 40,
          y: 50,
          w: 300,
          h: 240,
          collapsed: true,
          z: 1,
        },
      ],
    });
    vi.stubGlobal("fetch", authFetch("u1"));
    rendered = renderWithMantine(
      shell({ widgetDock: { registry: REGISTRY, registryStatus: "ready", frame: WidgetFrame } })
    );
    await flush();
    const icon = document.querySelector(".cm-widget-dock .cm-float-win__icon") as HTMLElement;
    expect(icon.getAttribute("aria-label")).toBe("계산기 펼치기");
    expect(document.querySelector('[data-testid="widget-dock-tools"]')!.textContent).toContain("1");
  });

  it("사용자가 확인되지 않으면 창이 없고 도크 저장소에 쓰지 않는다", async () => {
    vi.stubGlobal("fetch", authFetch(null));
    rendered = renderWithMantine(
      shell({ widgetDock: { registry: REGISTRY, registryStatus: "ready", frame: WidgetFrame } })
    );
    await flush();
    expect(document.querySelectorAll(".cm-float-win")).toHaveLength(0);
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "");
    expect(keys.some((k) => k.startsWith(DOCK_STORAGE_PREFIX))).toBe(false);
  });
});
