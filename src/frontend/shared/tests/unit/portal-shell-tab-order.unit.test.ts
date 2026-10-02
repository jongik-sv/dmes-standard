/** @vitest-environment happy-dom */
/**
 * 새 탭 자리 — 화면 링크(`portal-open-tab`)나 메뉴로 새 탭을 열면 지금 보고 있는 탭 바로 오른쪽에 생긴다(2026-10-02).
 * 이미 열린 화면은 자리를 옮기지 않고 그 탭으로 넘어가기만 한다.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell } from "../../src/portal-shell/portal-shell";
import type { PortalShellPageComponent } from "../../src/portal-shell/types";
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

/** 홈을 뺀 탭 순서(pageId). */
const order = () =>
  [...document.querySelectorAll<HTMLElement>(".tabs-scroll-area [data-tab-id]")].map((el) =>
    (el.querySelector(".tab-title")?.textContent ?? "").trim()
  );
const active = () =>
  (
    document.querySelector(".tabs-scroll-area .tab-item.active .tab-title")?.textContent ?? ""
  ).trim();

describe("PortalShell 새 탭 자리", () => {
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

  it("새 탭은 보고 있는 탭 바로 오른쪽에 생기고, 이미 열린 탭은 자리를 옮기지 않는다", async () => {
    rendered = renderWithMantine(
      createElement(PortalShell, {
        appName: "TEST",
        menu: { items: [] },
        resolvePage: async () => Page,
        homePageId: "t:home",
        storageKey: `portal-shell-tab-order-${Math.random()}`,
      })
    );
    await flush();

    await openTab("t:a");
    await openTab("t:b");
    expect(order()).toEqual(["t:a", "t:b"]);

    // a 로 돌아가(이미 열린 탭 — 자리 그대로) 링크로 c 를 열면 a 바로 오른쪽에 생긴다.
    await openTab("t:a");
    expect(order()).toEqual(["t:a", "t:b"]);
    expect(active()).toBe("t:a");
    await openTab("t:c");
    expect(order()).toEqual(["t:a", "t:c", "t:b"]);
    expect(active()).toBe("t:c");

    // 맨 끝 탭에서 열면 맨 끝이다.
    await openTab("t:b");
    await openTab("t:d");
    expect(order()).toEqual(["t:a", "t:c", "t:b", "t:d"]);

    // 홈 탭을 보고 있을 때 열면 홈 바로 오른쪽(맨 앞)이다.
    await openTab("t:home");
    await openTab("t:e");
    expect(order()).toEqual(["t:e", "t:a", "t:c", "t:b", "t:d"]);
  });
});
