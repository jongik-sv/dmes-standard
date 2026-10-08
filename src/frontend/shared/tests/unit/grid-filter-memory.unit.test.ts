/** @vitest-environment happy-dom */
/**
 * 그리드 「칸별 필터 보기」(칸별 입력 줄)는 켠 상태를 기억하지 않는다(2026-10-08) — 화면을 열 때마다 접힌 채 시작하고, 켜고 끈 값은 그 마운트 안에서만 유지한다.
 * - 켜도 저장소에 아무것도 쓰지 않는다. 예전에 저장된 `filterOpen`(옆 키 `dmes:grid-opts:v1:`·`dmes:grid-filter:v1:`)은 읽지 않고 지우지도 않는다.
 * - 켜는 순간 열 정의가 바뀌어도(개인화 복원·자동 저장 포함) 칸 상태가 그대로인지도 본다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { gridOptsKey, gridPrefKey } from "../../src/components/grid/grid-personalize";
import { GRID_PERSONALIZE_SAVE_DEBOUNCE_MS } from "../../src/components/grid/grid-personalize-hook";
import { GRID_FILTER_ROW_HEIGHT } from "../../src/components/grid/useGridFilter";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { MemStorage, installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ls = installMemoryLocalStorage();

const SCREEN = "scr-fm";
const OPTS = gridOptsKey("u1", SCREEN, "main");
// 예전에 개인화가 없는 그리드가 켜짐을 적던 키 — 지금은 쓰지 않는다(저장된 값이 남아 있어도 읽지 않는 것만 본다).
const PLAIN = `dmes:grid-filter:v1:u1:${SCREEN}:main`;
const PREF = gridPrefKey("u1", SCREEN, "main");
const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number" },
];
const DATA = [
  { code: "A", name: "가", qty: 1 },
  { code: "B", name: "나", qty: 2 },
];

let r: Rendered | null = null;
let renderSpy: MockInstance;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });
function gridEl(props: Partial<AgDataGridProps> = {}) {
  return createElement(AgDataGrid, { columns: COLUMNS, rowKey: "code", data: DATA, columnSizing: "fixed", height: "auto", excelExport: false, ...props });
}
const panel = (child: ReactElement) =>
  createElement(TabPageContext.Provider, { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } }, createElement(GridPanel, { title: "목록" }, child));
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(120);
}
async function unmount() {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
}
function api(): GridApi {
  const seen: GridApi[] = [];
  for (const ctx of renderSpy.mock.contexts as Array<{ api?: GridApi }>) {
    if (ctx?.api && !seen.includes(ctx.api)) seen.push(ctx.api);
  }
  return seen.filter((a) => !a.isDestroyed()).slice(-1)[0]!;
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
async function toggleFilter() {
  await openMenu();
  await click(tid("grid-filter-row-item"));
  await wait(80);
}
const opts = () => JSON.parse(ls.getItem(OPTS) ?? "null");
const plain = () => JSON.parse(ls.getItem(PLAIN) ?? "null");
// 칸별 입력 줄이 펼쳐져 있는가 — 빠른 검색 칸은 켜짐과 무관하게 기본으로 보인다.
const filterOn = () => api().getGridOption("floatingFiltersHeight") === GRID_FILTER_ROW_HEIGHT;

beforeEach(async () => {
  ls.clear();
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await seedCurrentUser("u1");
});
afterEach(async () => {
  await unmount();
  vi.restoreAllMocks();
});


describe("칸별 필터 보기는 늘 접힌 채 시작한다", () => {
  it("개인화가 켜진 그리드: 켜도 저장하지 않고, 다시 열면 접힌 채 시작한다(검색 칸은 늘 있다)", async () => {
    await show(panel(gridEl()));
    expect(filterOn()).toBe(false);
    await toggleFilter();
    expect(filterOn()).toBe(true);
    expect(ls.getItem(OPTS)).toBeNull();
    expect(ls.getItem(PLAIN)).toBeNull();
    await unmount();

    await show(panel(gridEl()));
    expect(filterOn()).toBe(false);
    expect(tid("grid-quick-filter")).not.toBeNull();
    await openMenu();
    expect((tid("grid-filter-row-switch") as HTMLInputElement).checked).toBe(false);
  });

  it("개인화가 없는 그리드와 filter={true} 그리드도 같다", async () => {
    await show(panel(gridEl({ personalize: false })));
    await toggleFilter();
    expect(filterOn()).toBe(true);
    expect(ls.getItem(PLAIN)).toBeNull();
    expect(ls.getItem(OPTS)).toBeNull();
    await unmount();
    await show(panel(gridEl({ personalize: false })));
    expect(filterOn()).toBe(false);
    await unmount();

    await show(panel(gridEl({ filter: true, personalize: false })));
    expect(tid("grid-quick-filter")).not.toBeNull();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
    await toggleFilter();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    await unmount();
    await show(panel(gridEl({ filter: true, personalize: false })));
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
  });

  it("예전에 켠 채로 저장된 값이 있어도 읽지 않고 접힌 채 시작하며, 저장값은 지우지 않는다", async () => {
    ls.setItem(OPTS, JSON.stringify({ filterOpen: true, autoSave: true }));
    ls.setItem(PLAIN, JSON.stringify({ filterOpen: true }));
    await show(panel(gridEl()));
    expect(filterOn()).toBe(false);
    await toggleFilter();
    await toggleFilter();
    expect(opts()).toEqual({ filterOpen: true, autoSave: true });
    expect(plain()).toEqual({ filterOpen: true });
    await unmount();
    await show(panel(gridEl({ personalize: false })));
    expect(filterOn()).toBe(false);
    expect(plain()).toEqual({ filterOpen: true });
  });

  it("같은 마운트 안에서 다시 그려져도(데이터 변경) 켠 상태는 유지된다", async () => {
    await show(panel(gridEl()));
    await toggleFilter();
    expect(filterOn()).toBe(true);
    await show(panel(gridEl({ data: [...DATA, { code: "C", name: "다", qty: 3 }] })));
    expect(filterOn()).toBe(true);
  });

  it("gridId 가 바뀌면 이번 마운트에서 켠 값은 버리고 접힌다", async () => {
    await show(panel(gridEl({ personalize: false, gridId: "left" })));
    await toggleFilter();
    expect(filterOn()).toBe(true);
    await show(panel(gridEl({ personalize: false, gridId: "right" })));
    expect(filterOn()).toBe(false);
  });

  it("저장소가 막혀 있어도(읽기·쓰기 예외) 켜고 끌 수 있다", async () => {
    vi.spyOn(ls, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(ls, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await show(panel(gridEl({ personalize: false })));
    await toggleFilter();
    expect(filterOn()).toBe(true);
    await toggleFilter();
    expect(filterOn()).toBe(false);
  });

  it("자동 저장 스위치를 건드려도 켜짐 값은 새로 적히지 않는다", async () => {
    await show(panel(gridEl({ personalize: { autoSave: false } })));
    await toggleFilter();
    expect(opts()).toBeNull();
    expect(ls.getItem(PREF)).toBeNull();
    await openMenu();
    await click(tid("grid-autosave-item"));
    await wait(40);
    expect(opts()).toEqual({ autoSave: true });
  });
});

describe("칸별 필터 보기를 켤 때 칸 상태는 그대로다", () => {
  it("저장된 컬럼 상태로 연 뒤 켜도 저장 너비·순서가 복원된 채다", async () => {
    ls.setItem(
      PREF,
      JSON.stringify({
        v: 1,
        savedAt: 1,
        cols: [
          { colId: "qty", width: 150, hide: false, pinned: null },
          { colId: "code", hide: false, pinned: null },
          { colId: "name", width: 210, hide: false, pinned: null },
        ],
      }),
    );
    await show(panel(gridEl()));
    await wait(100);
    expect(filterOn()).toBe(false);
    await toggleFilter();
    await wait(100);
    expect(filterOn()).toBe(true);
    expect(api().getAllGridColumns().map((c) => c.getColId())).toEqual(["qty", "code", "name"]);
    expect(api().getColumn("qty")!.getActualWidth()).toBe(150);
    expect(api().getColumn("name")!.getActualWidth()).toBe(210);
  });

  it("자동 저장이 켜진 그리드: 사용자가 바꾼 너비·순서가 처음 켜도 그대로고 저장값도 변하지 않는다", async () => {
    await show(panel(gridEl()));
    await act(async () => {
      api().setColumnWidths([{ key: "name", newWidth: 230 }], true, "uiColumnResized");
      api().moveColumns(["qty"], 0, "uiColumnMoved");
    });
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 100);
    const savedBefore = JSON.parse(ls.getItem(PREF)!);
    await toggleFilter();
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 100);
    expect(filterOn()).toBe(true);
    expect(api().getColumn("name")!.getActualWidth()).toBe(230);
    expect(api().getAllGridColumns().map((c) => c.getColId())).toEqual(["qty", "code", "name"]);
    expect(JSON.parse(ls.getItem(PREF)!).cols).toEqual(savedBefore.cols);
  });

  it("자동 저장이 꺼진 그리드: 저장하지 않은 너비·순서 변경도 처음 켜도 그대로다", async () => {
    await show(panel(gridEl({ personalize: { autoSave: false } })));
    await act(async () => {
      api().setColumnWidths([{ key: "name", newWidth: 230 }], true, "uiColumnResized");
      api().moveColumns(["qty"], 0, "uiColumnMoved");
    });
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 100);
    expect(ls.getItem(PREF)).toBeNull();
    await toggleFilter();
    await wait(GRID_PERSONALIZE_SAVE_DEBOUNCE_MS + 100);
    expect(filterOn()).toBe(true);
    expect(api().getColumn("name")!.getActualWidth()).toBe(230);
    expect(api().getAllGridColumns().map((c) => c.getColId())).toEqual(["qty", "code", "name"]);
    expect(ls.getItem(PREF)).toBeNull();
  });
});
