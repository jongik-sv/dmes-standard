/** @vitest-environment happy-dom */

// columnMng 컬럼 목록 그리드의 로딩 표시 — 행을 눌러 상세(view)를 부르는 동안 목록 그리드가 로딩 오버레이로 깜빡이면 안 된다.
// 목록 로딩은 목록 조회(search)만 켠다.
import { createElement, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";

const mocks = vi.hoisted(() => ({
  listGrid: { current: null as Record<string, unknown> | null },
}));

// 컬럼 목록 그리드(rowKey=columnId)의 props 만 잡는다. 그리드 자체는 그리지 않는다.
vi.mock("@dk-oasis/shared/grid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dk-oasis/shared/grid")>();
  return {
    ...actual,
    AgDataGrid: (props: Record<string, unknown>) => {
      if (props.rowKey === "columnId") mocks.listGrid.current = props;
      return null;
    },
  };
});

import ColumnMngPage from "../../../pages/dma/columnMng/page";

import { RBAC_STORE_KEY, flush, installDomStorage, jsonResponse } from "../../dme/helpers/render";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let releaseView: (() => void) | null = null;

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

async function render() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(ColumnMngPage)));
  });
  await flush();
  await flush();
}

describe("ColumnMngPage 컬럼 목록 로딩", () => {
  beforeEach(() => {
    installDomStorage();
    mocks.listGrid.current = null;
    releaseView = null;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const m = url.match(/\/oasis\/columnMng\/(\w+)/);
      if (m?.[1] === "search") return jsonResponse(ok({ list: [COLUMN], domains: [], systems: [] }));
      if (m?.[1] === "view") {
        // 상세 응답을 붙잡아 두고 그 사이의 목록 그리드 상태를 본다.
        await new Promise<void>((r) => {
          releaseView = r;
        });
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

  it("행을 눌러 상세를 부르는 동안 목록 그리드는 로딩 표시를 켜지 않는다", async () => {
    await render();
    const grid = () => mocks.listGrid.current!;
    expect(grid().loading).toBe(false);

    await act(async () => {
      (grid().onRowClick as (row: Record<string, unknown>) => void)({ columnId: 7 });
    });
    await flush();
    expect(releaseView).not.toBeNull();
    expect(grid().loading).toBe(false);

    await act(async () => {
      releaseView!();
    });
    await flush();
    expect(grid().highlightedRowKey).toBe(7);
    expect(grid().loading).toBe(false);
  });
});
