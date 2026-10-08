/** @vitest-environment happy-dom */

// 첫 조회 상한(화면 성능 가이드 R1) — headerMng·layoutConfirm·layoutMng 의 [조회] 는 limit 을 보내고, 잘린 응답이면 「전체 N건 중 M건」
// 안내와 [전체 보기] 를 보인다. [전체 보기] 는 limit 없이 다시 받고 안내를 지운다. 다시 [조회] 하면 상한 모드로 돌아간다.
// layoutMng 는 헤더 추가 팝업 목록이 항목 없이 오고(withoutItems), 헤더를 고를 때 그 한 건의 항목을 따로 받는다.
import { act, createElement, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

// 그리드 자체는 그리지 않는다 — 안내 띠는 그리드와 무관하다.
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  return { ...actual, AgDataGrid: () => null };
});

import HeaderMngPage from "../../pages/dmb/headerMng/page";
import LayoutConfirmPage from "../../pages/dmb/layoutConfirm/page";
import LayoutMngPage from "../../pages/dmb/layoutMng/page";
import { FIRST_SEARCH_LIMIT } from "../../src/oasis-screen";
import { RBAC_STORE_KEY, findButton, flush, installDomStorage, jsonResponse } from "../dme/helpers/render";

/** 상단 버튼 줄의 [조회] 단추 — 확정 화면은 조회 영역(SearchArea) + 상단 조회 단추 구조다. */
const searchButton = () =>
  Array.from(document.querySelectorAll(".page-layout__header-buttons button")).find((b) => b.textContent === "조회") as HTMLElement;

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
/** 목록 조회(search, optionsOnly 제외) 요청의 params. */
let searchParams: Record<string, unknown>[] = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

type Service = "headerMng" | "layoutConfirm" | "layoutMng";

const HEADERS = [{ LAYOUT_ID: 1, LAYOUT_NAME: "GLUE 공통 헤더", ITEM_COUNT: 13, TOTAL_LENGTH: 100, USED_BY_COUNT: 1, AUD_VER: 1 },
  { LAYOUT_ID: 2, LAYOUT_NAME: "L2 구간 헤더", ITEM_COUNT: 6, TOTAL_LENGTH: 30, USED_BY_COUNT: 0, AUD_VER: 1 }];
const LAYOUTS = [{ LAYOUT_ID: 30, LAYOUT_NAME: "출측검사 실적 수신", ITEM_COUNT: 4, TOTAL_LENGTH: 187, STATUS: "INUSE", AUD_VER: 1 },
  { LAYOUT_ID: 31, LAYOUT_NAME: "입측검사 실적 수신", ITEM_COUNT: 4, TOTAL_LENGTH: 187, STATUS: "INUSE", AUD_VER: 1 }];
const DRAFTS = [{ LAYOUT_ID: 1, LAYOUT_KIND: "HEADER", LAYOUT_NAME: "GLUE 공통 헤더", VER: "2.000", VER_KIND: "MAJOR", OWNER_ID: "tester", ROW_VERSION: 0, BASE_VER: "1.000" },
  { LAYOUT_ID: 30, LAYOUT_KIND: "MESSAGE", LAYOUT_NAME: "출측검사 실적 수신", VER: "1.001", VER_KIND: "MINOR", OWNER_ID: "tester", ROW_VERSION: 0, BASE_VER: "1.000" }];

function stubFetch(service: Service) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes(`/oasis/${service}/search`)) {
      const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
      if (params.optionsOnly) return jsonResponse(ok({ headers: [], layouts: [], eais: [], systems: [] }));
      searchParams.push(params);
      const limited = typeof params.limit === "number";
      const meta = limited ? { totalCount: 2, truncated: true } : {};
      if (service === "headerMng") return jsonResponse(ok({ headers: limited ? HEADERS.slice(0, 1) : HEADERS, eais: [], ...meta }));
      if (service === "layoutMng") return jsonResponse(ok({ layouts: limited ? LAYOUTS.slice(0, 1) : LAYOUTS, systems: [], eais: [], headers: [], ...meta }));
      return jsonResponse(ok({ rows: limited ? DRAFTS.slice(0, 1) : DRAFTS, ...meta }));
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
const q = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`);

describe.each([
  { name: "headerMng", page: HeaderMngPage, testId: "header-list-limit" },
  { name: "layoutMng", page: LayoutMngPage, testId: "layout-list-limit" },
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
    expect(q(testId)).toBeNull();

    await pressSearch();
    expect(searchParams.at(-1)!.limit).toBe(FIRST_SEARCH_LIMIT);
    expect(q(testId)?.textContent).toContain("전체 2건 중 1건을 표시합니다.");

    await click(q(`${testId}-show-all`)!);
    expect(searchParams).toHaveLength(2);
    expect(searchParams[1]).not.toHaveProperty("limit");
    expect(q(testId)).toBeNull();

    await pressSearch();
    expect(searchParams[2].limit).toBe(FIRST_SEARCH_LIMIT);
    expect(q(testId)).not.toBeNull();
  });
});

describe("layoutConfirm 첫 조회 상한", () => {
  beforeEach(() => {
    installDomStorage();
    searchParams = [];
    stubFetch("layoutConfirm");
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

  it("진입 자동 조회와 [조회] 는 limit 을 보내고, [전체 보기] 는 limit 없이 받아 안내를 지운다", async () => {
    await render(LayoutConfirmPage as ComponentType);
    // 진입 자동 조회(refreshList(""))도 상한을 건다
    expect(searchParams).toHaveLength(1);
    expect(searchParams[0].limit).toBe(FIRST_SEARCH_LIMIT);
    expect(q("lc-list-limit")?.textContent).toContain("전체 2건 중 1건을 표시합니다.");

    await click(q("lc-list-limit-show-all")!);
    expect(searchParams).toHaveLength(2);
    expect(searchParams[1]).not.toHaveProperty("limit");
    expect(q("lc-list-limit")).toBeNull();

    await click(searchButton());
    expect(searchParams[2].limit).toBe(FIRST_SEARCH_LIMIT);
    expect(q("lc-list-limit")).not.toBeNull();
  });
});
