/** @vitest-environment happy-dom */

// 첫 조회 상한(화면 성능 가이드 R1) — columnMng·termMng 의 [조회] 는 limit 을 보내고, 잘린 응답이면 「전체 N건 중 M건」 안내와
// [전체 보기] 를 보인다. [전체 보기] 는 limit 없이 다시 받고 안내를 지운다. 다시 [조회] 하면 상한 모드로 돌아간다.
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

// 그리드 자체는 그리지 않는다 — 안내 띠는 GridPanel titleExtra 라 그리드와 무관하다.
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  return { ...actual, AgDataGrid: () => null };
});

import ColumnMngPage from "../../pages/dma/columnMng/page";
import TermMngPage from "../../pages/dma/termMng/page";
import { FIRST_SEARCH_LIMIT } from "../../src/oasis-screen";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse } from "../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
/** 목록 조회(search, optionsOnly 제외) 요청의 params. */
let searchParams: Record<string, unknown>[] = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

function stubFetch(service: "columnMng" | "termMng") {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(`/oasis/${service}/search`)) {
      const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
      if (params.optionsOnly) return jsonResponse(ok({ list: [], systems: [] }));
      searchParams.push(params);
      const limited = typeof params.limit === "number";
      const rows = service === "columnMng"
        ? [{ columnId: 1, columnName: "강종", physName: "STL_GRD", required: "N" }, { columnId: 2, columnName: "두께", physName: "THK", required: "N" }]
        : [{ termId: 1, termName: "강종", senseNo: 1, definition: "", synonyms: [], aliases: [], systems: [] },
          { termId: 2, termName: "두께", senseNo: 1, definition: "", synonyms: [], aliases: [], systems: [] }];
      const list = limited ? rows.slice(0, 1) : rows;
      return jsonResponse(ok({ list, systems: [], ...(limited ? { totalCount: 2, truncated: true } : {}) }));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints"))
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
    return jsonResponse({}, 404);
  }) as typeof fetch;
}

async function render(page: ComponentType) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(page)));
  });
  await flush();
  await flush();
}

async function click(el: HTMLElement) {
  await act(async () => el.click());
  await flush();
  await flush();
}

const pressSearch = () => click(findButton(container.querySelector(".page-layout__header-buttons")!, "조회"));

describe.each([
  { name: "columnMng", page: ColumnMngPage, testId: "column-list-limit" },
  { name: "termMng", page: TermMngPage, testId: "term-list-limit" },
] as const)("$name 첫 조회 상한", ({ name, page, testId }) => {
  beforeEach(() => {
    installDomStorage();
    searchParams = [];
    stubFetch(name);
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
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

  it("[조회] 는 limit 을 보내고, 잘리면 안내·[전체 보기] → 누르면 limit 없이 받고 안내가 사라진다", async () => {
    await render(page);
    expect(container.querySelector(`[data-testid="${testId}"]`)).toBeNull();

    await pressSearch();
    expect(searchParams.at(-1)!.limit).toBe(FIRST_SEARCH_LIMIT);
    const notice = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    expect(notice?.textContent).toContain("전체 2건 중 1건을 표시합니다.");

    await click(container.querySelector<HTMLElement>(`[data-testid="${testId}-show-all"]`)!);
    expect(searchParams).toHaveLength(2);
    expect(searchParams[1]).not.toHaveProperty("limit");
    expect(container.querySelector(`[data-testid="${testId}"]`)).toBeNull();

    await pressSearch();
    expect(searchParams[2].limit).toBe(FIRST_SEARCH_LIMIT);
    expect(container.querySelector(`[data-testid="${testId}"]`)).not.toBeNull();
  });
});
