/** @vitest-environment happy-dom */
/**
 * 그리드 빠른 검색 기본 표시 — `filter` 를 생략한 GridPanel 안 그리드는 검색 칸이 늘 보이고, 설정 메뉴 「칸별 필터 보기」 는 입력 줄만 켠다.
 * 예외(filter={false}·서버 페이징·대화 상자·GridPanel 밖)와 늘 켜지면서 생기는 부작용(숨은 행 선택·검색어 저장 안 함·데이터 변경·행추가)을 실제 ag-grid 로 확인한다.
 * 입력 줄·켜짐 기억은 grid-filter·grid-filter-memory 시험이 본다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel, type GridPanelProps } from "../../src/components/grid/GridPanel";
import { GRID_QUICK_FILTER_DEBOUNCE_MS } from "../../src/components/grid/GridQuickFilter";
import { GRID_FILTER_ROW_HEIGHT } from "../../src/components/grid/useGridFilter";
import { GRID_SETTINGS_LABELS } from "../../src/components/grid/grid-settings-labels";
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
const panel = (child: ReactElement, props: Partial<GridPanelProps> = {}) => createElement(GridPanel, { title: "목록", count: DATA.length, ...props }, child);
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
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await wait(60);
  }
}
async function toggleRow() {
  await openMenu();
  await click(tid("grid-filter-row-item"));
  await wait(80);
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
const quickText = () => (tid("grid-quick-filter-input") as HTMLInputElement).value;

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

describe("기본 표시 — filter 생략 GridPanel 그리드", () => {
  it("메뉴를 켜지 않아도 검색 칸이 보이고, 검색어로 모든 칸을 찾는다(열 정의에 필터를 달지 않아도)", async () => {
    await show(panel(gridEl()));
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    expect(document.querySelectorAll(".ag-floating-filter").length).toBe(0);
    for (const d of api().getColumnDefs() as ColDef[]) expect(d).not.toHaveProperty("filter");

    await typeQuick("부품");
    expect(api().getDisplayedRowCount()).toBe(2);
    expect(tid("grid-panel-filter-count")?.textContent).toBe("2 / 3건");
    // 숫자 칸도 찾는다
    await typeQuick("1200");
    expect(api().getDisplayedRowCount()).toBe(1);
  });

  it("메뉴 항목은 「칸별 필터 보기」 — 입력 줄만 켜고 끄며 검색 칸·검색어는 그대로다", async () => {
    await show(panel(gridEl()));
    await typeQuick("창고");
    await openMenu();
    const item = tid("grid-filter-row-item")!;
    expect(item.textContent).toBe(GRID_SETTINGS_LABELS.filterRow);
    expect(GRID_SETTINGS_LABELS.filterRow).toBe("칸별 필터 보기");
    await click(item);
    await wait(80);
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    expect(quickText()).toBe("창고");
    expect(api().getDisplayedRowCount()).toBe(2);
    await toggleRow();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
    expect(quickText()).toBe("창고");
    expect(api().getDisplayedRowCount()).toBe(2);
  });

  it("검색어는 저장하지 않는다 — 새로 열면 빈 칸이고 행이 숨지 않는다", async () => {
    await show(panel(gridEl()));
    await typeQuick("창고");
    await act(async () => r?.unmount());
    r = null;
    document.body.innerHTML = "";
    await show(panel(gridEl()));
    expect(quickText()).toBe("");
    expect(api().getGridOption("quickFilterText")).toBe("");
    expect(api().getDisplayedRowCount()).toBe(3);
  });

  it("그리드 데이터가 바뀌어도 검색어가 유지되고 새 데이터에도 적용된다", async () => {
    await show(panel(gridEl()));
    await typeQuick("창고");
    expect(api().getDisplayedRowCount()).toBe(2);
    const next = [...DATA, { code: "D", name: "완제품창고", qty: 7 }, { code: "E", name: "공구", qty: 8 }];
    await show(panel(gridEl({ data: next }, ), { count: next.length }));
    expect(quickText()).toBe("창고");
    expect(api().getDisplayedRowCount()).toBe(3);
    expect(tid("grid-panel-filter-count")?.textContent).toBe("3 / 5건");
  });
});

describe("예외 — 검색 칸을 기본으로 두지 않는 경우", () => {
  it("filter={false} 는 검색 칸·메뉴 항목이 없다(기존 뜻 유지)", async () => {
    await show(panel(gridEl({ filter: false, excelExport: undefined })));
    expect(tid("grid-quick-filter")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")).toBeNull();
  });

  it("settingsMenu={false} 그리드는 설정 메뉴가 없어 검색 칸도 없다(작은 읽기 전용 표)", async () => {
    await show(panel(gridEl({ settingsMenu: false })));
    expect(tid("grid-quick-filter")).toBeNull();
  });

  it("대화 상자 안 그리드는 GridPanel 안이어도 검색 칸이 없다", async () => {
    await show(panel(createElement("div", { role: "dialog" }, gridEl({ excelExport: undefined }))));
    expect(tid("grid-quick-filter")).toBeNull();
  });

  it("GridPanel 밖 그리드는 검색 칸을 새로 만들지 않고 메뉴 항목도 없다(filter 생략)", async () => {
    await show(gridEl({ excelExport: undefined }));
    expect(tid("grid-quick-filter")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")).toBeNull();
  });

  it("GridPanel 밖 filter={true} 그리드는 메뉴 항목만 있다(검색 칸 없음)", async () => {
    await show(gridEl({ filter: true }));
    expect(tid("grid-quick-filter")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")!.textContent).toBe("칸별 필터 보기");
  });

  it("서버 페이징 GridPanel 은 검색 칸이 기본으로 없고, 「필터 창 보기」 를 켜면 검색 칸과 입력 줄이 함께 나타난다", async () => {
    await show(panel(gridEl(), { serverPaged: true }));
    expect(tid("grid-quick-filter")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")!.textContent).toBe(GRID_SETTINGS_LABELS.filterRowPaged);
    expect(GRID_SETTINGS_LABELS.filterRowPaged).toBe("필터 창 보기");
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    expect(tid("grid-quick-filter-input")!.getAttribute("title")).toBe("지금 쪽에서만 찾습니다.");

    // 끄면 둘 다 사라지고 칸별 조건과 검색어를 모두 지운다
    await act(async () => {
      await api().setColumnFilterModel("qty", { filterType: "number", type: "greaterThan", filter: 100 });
      api().onFilterChanged();
    });
    await typeQuick("창고");
    expect(api().getDisplayedRowCount()).toBe(2);
    await toggleRow();
    expect(tid("grid-quick-filter")).toBeNull();
    expect(api().getFilterModel()).toEqual({});
    expect(api().getGridOption("quickFilterText")).toBe("");
    expect(api().getDisplayedRowCount()).toBe(3);
    expect(tid("grid-panel-filter-count")).toBeNull();
  });

  it("서버 페이징이어도 filter={true} 그리드는 검색 칸이 늘 보인다", async () => {
    await show(panel(gridEl({ filter: true }), { serverPaged: true }));
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")!.textContent).toBe("칸별 필터 보기");
  });
});

describe("부작용 점검", () => {
  it("검색으로 숨은 행의 선택은 풀린다 — 입력 줄을 켜지 않은 채 검색만 써도", async () => {
    const onRowSelect = vi.fn();
    await show(panel(gridEl({ selectable: true, multiSelect: true, onRowSelect })));
    await act(async () => {
      api().setNodesSelected({ nodes: [api().getRowNode("A")!, api().getRowNode("B")!, api().getRowNode("C")!], newValue: true, source: "api" });
    });
    expect(api().getSelectedNodes().length).toBe(3);
    await typeQuick("자재");
    expect(api().getSelectedNodes().map((n) => n.id)).toEqual(["B"]);
  });

  it("행추가 단추를 누르면 검색어가 비워져 새 행이 보인다(행복사도 같다)", async () => {
    const onDataChange = vi.fn();
    const props: Partial<GridPanelProps> = { showAddButton: true, columns: COLUMNS, data: DATA, onDataChange, rowKey: "code" };
    await show(panel(gridEl(), props));
    await typeQuick("창고");
    expect(quickText()).toBe("창고");
    await click(document.getElementById("btn_grid_add"));
    await wait(40);
    expect(onDataChange).toHaveBeenCalledTimes(1);
    expect(quickText()).toBe("");
    expect(api().getGridOption("quickFilterText")).toBe("");
    expect(api().getDisplayedRowCount()).toBe(3);
  });

  it("검색어가 비어 있을 때 행추가 단추는 검색 칸을 건드리지 않는다(칸을 다시 마운트하지 않는다)", async () => {
    const onDataChange = vi.fn();
    await show(panel(gridEl(), { showAddButton: true, columns: COLUMNS, data: DATA, onDataChange, rowKey: "code" }));
    const input = tid("grid-quick-filter-input");
    await click(document.getElementById("btn_grid_add"));
    await wait(40);
    expect(tid("grid-quick-filter-input")).toBe(input);
  });
});

describe("검색어가 빈 동안의 비용 — filter={false} 그리드와 비교", () => {
  /** 같은 화면을 그려 AgGridReact 렌더 수·열 정의·넘긴 prop 이름을 모은다. */
  async function measure(props: Partial<AgDataGridProps>) {
    renderSpy.mockClear();
    await show(panel(gridEl({ excelExport: undefined, ...props })));
    await wait(200);
    const ctx = renderSpy.mock.contexts.at(-1) as { props?: Record<string, unknown> };
    return {
      renders: renderSpy.mock.calls.length,
      defs: (api().getColumnDefs() as ColDef[]).map((d) => JSON.stringify(Object.keys(d).sort())),
      propNames: Object.keys(ctx.props ?? {}).sort(),
      nodes: document.querySelectorAll(".cm-data-grid *").length,
    };
  }

  it("열 정의는 같고, AgGridReact 에 더 넘기는 prop 은 검색용 셋뿐이다", async () => {
    const off = await measure({ filter: false });
    await act(async () => r?.unmount());
    r = null;
    document.body.innerHTML = "";
    const on = await measure({});
    expect(on.defs).toEqual(off.defs);
    expect(on.nodes).toBe(off.nodes);
    expect(on.propNames.filter((n) => !off.propNames.includes(n))).toEqual(["onFilterChanged", "onModelUpdated", "quickFilterText"]);
    expect(off.propNames.filter((n) => !on.propNames.includes(n))).toEqual([]);
    // 렌더 수는 같은 화면에서 한두 번 이내로만 다르다(검색 칸 등장에 따른 GridPanel 머리줄 렌더는 AgGridReact 를 다시 그리지 않는다)
    expect(on.renders - off.renders).toBeLessThanOrEqual(1);
  });
});
