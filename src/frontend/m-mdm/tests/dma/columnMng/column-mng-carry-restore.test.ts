/** @vitest-environment happy-dom */

// 새 창 분리(popout) 복원 — 이어받은 선택 컬럼(selectedColumnId)의 상세를 서버에서 다시 읽는다.
// `openColumn` 이 도메인 이름을 목록 행에서 찾으므로, 행이 함께 왔으면 마운트 직후 한 번, 행 없이 복원돼 재조회하면 목록(search)이 도착한 뒤 한 번 부른다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import { CarryStateProvider, createCarryRegistry, type CarryRestore } from "@dk-oasis/shared/portal-shell";

import ColumnMngPage from "../../../pages/dma/columnMng/page";
import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
/** 서버로 나간 columnMng 액션 순서(search·view). */
let calls: string[] = [];

const ok = (result: unknown) => ({ meta: { success: true }, data: { result } });

const COLUMN = {
  columnId: 7,
  columnName: "강종",
  physName: "STL_GRD",
  domainId: 1,
  domainName: "코드",
  domainStdName: "CODE",
  required: false,
};

const LIGHT = { keyword: "", domainFilter: "", listTotal: null, showAll: false, selectedColumnId: 7 };

/** restore 가 null 이면 포털 탭(등록소는 있으나 복원값이 없다). */
async function render(restore: CarryRestore | null) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  const page = createElement(DmesUiProvider, null, createElement(ColumnMngPage));
  await act(async () => {
    root!.render(createElement(CarryStateProvider, { registry: createCarryRegistry(restore) }, page));
  });
  await flush();
  await flush();
  await flush();
}

beforeEach(() => {
  installDomStorage();
  calls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = url.match(/\/oasis\/columnMng\/(\w+)/);
    if (m?.[1] === "search") {
      // 진입 때 시스템 콤보만 받는 호출(optionsOnly)은 목록 조회가 아니라 세지 않는다.
      const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
      if (!params.optionsOnly) calls.push("search");
      return jsonResponse(ok({ list: [COLUMN], domains: [], systems: [] }));
    }
    if (m?.[1] === "view") {
      calls.push("view");
      return jsonResponse(ok({ column: COLUMN, systems: [], terms: [] }));
    }
    if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
    if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints"))
      return jsonResponse({ grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } } });
    return jsonResponse({}, 404);
  }) as typeof fetch;
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

describe("ColumnMngPage 새 창 분리 복원 — 선택 컬럼", () => {
  it("행과 함께 복원되면 목록은 다시 조회하지 않고 이어받은 선택 컬럼의 상세를 한 번 읽는다", async () => {
    await render({ light: LIGHT, bulky: { list: [COLUMN] }, hadBulky: true });
    expect(calls).toEqual(["view"]);
  });

  it("행 없이 복원되면 목록 재조회가 끝난 뒤에 상세를 한 번 읽는다", async () => {
    await render({ light: LIGHT, bulky: null, hadBulky: true });
    expect(calls).toEqual(["search", "view"]);
  });

  it("선택 컬럼 없이 복원되면 상세를 읽지 않는다", async () => {
    await render({ light: { ...LIGHT, selectedColumnId: null }, bulky: { list: [COLUMN] }, hadBulky: true });
    expect(calls).toEqual([]);
  });

  it("포털 탭(복원값 없음)에서는 마운트 때 아무것도 읽지 않는다", async () => {
    await render(null);
    expect(calls).toEqual([]);
  });
});
