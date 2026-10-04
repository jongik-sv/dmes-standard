/** @vitest-environment happy-dom */

// layoutMng 헤더 추가 팝업 — 선택 목록은 항목 없이(withoutItems) 오고, 행을 고르면 그 헤더 한 건(headerLayoutId)의 항목을 따로 받아 쌓는다.
// 모든 헤더의 항목을 한 번에 받지 않는다(화면 성능 가이드 R1·응답 크기).
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import LayoutMngPage from "../../../pages/dmb/layoutMng/page";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse, settleGrid } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let searchParams: Record<string, unknown>[] = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });
const ITEM = { SEQ: 1, FILL_KIND: "CONST", COLUMN_PHYS: "LINE_CODE", DISPLAY_NAME: "라인", DOMAIN_LENGTH: 2, DATA_TYPE: "STRING", OFFSET: 0, LENGTH: 2,
  DEFAULT_VALUE: "B1" };

beforeEach(() => {
  installDomStorage();
  searchParams = [];
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/oasis/layoutMng/search")) {
      const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
      searchParams.push(params);
      if (params.target === "HEADER") {
        const row = { LAYOUT_ID: 11, LAYOUT_NAME: "L2 구간 헤더", TOTAL_LENGTH: 30, EAI_CODE: null };
        // 한 건 요청이면 항목을 싣고, 목록 요청(withoutItems)이면 항목 키 자체가 없다
        return jsonResponse(ok({ headers: [params.headerLayoutId ? { ...row, items: [ITEM] } : row] }));
      }
      return jsonResponse(ok({ layouts: [], systems: [], eais: [], headers: [] }));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints"))
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
    return jsonResponse({}, 404);
  }) as typeof fetch;
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  root = null;
  container?.remove();
  globalThis.fetch = originalFetch;
  delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
});

async function click(el: HTMLElement) {
  await act(async () => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await flush();
  await flush();
}

describe("layoutMng 헤더 추가 팝업", () => {
  it("목록은 항목 없이 받고, 행을 고르면 그 헤더 한 건의 항목을 받아 쌓는다", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(createElement(DmesUiProvider, null, createElement(LayoutMngPage)));
    });
    await flush();
    await flush();

    await click(findButton(container.querySelector(".page-layout__header-buttons")!, "신규"));
    await click(container.querySelector<HTMLElement>("[data-testid=layout-header-add]")!);
    // 선택 목록 요청 — 항목을 빼는 옵션이 붙고 한 건 지정은 없다
    const listCall = searchParams.find((p) => p.target === "HEADER")!;
    expect(listCall.withoutItems).toBe(true);
    expect(listCall).not.toHaveProperty("headerLayoutId");

    const modal = document.querySelector("[data-testid=header-pick-modal]")!;
    await settleGrid(modal);
    await click(modal.querySelector<HTMLElement>(".ag-row .ag-cell")!);

    // 고른 헤더 한 건을 따로 받는다
    const detailCall = searchParams.filter((p) => p.target === "HEADER").at(-1)!;
    expect(detailCall.headerLayoutId).toBe(11);
    expect(detailCall).not.toHaveProperty("withoutItems");
    // 쌓인 헤더 행이 생기고 항목(상수 편집 단추)이 따라왔다
    const stack = document.querySelector("[data-testid=layout-header-stack]")!;
    expect(stack.textContent).toContain("L2 구간 헤더");
    expect(document.querySelector("[data-testid=const-edit-open-1]")).not.toBeNull();
    // 쌓은 헤더는 팝업 목록에서 빠진다(L09)
    expect(document.querySelector("[data-testid=header-pick-modal]")?.textContent ?? "").toContain("더 쌓을 헤더가 없습니다");
  });
});
