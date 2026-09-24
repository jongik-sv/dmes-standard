/** @vitest-environment happy-dom */

// TSK-07-03 design.md §3.4 — 항목 이력 렌더 스모크. 서버가 준 빈 구간(gapFrom)을 "닫혀 있던 구간" 줄로 그대로 끼우고(H2),
// 빈 결과면 "행이 없습니다" 를 보인다. 화면은 사건을 다시 계산하지 않는다.
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DmesUiProvider } from "@dk-oasis/shared/ui-provider";
import DataHistoryPage from "../../../pages/dmd/dataHistory/page";

const RBAC_STORE_KEY = "__dkOasisButtonRbacStore__";

let container: HTMLDivElement;
let root: Root | null = null;
const originalFetch = globalThis.fetch;
let searchResult: unknown;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const ok = (result: unknown) => jsonResponse({ data: { result }, meta: { success: true } });

const header = {
  maruDataId: "PORT",
  maruDataName: "항구",
  status: "INUSE",
  sourceKind: "MDM",
  sourceSystem: null,
  lvlCnt: 0,
  attrLabels: [],
  editable: true,
  categories: [],
};

function historyRow(over: Record<string, unknown>) {
  return { open: false, gapFrom: null, gapTo: null, name: "부산", rowVersion: 0, ...over };
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function renderAndSearch() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(createElement(DmesUiProvider, null, createElement(DataHistoryPage)));
  });
  await flush();
  const search = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.trim() === "조회");
  expect(search).toBeTruthy();
  await act(async () => {
    search!.click();
  });
  await flush();
}

describe("DataHistoryPage", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/oasis/dataHistory/view")) {
        return ok({
          maruDataOptions: [{ maruDataId: "PORT", maruDataName: "항구", status: "INUSE", sourceKind: "MDM" }],
          header,
        });
      }
      if (url.includes("/oasis/dataHistory/search")) return ok(searchResult);
      if (url.includes("/api/auth/me")) return jsonResponse({ user: { id: "tester" } });
      if (url.includes("/api/mcm/oasis/secUser/myButtonEndpoints")) {
        return jsonResponse({
          grids: { buttons: { rows: [{ objId: "*", action: "*", endpoint: "*", httpMethod: "*" }] } },
        });
      }
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
    vi.unstubAllGlobals();
    delete (globalThis as Record<string, unknown>)[RBAC_STORE_KEY];
  });

  it("빈 구간이 있는 행 앞에 닫혀 있던 구간 줄을 하나 끼운다", async () => {
    searchResult = {
      header,
      target: "ITEM",
      key: "KRPUS",
      state: "OPEN",
      rows: [
        historyRow({ validFrom: "2026-08-20 09:00:00", validTo: "2026-08-20 09:05:00", event: "CREATED", rowState: "PAST" }),
        historyRow({ validFrom: "2026-08-20 09:05:00", validTo: "2026-08-20 09:10:00", event: "CHANGED", rowState: "PAST" }),
        historyRow({
          validFrom: "2026-08-20 09:20:00",
          validTo: "9999-12-31 00:00:00",
          open: true,
          event: "REOPENED",
          rowState: "OPEN",
          gapFrom: "2026-08-20 09:10:00",
          gapTo: "2026-08-20 09:20:00",
        }),
      ],
    };
    await renderAndSearch();

    const rows = Array.from(container.querySelectorAll(".ag-center-cols-container .ag-row"));
    expect(rows).toHaveLength(4);
    const gapRows = Array.from(container.querySelectorAll('.ag-row[row-id^="gap"]'));
    expect(gapRows).toHaveLength(1);
    expect(gapRows[0].textContent).toContain("닫혀 있던 구간");
    expect(gapRows[0].textContent).toContain("2026-08-20 09:10:00");
    expect(container.querySelector('.ag-row[row-id="r2"]')?.textContent).toContain("다시 열기");
    expect(container.querySelector('.ag-row[row-id="r0"]')?.textContent).toContain("생성");
    expect(container.querySelector('[data-testid="history-state"]')?.textContent).toContain("열림");
  });

  it("빈 결과면 행이 없습니다 를 보인다", async () => {
    searchResult = { header, target: "ITEM", key: "NOPE", state: "NONE", rows: [] };
    await renderAndSearch();

    expect(container.querySelector('[data-testid="history-empty"]')?.textContent).toBe("행이 없습니다");
  });
});
