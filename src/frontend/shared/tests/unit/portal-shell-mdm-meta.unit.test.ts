/** @vitest-environment happy-dom */
/**
 * 포털 탭 본문이 MdmMetaProvider 로 감싸지는지(spec B7) — 화면은 아무것도 하지 않아도 탭 pageId 의 모듈로 메타를 받는다.
 */
import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PortalShell } from "../../src/portal-shell/portal-shell";
import type { PortalShellPageComponent } from "../../src/portal-shell/types";
import { resetMdmMetaStore, useMdmColumn, useMdmMetaScope } from "../../src/mdm-meta";
import { renderWithMantine, type Rendered } from "./mantine-test-utils";
import { TITLE, settle } from "./mdm-meta-fixtures";

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

describe("PortalShell 탭 MDM 메타 공급자", () => {
  let rendered: Rendered | null = null;
  const urls: string[] = [];

  beforeEach(() => {
    resetMdmMetaStore();
    urls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        if (url.endsWith("/mdmMeta/columns")) {
          return new Response(JSON.stringify({ items: { TITLE }, missing: [], unavailable: [] }), { status: 200 });
        }
        if (url.endsWith("/mdmMeta/domains")) {
          return new Response(JSON.stringify({ items: {}, missing: ["D_TEXT"], unavailable: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ authenticated: false, user: null }), { status: 200 });
      })
    );
  });

  afterEach(() => {
    rendered?.unmount();
    rendered = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("탭 화면이 pageId 모듈(mls)로 메타를 받는다", async () => {
    const Page: PortalShellPageComponent = () => {
      const scope = useMdmMetaScope();
      const info = useMdmColumn("title");
      return createElement("div", { "data-testid": "page" }, `${scope?.module}|${info.column?.labelShort ?? ""}`);
    };
    rendered = renderWithMantine(
      createElement(PortalShell, {
        appName: "TEST",
        menu: { items: [] },
        resolvePage: async () => Page,
        homePageId: "mls:lsh/noticeMgmt",
        storageKey: `portal-shell-mdm-meta-${Math.random()}`,
      })
    );
    await act(async () => {
      await settle(80);
    });
    await act(async () => {
      await settle(80);
    });
    expect(document.querySelector('[data-testid="page"]')?.textContent).toBe("mls|제목");
    expect(urls).toContain("/api/mls/mdmMeta/columns");
  });

  // mdmMeta 엔드포인트가 없는 모듈(analog)은 첫 404 를 기다리지 않고 미리 끈다(2026-10-05 F7).
  it("엔드포인트가 없는 모듈 탭(analog)은 mdmMeta 를 부르지 않는다", async () => {
    const Page: PortalShellPageComponent = () => {
      const scope = useMdmMetaScope();
      const info = useMdmColumn("title");
      return createElement("div", { "data-testid": "page" }, `${scope?.disabled}|${info.loading}|${info.column?.labelShort ?? ""}`);
    };
    rendered = renderWithMantine(
      createElement(PortalShell, {
        appName: "TEST",
        menu: { items: [] },
        resolvePage: async () => Page,
        homePageId: "analog:anl/logViewer",
        storageKey: `portal-shell-mdm-meta-${Math.random()}`,
      })
    );
    await act(async () => {
      await settle(80);
    });
    await act(async () => {
      await settle(80);
    });
    expect(document.querySelector('[data-testid="page"]')?.textContent).toBe("true|false|");
    expect(urls.filter((u) => u.includes("/mdmMeta/"))).toEqual([]);
  });

  // MDM 서버는 mdmMeta 가 없고(/api/mdm/mdmMeta 404) mcm 이 같은 컬럼 사전을 준다 — mdm 탭은 끄지 않고 mcm 으로 부른다(2026-10-05).
  it("mdm 탭은 메타를 mcm 모듈로 받는다", async () => {
    const Page: PortalShellPageComponent = () => {
      const scope = useMdmMetaScope();
      const info = useMdmColumn("title");
      return createElement("div", { "data-testid": "page" }, `${scope?.module}|${scope?.disabled}|${info.column?.labelShort ?? ""}`);
    };
    rendered = renderWithMantine(
      createElement(PortalShell, {
        appName: "TEST",
        menu: { items: [] },
        resolvePage: async () => Page,
        homePageId: "mdm:dme/ruleEdit",
        storageKey: `portal-shell-mdm-meta-${Math.random()}`,
      })
    );
    await act(async () => {
      await settle(80);
    });
    await act(async () => {
      await settle(80);
    });
    expect(document.querySelector('[data-testid="page"]')?.textContent).toBe("mcm|false|제목");
    const metaUrls = urls.filter((u) => u.includes("/mdmMeta/"));
    expect(metaUrls).toContain("/api/mcm/mdmMeta/columns");
    expect(metaUrls.some((u) => u.startsWith("/api/mdm/"))).toBe(false);
  });
});
