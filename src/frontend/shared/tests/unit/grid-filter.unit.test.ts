/** @vitest-environment happy-dom */
/**
 * 그리드 걸러 보기(AgDataGrid `filter`) — 빠른 검색 칸(GridPanel 머리줄)·「필터 창 보기」(설정 메뉴)·거른 건수를 실제 ag-grid·MantineProvider 로 그려 확인한다.
 * `filter` 세 상태(true·false·생략) — 생략은 GridPanel 안(대화 상자 밖) 그리드의 「그리드 설정」 메뉴에서 켠다. 꺼진 동안 모양이 변경 전과 같은지, 처음 켤 때 열 정의가 바뀌어도
 * 사용자가 바꾼 칸 상태가 그대로인지(지연 방식의 근거)도 실제 ag-grid 로 본다. 켜짐 기억은 grid-filter-memory 시험이 본다.
 * 열 정의 쪽(필터 종류·값 변환)은 순수 함수 buildColumnDefs 로 본다. 그리드 api 는 grid-autosave-switch-render 시험과 같이 AgGridReact.render 의 this 로 잡는다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { ColDef, GridApi, ColumnState } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { buildColumnDefs } from "../../src/components/grid/column-defs";
import { GRID_QUICK_FILTER_DEBOUNCE_MS } from "../../src/components/grid/GridQuickFilter";
import { GRID_FILTER_ROW_CLOSED_CLASS, GRID_FILTER_ROW_HEIGHT } from "../../src/components/grid/useGridFilter";
import { gridFilterNotice } from "../../src/components/grid/grid-settings-labels";
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

/** 헤더 바닥 줄(필터 입력 줄) 개수와 ag-grid 가 만든 칸별 입력 칸 수 — 꺼진 동안 DOM 비용을 잰다. */
const floatingCells = () => document.querySelectorAll(".ag-floating-filter").length;
const filterRows = () => document.querySelectorAll(".ag-header-row-column-filter").length;
/** id 같은 인스턴스 값을 지운 머리글 HTML — 꺼진 동안 모양이 filter={false} 그리드와 같은지 비교한다. */
const headerShape = () =>
  document
    .querySelector(".ag-header")!
    .outerHTML.replace(/ id="[^"]*"/g, "")
    .replace(/ aria-labelledby="[^"]*"/g, "")
    .replace(/ aria-describedby="[^"]*"/g, "");

describe("AgDataGrid filter 생략 — GridPanel 안", () => {
  it("꺼진 동안은 filter={false} 그리드와 모양이 같다 — 검색 칸·입력 줄·클래스·필터 열 정의·한국어 필터 문구가 없다", async () => {
    await show(panel(gridEl({ filter: false, excelExport: undefined })));
    const falseShape = headerShape();
    const falseDefs = api().getColumnDefs() as ColDef[];
    const falseClass = gridBox().className;
    await act(async () => r?.unmount());
    r = null;
    document.body.innerHTML = "";

    await show(panel(gridEl({ excelExport: undefined })));
    expect(tid("grid-quick-filter")).toBeNull();
    expect(floatingCells()).toBe(0);
    expect(filterRows()).toBe(0);
    expect(api().getGridOption("floatingFiltersHeight")).toBeUndefined();
    expect(gridBox().className).toBe(falseClass);
    expect(headerShape()).toBe(falseShape);
    const defs = api().getColumnDefs() as ColDef[];
    expect(defs.map((d) => Object.keys(d).sort())).toEqual(falseDefs.map((d) => Object.keys(d).sort()));
    for (const d of defs) {
      expect(d).not.toHaveProperty("filter");
      expect(d).not.toHaveProperty("floatingFilter");
      expect(d).not.toHaveProperty("filterValueGetter");
    }
    expect(api().getGridOption("localeText")).toBeUndefined();
    expect(document.querySelector(".grid-panel-count")?.textContent).toBe("3건");
    // 메뉴 맨 위에 「필터 창 보기」 가 꺼진 채로 있다
    await openMenu();
    const item = tid("grid-filter-row-item")!;
    expect(item).not.toBeNull();
    expect(item.getAttribute("aria-label")).toContain("꺼짐");
    expect(document.querySelector('[data-testid="grid-settings-dropdown"] [role="menuitem"]')).toBe(item);
    expect((tid("grid-filter-row-switch") as HTMLInputElement).checked).toBe(false);
  });

  it("필터 항목만 있는 그리드(엑셀·개인화 없음)도 설정 메뉴가 생긴다", async () => {
    await show(panel(gridEl()));
    expect(tid("grid-settings-menu")).not.toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")).not.toBeNull();
    expect(tid("grid-excel")).toBeNull();
  });

  it("켜면 검색 칸과 칸별 입력 줄이 함께 나타난다", async () => {
    await show(panel(gridEl()));
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    expect(gridBox().classList.contains(GRID_FILTER_ROW_CLOSED_CLASS)).toBe(false);
    expect(floatingCells()).toBe(COLUMNS.length);
    const defs = api().getColumnDefs() as ColDef[];
    expect(defs[0]).toMatchObject({ filter: "agTextColumnFilter", floatingFilter: true });
    expect(defs[2]).toMatchObject({ filter: "agNumberColumnFilter", floatingFilter: true });
    // 켠 뒤 메뉴를 다시 열면 켜짐으로 읽힌다
    await openMenu();
    expect((tid("grid-filter-row-switch") as HTMLInputElement).checked).toBe(true);
    // 켜자마자 검색이 된다(처음 켠 뒤에 단 getQuickFilterText 가 먹는다)
    await typeQuick("부품");
    expect(api().getDisplayedRowCount()).toBe(2);
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(40);
  });

  it("끄면 검색 칸과 입력 줄이 사라지고 칸별 조건과 검색어를 모두 지운다", async () => {
    await show(panel(gridEl()));
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    await act(async () => {
      await api().setColumnFilterModel("qty", { filterType: "number", type: "greaterThan", filter: 500 });
      api().onFilterChanged();
    });
    await typeQuick("창고");
    expect(api().getDisplayedRowCount()).toBe(1);
    expect(tid("grid-panel-filter-count")?.textContent).toBe("1 / 3건");

    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(tid("grid-quick-filter")).toBeNull();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
    expect(gridBox().classList.contains(GRID_FILTER_ROW_CLOSED_CLASS)).toBe(true);
    expect(api().getFilterModel()).toEqual({});
    expect(api().getGridOption("quickFilterText")).toBe("");
    expect(api().getDisplayedRowCount()).toBe(3);
    expect(tid("grid-panel-filter-count")).toBeNull();
    expect(document.querySelector(".grid-panel-count")?.textContent).toBe("3건");

    // 다시 켜면 빈 검색 칸이 나온다
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("");
    expect(api().getDisplayedRowCount()).toBe(3);
  });

  it("처음 켜기 전에 사용자가 바꾼 칸 너비·순서·숨김·고정·정렬이 켜고 끄는 동안 그대로다(지연 방식의 근거)", async () => {
    await show(panel(gridEl()));
    await act(async () => {
      api().setColumnWidths([{ key: "name", newWidth: 222 }]);
      api().moveColumns(["qty"], 0);
      api().applyColumnState({
        state: [
          { colId: "code", hide: true },
          { colId: "name", sort: "desc" },
          { colId: "qty", pinned: "left", width: 150 },
        ],
      });
    });
    const snap = (): ColumnState[] => api().getColumnState().map(({ colId, width, hide, pinned, sort }) => ({ colId, width, hide, pinned, sort }));
    const before = snap();
    expect(before.find((c) => c.colId === "name")!.width).toBe(222);
    for (let i = 0; i < 3; i++) {
      await openMenu();
      await click(tid("grid-filter-row-item"));
      await wait(80);
      expect(snap()).toEqual(before);
    }
    expect(api().getAllGridColumns().map((c) => c.getColId())).toEqual(before.map((c) => c.colId));
  });

  it("filter={false} 는 항목이 없다 — 메뉴는 엑셀만", async () => {
    await show(panel(gridEl({ filter: false, excelExport: undefined })));
    await openMenu();
    expect(tid("grid-filter-row-item")).toBeNull();
    expect(tid("grid-excel")).not.toBeNull();
    expect(tid("grid-quick-filter")).toBeNull();
    expect(floatingCells()).toBe(0);
  });

  it("settingsMenu={false} 면 항목도 검색 칸도 없다", async () => {
    await show(panel(gridEl({ settingsMenu: false })));
    expect(tid("grid-settings-menu")).toBeNull();
    expect(tid("grid-quick-filter")).toBeNull();
    expect(floatingCells()).toBe(0);
  });

  it("filter={true} 그리드는 예전 동작 그대로 — 검색 칸이 처음부터 보이고, 끄면 검색어는 남는다", async () => {
    await show(panel(gridEl({ filter: true })));
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    await typeQuick("창고");
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(60);
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(60);
    expect(tid("grid-quick-filter-input")).not.toBeNull();
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("창고");
  });

  it("대화 상자 안 그리드는 생략이면 GridPanel 에 올라가지 않아 검색 칸·항목이 없다", async () => {
    await show(panel(createElement("div", { role: "dialog" }, gridEl({ excelExport: undefined }))));
    expect(tid("grid-quick-filter")).toBeNull();
    // GridPanel 머리줄에는 설정 메뉴가 없다(대화 상자 안 그리드는 올라가지 않는다). 있는 것은 그 그리드 자신의 엑셀 아이콘뿐이다.
    expect(tid("grid-panel-settings-slot")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")).toBeNull();
    expect(floatingCells()).toBe(0);
  });

  it("검색 칸 안내 글 — 받아 둔 행 안에서만, 서버 페이징이면 지금 쪽에서만, 편집 칸이 있으면 새 행도 숨는다", async () => {
    expect(gridFilterNotice({})).toBe("받아 둔 행 안에서만 찾습니다.");
    expect(gridFilterNotice({ paged: true })).toBe("지금 쪽에서만 찾습니다.");
    expect(gridFilterNotice({ editable: true })).toContain("새로 넣은 행도 조건에 맞지 않으면 숨습니다");

    await show(panel(gridEl()));
    await openMenu();
    expect(tid("grid-filter-row-item")!.getAttribute("title")).toBe("받아 둔 행 안에서만 찾습니다.");
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(tid("grid-quick-filter-input")!.getAttribute("title")).toBe("받아 둔 행 안에서만 찾습니다.");
    expect(tid("grid-quick-filter-notice")!.textContent).toBe("받아 둔 행 안에서만 찾습니다.");
    expect(tid("grid-quick-filter-input")!.getAttribute("aria-describedby")).toBe(tid("grid-quick-filter-notice")!.id);
  });

  it("서버 페이징 GridPanel·편집 그리드의 안내 글", async () => {
    const editableCols: GridColumn[] = [{ key: "code", header: "코드" }, { key: "name", header: "이름", editable: true }];
    await show(createElement(GridPanel, { title: "목록", serverPaged: true }, gridEl({ columns: editableCols })));
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(80);
    expect(tid("grid-quick-filter-input")!.getAttribute("title")).toBe("지금 쪽에서만 찾습니다. 새로 넣은 행도 조건에 맞지 않으면 숨습니다.");
  });
});

describe("AgDataGrid filter 생략 — GridPanel 밖", () => {
  it("설정 아이콘 메뉴에 「필터 창 보기」 가 없고 필터 열 정의도 없다", async () => {
    await show(gridEl({ excelExport: undefined }));
    expect(tid("grid-quick-filter")).toBeNull();
    await openMenu();
    expect(tid("grid-filter-row-item")).toBeNull();
    expect(floatingCells()).toBe(0);
    expect(api().getGridOption("floatingFiltersHeight")).toBeUndefined();
  });
});

describe("AgDataGrid filter 생략 — 처음 켤 때 열 정의 변경과 칸 상태", () => {
  const snapOf = () => api().getColumnState().map(({ colId, width, hide, pinned, sort }) => ({ colId, width, hide, pinned, sort }));

  it("columnSizing=auto(기본) 그리드도 켜고 끄는 동안 사용자가 바꾼 너비·순서가 그대로다", async () => {
    await show(panel(gridEl({ columnSizing: "auto" })));
    await act(async () => {
      api().setColumnWidths([{ key: "name", newWidth: 210 }]);
      api().moveColumns(["qty"], 0);
    });
    const before = snapOf();
    for (let i = 0; i < 2; i++) {
      await openMenu();
      await click(tid("grid-filter-row-item"));
      await wait(120);
      expect(snapOf()).toEqual(before);
    }
  });

  it("columnSizing=fit(flex) 그리드도 그대로다", async () => {
    await show(panel(gridEl({ columnSizing: "fit", columns: COLUMNS.map((c) => ({ ...c, width: undefined })) })));
    await act(async () => {
      api().moveColumns(["qty"], 0);
    });
    const before = snapOf();
    await openMenu();
    await click(tid("grid-filter-row-item"));
    await wait(120);
    expect(snapOf()).toEqual(before);
  });

  it("꺼진 동안의 DOM — 입력 줄 칸이 하나도 없다. 늘 달아 두는 방식(filter={true}, 접힘)이면 칸 수만큼 생긴다", async () => {
    const wide: GridColumn[] = Array.from({ length: 12 }, (_, i) => ({ key: `c${i}`, header: `칸${i}`, width: 80 }));
    const rows = Array.from({ length: 5 }, (_, i) => Object.fromEntries([["c0", String(i)], ...wide.slice(1).map((c) => [c.key, `v${i}`])]));
    const measure = () => ({
      floating: floatingCells(),
      filterInputs: document.querySelectorAll(".ag-header-row-column-filter input").length,
      nodes: document.querySelectorAll(".cm-data-grid *").length,
    });
    await show(panel(gridEl({ columns: wide, data: rows, rowKey: "c0" })));
    const off = measure();
    await act(async () => r?.unmount());
    r = null;
    document.body.innerHTML = "";
    await show(panel(gridEl({ columns: wide, data: rows, rowKey: "c0", filter: true })));
    const always = measure();
    expect(off.floating).toBe(0);
    expect(off.filterInputs).toBe(0);
    expect(always.floating).toBe(wide.length);
    expect(always.nodes).toBeGreaterThan(off.nodes);
    // 실측(happy-dom, 12칸·5행): 꺼진 생략 {floating 0, filterInputs 0, 그리드 안 노드 535} / 늘 달기 {floating 12, filterInputs 12, 노드 632} — 노드가 약 18% 늘고 칸마다 필터 컴포넌트가 생긴다.
    expect(always.filterInputs).toBe(wide.length);
  });
});
