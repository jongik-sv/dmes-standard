/** @vitest-environment happy-dom */
/**
 * 그리드 걸러 보기(AgDataGrid `filter`) — 빠른 검색 칸(GridPanel 머리줄)·「필터 창 보기」(설정 메뉴)·거른 건수를 실제 ag-grid·MantineProvider 로 그려 확인한다.
 * 열 정의 쪽(필터 종류·값 변환)은 순수 함수 buildColumnDefs 로 본다. 그리드 api 는 grid-autosave-switch-render 시험과 같이 AgGridReact.render 의 this 로 잡는다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { buildColumnDefs } from "../../src/components/grid/column-defs";
import { GRID_QUICK_FILTER_DEBOUNCE_MS } from "../../src/components/grid/GridQuickFilter";
import { GRID_FILTER_ROW_CLOSED_CLASS, GRID_FILTER_ROW_HEIGHT } from "../../src/components/grid/useGridFilter";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" },
];
const DATA = [
  { code: "A", name: "부품창고", qty: 1200 },
  { code: "B", name: "자재창고", qty: 300 },
  { code: "C", name: "부품대기", qty: 50 },
];

let r: Rendered | null = null;
let renderSpy: MockInstance;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });

function gridEl(props: Partial<AgDataGridProps> = {}) {
  return createElement(AgDataGrid, {
    columns: COLUMNS,
    rowKey: "code",
    data: DATA,
    columnSizing: "fixed",
    height: "auto",
    excelExport: false,
    personalize: false,
    ...props,
  });
}
const panel = (child: ReactElement) => createElement(GridPanel, { title: "목록", count: DATA.length }, child);
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(120);
}
function api(): GridApi {
  const seen: GridApi[] = [];
  for (const ctx of renderSpy.mock.contexts as Array<{ api?: GridApi }>) {
    if (ctx?.api && !seen.includes(ctx.api)) seen.push(ctx.api);
  }
  return seen.filter((a) => !a.isDestroyed())[0]!;
}
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
const gridBox = () => document.querySelector<HTMLElement>(".cm-data-grid")!;
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await wait(60);
  }
}
async function typeQuick(text: string) {
  const input = tid("grid-quick-filter-input") as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await wait(GRID_QUICK_FILTER_DEBOUNCE_MS + 60);
}

beforeEach(() => {
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("buildColumnDefs — filter", () => {
  const base = { sortable: true, columnSizing: "fixed" as const, shouldAutoSizeColumns: false };
  const leaf = (defs: unknown[], i: number) => defs[i] as ColDef;

  it("filter 를 켜지 않으면 열 정의에 필터 속성이 없다(예전과 같다)", () => {
    const defs = buildColumnDefs(COLUMNS, base);
    for (const d of defs) {
      expect(d).not.toHaveProperty("filter");
      expect(d).not.toHaveProperty("floatingFilter");
      expect(d).not.toHaveProperty("filterValueGetter");
    }
  });

  it("켜면 숫자형은 숫자 필터, 나머지는 글자 필터, filter:false 칸은 필터·빠른 검색에서 빠진다", () => {
    const cols: GridColumn[] = [...COLUMNS, { key: "btn", header: "", filter: false }];
    const defs = buildColumnDefs(cols, { ...base, filter: true });
    expect(leaf(defs, 0)).toMatchObject({ filter: "agTextColumnFilter", floatingFilter: true });
    expect(leaf(defs, 2)).toMatchObject({ filter: "agNumberColumnFilter", floatingFilter: true });
    expect(leaf(defs, 3)).toMatchObject({ filter: false, floatingFilter: false });
    expect((leaf(defs, 3).getQuickFilterText as () => string)()).toBe("");
  });

  it("숫자 필터는 문자열 숫자(쉼표 포함)를 숫자로, 글자 필터는 라벨·Y/N 으로 비교한다", () => {
    const cols: GridColumn[] = [
      { key: "qty", type: "number" },
      { key: "wh", cellEditorValueLabels: { KR022: "부품창고" } },
      { key: "use", type: "boolean" },
    ];
    const defs = buildColumnDefs(cols, { ...base, filter: true });
    const fv = (i: number, data: Record<string, unknown>) =>
      (leaf(defs, i).filterValueGetter as (p: { data: Record<string, unknown> }) => unknown)({ data });
    expect(fv(0, { qty: "1,234" })).toBe(1234);
    expect(fv(0, { qty: "abc" })).toBeNull();
    expect(fv(1, { wh: "KR022" })).toBe("부품창고");
    expect(fv(2, { use: true })).toBe("Y");
    const quick = (leaf(defs, 1).getQuickFilterText as (p: { value: unknown }) => string)({ value: "KR022" });
    expect(quick).toContain("KR022");
    expect(quick).toContain("부품창고");
  });
});

describe("AgDataGrid filter — GridPanel", () => {
  it("filter 를 주지 않으면 검색 칸·「필터 창 보기」 가 없다", async () => {
    await show(panel(gridEl()));
    expect(tid("grid-quick-filter")).toBeNull();
    expect(gridBox().classList.contains(GRID_FILTER_ROW_CLOSED_CLASS)).toBe(false);
  });

  it("처음에는 검색 칸만 보이고 입력 줄은 접혀 있다", async () => {
    await show(panel(gridEl({ filter: true })));
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
    expect(gridBox().classList.contains(GRID_FILTER_ROW_CLOSED_CLASS)).toBe(true);
  });

  it("검색어를 넣으면 모든 칸에서 찾고, 건수가 「보이는 행 / 전체 행」 으로 바뀐다", async () => {
    await show(panel(gridEl({ filter: true })));
    await typeQuick("부품");
    expect(api().getDisplayedRowCount()).toBe(2);
    expect(tid("grid-panel-filter-count")?.textContent).toBe("2 / 3건");
    await click(tid("grid-quick-filter-clear"));
    await wait(30);
    expect(api().getDisplayedRowCount()).toBe(3);
    expect(tid("grid-panel-filter-count")).toBeNull();
    expect(document.querySelector(".grid-panel-count")?.textContent).toBe("3건");
  });

  it("행 번호 칸은 빠른 검색에서 빠진다", async () => {
    await show(panel(gridEl({ filter: true, rowNumber: true, data: DATA.map((d) => ({ ...d, qty: 0 })) })));
    await typeQuick("1");
    expect(api().getDisplayedRowCount()).toBe(0);
  });

  it("「필터 창 보기」 를 켜면 입력 줄이 펼쳐지고, 끄면 접히면서 칸별 조건만 지운다", async () => {
    await show(panel(gridEl({ filter: true })));
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(60);
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    expect(gridBox().classList.contains(GRID_FILTER_ROW_CLOSED_CLASS)).toBe(false);

    await act(async () => {
      await api().setColumnFilterModel("qty", { filterType: "number", type: "greaterThan", filter: 100 });
      api().onFilterChanged();
    });
    await typeQuick("창고");
    expect(api().getDisplayedRowCount()).toBe(2);

    await openMenu();
    expect((tid("grid-filter-row-switch") as HTMLInputElement).checked).toBe(true);
    await click(tid("grid-filter-row-item"));
    await wait(60);
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
    expect(api().getFilterModel()).toEqual({});
    // 검색어 「창고」 는 남는다
    expect(api().getDisplayedRowCount()).toBe(2);
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("창고");
  });

  it("입력 줄을 펴고 접어도 사용자가 바꾼 칸 너비·순서는 그대로다(열 정의를 다시 넣지 않는다)", async () => {
    await show(panel(gridEl({ filter: true })));
    await act(async () => {
      api().setColumnWidths([{ key: "name", newWidth: 222 }]);
      api().moveColumns(["qty"], 0);
    });
    for (let i = 0; i < 2; i++) {
      await openMenu();
      await click(tid("grid-filter-row-item"));
      await wait(60);
    }
    expect(api().getColumn("name")!.getActualWidth()).toBe(222);
    expect(api().getAllGridColumns().map((c) => c.getColId())).toEqual(["qty", "code", "name"]);
  });

  it("settingsMenu={false} 면 검색 칸은 있고 「필터 창 보기」 는 없다", async () => {
    await show(panel(gridEl({ filter: true, settingsMenu: false })));
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    expect(tid("grid-settings-menu")).toBeNull();
  });
});

describe("AgDataGrid filter — GridPanel 밖", () => {
  it("검색 칸은 없고 설정 아이콘 메뉴에 「필터 창 보기」 가 있다", async () => {
    await show(gridEl({ filter: true }));
    expect(tid("grid-quick-filter")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")).not.toBeNull();
  });
});
