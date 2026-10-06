/** @vitest-environment happy-dom */

// 새 창 분리(popout) 복원 — 이어받은 선택 컬럼(selectedColumnId)의 상세를 마운트 직후 한 번 서버에서 다시 읽는다.
// 목록 도착을 기다리지 않는다(기다리면 0건·재조회 실패 때 대기가 남아 나중 [조회]·저장이 이어받은 컬럼을 몰래 열어 작성 중인 폼을 덮는다).
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
/** 서버로 나간 columnMng 액션 순서(search·view:{컬럼 ID}·save). */
let calls: string[] = [];
/** search 응답 방식 — ok(1건)·empty(0건)·fail(서버 오류). */
let searchMode: "ok" | "empty" | "fail" = "ok";

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
  searchMode = "ok";
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = url.match(/\/oasis\/columnMng\/(\w+)/);
    const params = (JSON.parse(String(init?.body ?? "{}")).params ?? {}) as Record<string, unknown>;
    if (m?.[1] === "search") {
      // 진입 때 시스템 콤보만 받는 호출(optionsOnly)은 목록 조회가 아니라 세지 않는다.
      if (params.optionsOnly) return jsonResponse(ok({ list: [], domains: [], systems: [] }));
      calls.push("search");
      if (searchMode === "fail") return jsonResponse({ meta: { success: false, message: "조회 실패" }, data: {} });
      return jsonResponse(ok({ list: searchMode === "empty" ? [] : [COLUMN], domains: [], systems: [] }));
    }
    if (m?.[1] === "view") {
      const id = Number(params.columnId);
      calls.push(`view:${id}`);
      return jsonResponse(ok({ column: { ...COLUMN, columnId: id }, systems: [], terms: [{ termId: 1, termName: "강", missing: false }] }));
    }
    if (m?.[1] === "save") {
      calls.push("save");
      return jsonResponse(ok({ columnId: 9 }));
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

/** 화면 위 버튼(조회·저장 등)을 글자로 찾아 누른다. */
async function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === label);
  expect(button, `${label} 버튼`).toBeTruthy();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  await flush();
  await flush();
}

describe("ColumnMngPage 새 창 분리 복원 — 선택 컬럼", () => {
  it("행과 함께 복원되면 목록은 다시 조회하지 않고 이어받은 선택 컬럼의 상세를 한 번 읽는다", async () => {
    await render({ light: LIGHT, bulky: { list: [COLUMN] }, hadBulky: true });
    expect(calls).toEqual(["view:7"]);
  });

  it("행 없이 복원되면 목록 재조회와 별개로 상세를 마운트 직후 한 번 읽는다(목록을 기다리지 않는다)", async () => {
    await render({ light: LIGHT, bulky: null, hadBulky: true });
    expect([...calls].sort()).toEqual(["search", "view:7"]);
  });

  it("선택 컬럼 없이 복원되면 상세를 읽지 않는다", async () => {
    await render({ light: { ...LIGHT, selectedColumnId: null }, bulky: { list: [COLUMN] }, hadBulky: true });
    expect(calls).toEqual([]);
  });

  it("포털 탭(복원값 없음)에서는 마운트 때 아무것도 읽지 않는다", async () => {
    await render(null);
    expect(calls).toEqual([]);
  });

  it("0건으로 carry 돼 재조회가 없어도 이어받은 컬럼은 마운트 때 한 번만 열고, 나중 [조회] 가 다시 열지 않는다", async () => {
    await render({ light: LIGHT, bulky: { list: [] }, hadBulky: false });
    expect(calls).toEqual(["view:7"]);
    await clickButton("조회");
    expect(calls).toEqual(["view:7", "search"]);
  });

  it("재조회가 실패해도 이어받은 컬럼은 한 번만 열고, 나중 [조회] 가 다시 열지 않는다", async () => {
    searchMode = "fail";
    await render({ light: LIGHT, bulky: null, hadBulky: true });
    expect(calls.filter((c) => c.startsWith("view"))).toEqual(["view:7"]);
    searchMode = "ok";
    calls = [];
    await clickButton("조회");
    expect(calls).toEqual(["search"]);
  });

  it("재조회가 0건이어도 나중 [조회] 가 이어받은 컬럼을 다시 열지 않는다", async () => {
    searchMode = "empty";
    await render({ light: LIGHT, bulky: null, hadBulky: true });
    searchMode = "ok";
    calls = [];
    await clickButton("조회");
    expect(calls).toEqual(["search"]);
  });

  it("신규 저장 뒤에는 저장한 컬럼만 열고 이어받은 컬럼을 다시 열지 않는다", async () => {
    searchMode = "empty";
    await render({ light: LIGHT, bulky: { list: [] }, hadBulky: false });
    expect(calls).toEqual(["view:7"]);
    calls = [];
    searchMode = "ok";
    await clickButton("저장");
    expect(calls).toEqual(["save", "search", "view:9"]);
  });
});
