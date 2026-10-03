/** @vitest-environment happy-dom */

// 화면 첫 진입(목록 rows 비어 있음)에서 [도메인 등록] 후 부모를 검색해 고르면, 목록에 없는 부모여도 이름과 "부모 N 이하" 안내가 보인다.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import DomainMngPage from "../../../pages/dma/domainMng/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";
const originalFetch = globalThis.fetch;
let container: HTMLDivElement;
let root: Root | null = null;

const LISTED = { DOMAIN_ID: 1, PARENT_DOMAIN_ID: null, DEPTH: 0, DOMAIN_NAME: "두께", STD_NAME: "THK", DOMAIN_KIND: "QTY",
  DATA_TYPE: "NUMBER", LENGTH: 20, SCALE: 1, EFF_LENGTH: 20, EFF_SCALE: 1, EFF_STD_EXPR: "value > 0", BIZ_REQUIRED_VARS: [],
  HAS_BIZ: false, MATCHED: true, CHILD_COUNT: 0 };

const PARENT = {
  DOMAIN_ID: 4, PARENT_DOMAIN_ID: null, DEPTH: 0, DOMAIN_NAME: "판 두께", STD_NAME: "PLATE_THK", DOMAIN_KIND: "QTY",
  DATA_TYPE: "NUMBER", LENGTH: 12, SCALE: 3, EFF_LENGTH: 12, EFF_SCALE: 3, EFF_STD_EXPR: "value > 0", BIZ_REQUIRED_VARS: [],
  HAS_BIZ: false, MATCHED: true, CHILD_COUNT: 0,
};

function stubFetch() {
  globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u === "/api/auth/me") return new Response(JSON.stringify({ user: { id: "u1" } }), { status: 200 });
    if (u === "/api/mcm/oasis/secUser/myButtonEndpoints") {
      return new Response(JSON.stringify({ grids: { buttons: { rows: [
        { objId: "domainMng", action: "search" }, { objId: "domainMng", action: "save" },
      ] } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/domainMng/search")) {
      const kw = String((JSON.parse(String((init?.body as string) ?? "{}")).params ?? {}).keyword ?? "");
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: { domains: kw === "" ? [LISTED] : [PARENT] } } }), { status: 200 });
    }
    if (u.startsWith("/api/mdm/oasis/domainMng/view")) {
      return new Response(JSON.stringify({ meta: { success: true }, data: { result: { domain: { ...LISTED, DESCRIPTION: null, EXAMPLES: [], TEST_CASES: [], VER: 1 }, requiredVars: [], impact: null } } }), { status: 200 });
    }
    return new Response("{}", { status: 401 });
  }) as typeof fetch;
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

describe("domainMng 신규 — 부모 검색형 선택", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} });
    stubFetch();
  });
  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    container?.remove();
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("rows 가 비어 있어도 고른 부모의 이름과 길이·소수 안내가 보인다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(DomainMngPage)));
    });
    await settle();
    expect(container.querySelector(".domain-mng__empty")).not.toBeNull(); // 목록은 아직 비어 있다
    const startNew = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === "도메인 등록")!;
    await act(async () => {
      startNew.click();
    });
    await settle();
    const input = container.querySelector<HTMLInputElement>("[data-testid='domain-parent']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "판 두께");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(container.querySelector<HTMLInputElement>("[data-testid='domain-parent']")!.value).toBe("판 두께");
    expect(container.textContent).toContain("부모 12 이하");
    expect(container.textContent).toContain("부모 3 이하");
  });

  it("하위 도메인 등록 — 이전에 검색해 고른 부모를 이어 쓰지 않고 선택한 행이 부모가 된다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(DomainMngPage)));
    });
    await settle();
    const btn = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.trim() === label)!;
    await act(async () => {
      btn("조회").click();
    });
    await settle();
    await settle();
    // 신규에서 목록에 없는 부모(판 두께)를 골랐다가
    await act(async () => {
      btn("도메인 등록").click();
    });
    await settle();
    const input = () => container.querySelector<HTMLInputElement>("[data-testid='domain-parent']")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input(), "판 두께");
      input().dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      input().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    await settle();
    expect(input().value).toBe("판 두께");
    // 목록 행(두께)을 선택한 뒤 [하위 도메인 등록] — 부모는 방금 고른 행이다.
    const cell = Array.from(container.querySelectorAll<HTMLElement>(".ag-cell")).find((c) => c.textContent?.includes("두께"))!;
    await act(async () => {
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();
    await act(async () => {
      btn("하위 도메인 등록").click();
    });
    await settle();
    expect(input().value).toBe("두께");
    expect(container.textContent).toContain("부모 20 이하");
    expect(container.textContent).not.toContain("부모 12 이하");
  });
});
