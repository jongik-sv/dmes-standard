/** @vitest-environment happy-dom */
/**
 * 그리드 걸러 보기 켜짐 기억 — 「칸별 필터 보기」(칸별 입력 줄)를 켠 상태를 그 그리드에 기억하고 다시 열면 켜진 채로 시작한다(조건값·검색어는 기억하지 않는다).
 * - 개인화가 켜진 그리드: 자동 설정 저장 스위치와 같은 옆 키 객체(`dmes:grid-opts:v1:`)의 `filterOpen`. 자동 저장이 꺼져 있어도 적는다.
 * - 개인화가 없는 그리드: 별도 키(`dmes:grid-filter:v1:`).
 * - 켜는 순간 열 정의가 바뀌어도(개인화 복원·자동 저장 포함) 칸 상태가 그대로인지도 본다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import {
  gridFilterKey,
  gridOptsKey,
  gridPrefKey,
  loadGridAutoSave,
  loadGridFilterOpen,
  saveGridAutoSave,
  saveGridFilterOpen,
} from "../../src/components/grid/grid-personalize";
import { GRID_PERSONALIZE_SAVE_DEBOUNCE_MS } from "../../src/components/grid/grid-personalize-hook";
import { GRID_FILTER_ROW_HEIGHT } from "../../src/components/grid/useGridFilter";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { MemStorage, installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ls = installMemoryLocalStorage();

const SCREEN = "scr-fm";
const OPTS = gridOptsKey("u1", SCREEN, "main");
const PLAIN = gridFilterKey("u1", SCREEN, "main");
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

describe("저장 함수", () => {
  it("자동 설정 저장 값을 쓸 때 filterOpen 을, filterOpen 을 쓸 때 autoSave 를 지우지 않는다", () => {
    const store = new MemStorage();
    expect(saveGridFilterOpen("u1", "s", "g", true, true, store)).toBe(true);
    expect(saveGridAutoSave("u1", "s", "g", false, store)).toBe(true);
    expect(JSON.parse(store.getItem(gridOptsKey("u1", "s", "g"))!)).toEqual({ filterOpen: true, autoSave: false });
    expect(loadGridAutoSave("u1", "s", "g", store)).toBe(false);
    expect(loadGridFilterOpen("u1", "s", "g", true, store)).toBe(true);
    expect(saveGridFilterOpen("u1", "s", "g", false, true, store)).toBe(true);
    expect(JSON.parse(store.getItem(gridOptsKey("u1", "s", "g"))!)).toEqual({ filterOpen: false, autoSave: false });
  });

  it("개인화가 없는 그리드는 별도 키에 적고 옆 키는 건드리지 않는다", () => {
    const store = new MemStorage();
    expect(saveGridFilterOpen("u1", "s", "g", true, false, store)).toBe(true);
    expect(store.getItem(gridOptsKey("u1", "s", "g"))).toBeNull();
    expect(JSON.parse(store.getItem(gridFilterKey("u1", "s", "g"))!)).toEqual({ filterOpen: true });
    expect(loadGridFilterOpen("u1", "s", "g", false, store)).toBe(true);
    expect(loadGridFilterOpen("u1", "s", "g", true, store)).toBeNull();
  });

  it("사용자·화면 키가 비면 읽지도 쓰지도 않고, 깨진 값·저장소 예외는 null/false", () => {
    const store = new MemStorage();
    expect(saveGridFilterOpen("", "s", "g", true, false, store)).toBe(false);
    expect(saveGridFilterOpen("u1", "", "g", true, false, store)).toBe(false);
    expect(store.length).toBe(0);
    store.setItem(gridFilterKey("u1", "s", "g"), "{깨짐");
    expect(loadGridFilterOpen("u1", "s", "g", false, store)).toBeNull();
    store.setItem(gridFilterKey("u1", "s", "g"), JSON.stringify({ filterOpen: "yes" }));
    expect(loadGridFilterOpen("u1", "s", "g", false, store)).toBeNull();
    const broken = new MemStorage();
    vi.spyOn(broken, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(broken, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(loadGridFilterOpen("u1", "s", "g", false, broken)).toBeNull();
    expect(saveGridFilterOpen("u1", "s", "g", true, false, broken)).toBe(false);
    expect(saveGridFilterOpen("u1", "s", "g", true, true, broken)).toBe(false);
    expect(saveGridAutoSave("u1", "s", "g", true, broken)).toBe(false);
  });
});

describe("개인화가 켜진 그리드 — 옆 키(gridOptsKey)의 filterOpen", () => {
  it("켜면 filterOpen:true 를 적고, 다시 열면 입력 줄이 펼쳐진 채로 시작한다(검색어는 비어 있다)", async () => {
    await show(panel(gridEl()));
    expect(filterOn()).toBe(false);
    await toggleFilter();
    expect(filterOn()).toBe(true);
    expect(opts()).toEqual({ filterOpen: true });
    expect(ls.getItem(PLAIN)).toBeNull();
    await unmount();

    await show(panel(gridEl()));
    expect(filterOn()).toBe(true);
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("");
    await openMenu();
    expect((tid("grid-filter-row-switch") as HTMLInputElement).checked).toBe(true);
  });

  it("끄면 filterOpen:false 를 적고 다시 열면 꺼진 채로 시작한다", async () => {
    ls.setItem(OPTS, JSON.stringify({ filterOpen: true }));
    await show(panel(gridEl()));
    expect(filterOn()).toBe(true);
    await toggleFilter();
    expect(filterOn()).toBe(false);
    expect(opts()).toEqual({ filterOpen: false });
    await unmount();
    await show(panel(gridEl()));
    expect(filterOn()).toBe(false);
    // 입력 줄이 접혀도 검색 칸은 기본으로 보인다
    expect(tid("grid-quick-filter")).not.toBeNull();
  });

  it("자동 설정 저장이 꺼져 있어도 filterOpen 은 적고, 자동 저장 값도 그대로 남는다", async () => {
    await show(panel(gridEl({ personalize: { autoSave: false } })));
    await toggleFilter();
    expect(opts()).toEqual({ filterOpen: true });
    expect(ls.getItem(PREF)).toBeNull();
    // 이어서 자동 저장 스위치를 건드려도 filterOpen 은 지워지지 않는다
    await openMenu();
    await click(tid("grid-autosave-item"));
    await wait(40);
    expect(opts()).toEqual({ filterOpen: true, autoSave: true });
  });

  it("컬럼 설정 「초기화」 는 켜짐을 지우지 않는다", async () => {
    ls.setItem(OPTS, JSON.stringify({ filterOpen: true, autoSave: true }));
    ls.setItem(PREF, JSON.stringify({ v: 1, savedAt: 1, cols: [{ colId: "qty", width: 150 }] }));
    await show(panel(gridEl()));
    await openMenu();
    await click(tid("grid-reset-button"));
    await wait(60);
    const confirm = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === "확인");
    await click(confirm ?? null);
    await wait(80);
    expect(ls.getItem(PREF)).toBeNull();
    expect(opts()).toEqual({ filterOpen: true, autoSave: true });
  });

  it("저장된 켜짐 + 저장된 컬럼 상태로 열면 필터가 켜진 채로 저장 너비·순서가 복원된다", async () => {
    ls.setItem(OPTS, JSON.stringify({ filterOpen: true }));
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

describe("개인화가 없는 그리드 — 별도 키(gridFilterKey)", () => {
  it("켜면 별도 키에 적고 옆 키는 쓰지 않으며, 다시 열면 켜진 채로 시작한다", async () => {
    await show(panel(gridEl({ personalize: false })));
    await toggleFilter();
    expect(plain()).toEqual({ filterOpen: true });
    expect(ls.getItem(OPTS)).toBeNull();
    await unmount();
    await show(panel(gridEl({ personalize: false })));
    expect(filterOn()).toBe(true);
  });

  it("gridId 가 다르면 따로 기억한다", async () => {
    await show(panel(gridEl({ personalize: false, gridId: "left" })));
    await toggleFilter();
    expect(ls.getItem(gridFilterKey("u1", SCREEN, "left"))).not.toBeNull();
    expect(ls.getItem(PLAIN)).toBeNull();
    await unmount();
    await show(panel(gridEl({ personalize: false })));
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

  it("조건값과 검색어는 기억하지 않는다", async () => {
    await show(panel(gridEl({ personalize: false })));
    await toggleFilter();
    await act(async () => {
      const input = tid("grid-quick-filter-input") as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "가");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await wait(300);
    expect(JSON.stringify(plain())).not.toContain("가");
    await unmount();
    await show(panel(gridEl({ personalize: false })));
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("");
    expect(api().getDisplayedRowCount()).toBe(2);
  });
});

describe("filter={true} 그리드도 입력 줄 켜짐을 기억한다", () => {
  it("입력 줄을 펴면 기억하고 다시 열면 펼쳐진 채로 시작한다(검색 칸은 늘 있다)", async () => {
    await show(panel(gridEl({ filter: true, personalize: false })));
    expect(tid("grid-quick-filter")).not.toBeNull();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
    await toggleFilter();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    await unmount();
    await show(panel(gridEl({ filter: true, personalize: false })));
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    expect(tid("grid-quick-filter")).not.toBeNull();
  });
});
