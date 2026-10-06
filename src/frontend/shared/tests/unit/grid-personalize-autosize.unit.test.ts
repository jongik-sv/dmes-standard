/** @vitest-environment happy-dom */
/**
 * 컬럼 개인화(C2) × 자동 너비 흐름 회귀 고정.
 *
 * 기대 문자열은 개인화 전 코드(de442cdc 의 AgDataGrid.tsx)를 같은 기록기(traceAutoSize)로 돌려 얻은 값이다
 * (2026-10-06, 임시 파일로 꺼내 실행 — 저장소에는 두지 않는다). 시나리오: 폭 900 마운트 → 데이터 갱신 → 폭 1300 (gridSizeChanged).
 * 저장값이 없거나 저장 너비가 없는 그리드는 이 호출 순서와 너비가 글자 그대로 같아야 한다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgDataGrid } from "../../src/components/grid/AgDataGrid";
import { gridPrefKey, type GridPrefs } from "../../src/components/grid/grid-personalize";
import { GRID_PERSONALIZE_SAVE_DEBOUNCE_MS } from "../../src/components/grid/grid-personalize-hook";
import { installMemoryLocalStorage, seedCurrentUser, traceAutoSize } from "./grid-personalize-test-env";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const ls = installMemoryLocalStorage();

/** de442cdc 에서 얻은 기록(정렬 클릭이 있어도 같다). */
const BASELINE = {
  auto: "autoSizeAllColumns sizeColumnsToFit data autoSizeAllColumns sizeColumnsToFit resize sizeColumnsToFit || code=50 name=50 qty=50",
  fixed: "sizeColumnsToFit data sizeColumnsToFit resize sizeColumnsToFit || code=100 name=120 qty=90",
  fit: "data resize || code=200 name=200 qty=200",
} as const;

const SCREEN = "trace-screen";
const KEY = gridPrefKey("u1", SCREEN, "main");
const Grid = AgDataGrid as never;

let container: HTMLDivElement;
let root: Root;

function wait(ms: number) {
  return act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
/** 헤더 클릭 정렬을 흉내 낸다 — 상태는 api 로, 저장 판정은 UI source 이벤트로. */
async function sortClick(api: GridApi) {
  await act(async () => void api.applyColumnState({ state: [{ colId: "name", sort: "asc" }] }));
  await act(async () => void api.dispatchEvent({ type: "sortChanged", source: "uiColumnSorted" } as never));
  await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 100);
}
function saved(): GridPrefs | null {
  const raw = ls.getItem(KEY);
  return raw ? (JSON.parse(raw) as GridPrefs) : null;
}

beforeEach(() => {
  ls.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
});

describe("저장값 없는 그리드 — de442cdc 와 같은 자동 너비 호출", () => {
  for (const columnSizing of ["auto", "fixed", "fit"] as const) {
    it(`${columnSizing}: 사용자 확인 전`, async () => {
      expect(await traceAutoSize({ root, Grid, columnSizing })).toBe(BASELINE[columnSizing]);
    });
    it(`${columnSizing}: 사용자 확인 뒤·저장값 없음`, async () => {
      await seedCurrentUser("u1");
      expect(await traceAutoSize({ root, Grid, columnSizing })).toBe(BASELINE[columnSizing]);
      expect(ls.length).toBe(0);
    });
    it(`${columnSizing}: personalize=false`, async () => {
      await seedCurrentUser("u1");
      expect(await traceAutoSize({ root, Grid, columnSizing, props: { personalize: false } })).toBe(BASELINE[columnSizing]);
    });
  }

  it("auto: 정렬 클릭(저장됨) 뒤 데이터 갱신에도 autoSizeAllColumns 가 돈다 — 저장값에 너비가 없다", async () => {
    await seedCurrentUser("u1");
    expect(await traceAutoSize({ root, Grid, columnSizing: "auto", beforeData: sortClick })).toBe(BASELINE.auto);
    expect(saved()!.sort).toEqual([{ colId: "name", sort: "asc" }]);
    expect(saved()!.cols.every((c) => c.width == null)).toBe(true);
  });

  it("fixed: 정렬 뒤 창을 넓히면 여백 분배(sizeColumnsToFit)가 돈다", async () => {
    await seedCurrentUser("u1");
    expect(await traceAutoSize({ root, Grid, columnSizing: "fixed", beforeData: sortClick })).toBe(BASELINE.fixed);
    expect(saved()).not.toBeNull();
  });

  it("fit: 정렬을 저장해도 호출이 같다", async () => {
    await seedCurrentUser("u1");
    expect(await traceAutoSize({ root, Grid, columnSizing: "fit", beforeData: sortClick })).toBe(BASELINE.fit);
  });

  it("정렬·순서만 저장된 그리드를 다시 열어도 호출이 같다(저장 너비가 없으면 잠그지 않음)", async () => {
    await seedCurrentUser("u1");
    ls.setItem(KEY, JSON.stringify({ v: 1, savedAt: 1, cols: [{ colId: "qty" }, { colId: "code" }, { colId: "name" }], sort: [{ colId: "name", sort: "asc" }] }));
    const line = await traceAutoSize({ root, Grid, columnSizing: "auto" });
    expect(line.split(" || ")[0]).toBe(BASELINE.auto.split(" || ")[0]);
  });
});

describe("저장 너비가 있는 컬럼만 잠금", () => {
  it("한 컬럼만 끌어 바꾸면 그 컬럼만 저장되고, 다시 열면 그 컬럼만 빼고 자동 너비·여백 분배가 돈다", async () => {
    await seedCurrentUser("u1");
    // 1회차: code 만 끌어 바꾼다
    await traceAutoSize({
      root,
      Grid,
      columnSizing: "auto",
      beforeData: async (api) => {
        await act(async () => void api.setColumnWidths([{ key: "code", newWidth: 333 }]));
        await act(
          async () =>
            void api.dispatchEvent({ type: "columnResized", source: "uiColumnResized", finished: true, columns: [api.getColumn("code")] } as never),
        );
        await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 100);
      },
    });
    expect(saved()!.cols.map((c) => [c.colId, c.width])).toEqual([
      ["code", 333],
      ["name", undefined],
      ["qty", undefined],
    ]);
    await act(async () => root.unmount());
    root = createRoot(container);

    // 2회차: 다시 연다 — code 는 333 으로 복원, 나머지만 자동 너비
    const line = await traceAutoSize({ root, Grid, columnSizing: "auto" });
    const [calls, widths] = line.split(" || ");
    expect(calls).not.toContain("autoSizeAllColumns");
    expect(calls).toContain("autoSizeColumns(name,qty)");
    expect(calls.split(" ").filter((c) => c === "data" || c === "resize")).toEqual(["data", "resize"]);
    expect(calls.split(" data ")[1]).toMatch(/^autoSizeColumns\(name,qty\) sizeColumnsToFit resize sizeColumnsToFit$/);
    expect(widths).toContain("code=333");
  });

  it("fixed: 저장 너비 컬럼은 여백 분배 때 minWidth·maxWidth 를 저장 너비로 고정한다", async () => {
    await seedCurrentUser("u1");
    ls.setItem(KEY, JSON.stringify({ v: 1, savedAt: 1, cols: [{ colId: "code", width: 140 }, { colId: "name" }, { colId: "qty" }] }));
    const limits: unknown[] = [];
    const { AgGridReact } = await import("ag-grid-react");
    const renderSpy = vi.spyOn(AgGridReact.prototype, "render");
    const orig = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth")!;
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
      return this.classList?.contains("cm-data-grid") ? 900 : (orig.get!.call(this) as number);
    });
    const { createElement } = await import("react");
    const { TabPageContext } = await import("../../src/portal-shell/tab-page-context");
    await act(async () =>
      root.render(
        createElement(
          TabPageContext.Provider,
          { value: { pageId: SCREEN, serviceId: "", tabId: "x" } },
          createElement(AgDataGrid, {
            columns: [
              { key: "code", width: 100 },
              { key: "name", width: 120 },
              { key: "qty", width: 90 },
            ],
            rowKey: "code",
            data: [{ code: "A", name: "a", qty: 1 }],
            columnSizing: "fixed",
          }),
        ),
      ),
    );
    const api = (renderSpy.mock.contexts as Array<{ api?: GridApi }>).map((c) => c?.api).filter(Boolean).at(-1)!;
    vi.spyOn(api, "sizeColumnsToFit").mockImplementation(((p: { columnLimits?: unknown[] }) => {
      limits.push(p.columnLimits);
    }) as never);
    await wait(400);
    expect(api.getColumn("code")!.getActualWidth()).toBe(140);
    expect(limits.at(-1)).toEqual([
      { key: "code", minWidth: 140, maxWidth: 140 },
      { key: "name", minWidth: 120 },
      { key: "qty", minWidth: 90 },
    ]);
  });
});
