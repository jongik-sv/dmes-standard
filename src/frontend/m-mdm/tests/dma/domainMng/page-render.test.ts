/** @vitest-environment happy-dom */

// TSK-04-03 design.md §4.5 — 화면 렌더(스모크 넷 2): search 가 0행이면 빈 상태 문구, 행이 있으면 들여쓴 이름.
// PageLayout 이 /api/auth/me·버튼 RBAC 를 부르므로 fetch 를 URL 별로 스텁하고 RBAC 저장소를 지운다(선례 mdm-page-layout.test.ts).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import DomainMngPage from "../../../pages/dma/domainMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;

function stubFetch(domains: unknown[]) {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.startsWith("/api/mdm/oasis/domainMng/search")) {
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: { domains } } }), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
}

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DomainMngPage)));
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

describe("domainMng page", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    // apiRequest 가 토큰을 localStorage 에서 읽는다 — 이 happy-dom 환경에는 저장소가 없어 스텁한다.
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("조회 결과가 없으면 빈 상태 문구가 보인다", async () => {
    stubFetch([]);
    await render();
    expect(container.querySelector(".page-layout__footer-screen-id")?.textContent).toBe("domainMng");
    expect(container.querySelector(".domain-mng__empty")?.textContent).toBe("조회된 도메인이 없습니다");
  });

  it("행이 있으면 들여쓴 이름이 보인다", async () => {
    stubFetch([
      { DOMAIN_ID: 1, PARENT_DOMAIN_ID: null, DEPTH: 0, DOMAIN_NAME: "두께", STD_NAME: "THK", DOMAIN_KIND: "QTY",
        DATA_TYPE: "NUMBER", EFF_STD_EXPR: "value > 0", BIZ_REQUIRED_VARS: [], MATCHED: true, CHILD_COUNT: 1 },
      { DOMAIN_ID: 2, PARENT_DOMAIN_ID: 1, DEPTH: 1, DOMAIN_NAME: "코일 두께", STD_NAME: "COIL_THK", DOMAIN_KIND: "QTY",
        DATA_TYPE: "NUMBER", EFF_STD_EXPR: "(value > 0) && (value < 9)", BIZ_REQUIRED_VARS: [], MATCHED: true, CHILD_COUNT: 0 },
    ]);
    await render();
    expect(container.querySelector(".domain-mng__empty")).toBeNull();
    expect(container.querySelector(".domain-mng__count")?.textContent).toBe("도메인 2건");
    expect(container.textContent).toContain("└ 코일 두께");
  });
});
