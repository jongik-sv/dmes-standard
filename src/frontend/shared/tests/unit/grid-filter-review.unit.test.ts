/** @vitest-environment happy-dom */
/**
 * 그리드 걸러 보기 코드 리뷰 지적 수정 — 실제 ag-grid·MantineProvider 로 그린다.
 * 1. 머리글 전체 선택은 보이는 행만 고르고, 걸러져 숨은 행의 선택은 풀린다(화면 onRowSelect·화면 문맥에도 알려진다).
 * 2. 저장 키(memoryKey)에 개인화 여부를 넣지 않는다 — personalize 가 오가도 조건·검색어가 남은 채 입력 칸만 사라지지 않고,
 *    입력 줄이 펼침에서 접힘으로 바뀌는 모든 경로에서 조건이 지워진다. 다시 마운트되는 검색 칸은 그리드에 걸린 검색어로 시작한다.
 * 3. 한 GridPanel 에 그리드가 여럿이면 메뉴·검색 칸·건수가 엇갈리지 않는다.
 * 4. 저장된 켜짐이 그리드 준비 뒤에 들어와도 칸 상태(순서·너비)가 이어진다.
 * 5. [컬럼 원래대로] 는 정렬 이벤트를 두 번 내지 않고, 선택 체크박스 열을 맨 앞에 두며, auto 그리드는 바로 너비를 잰다.
 * 고정 대기 대신 조건 대기(until)를 쓴다.
 */
import { act, createElement, type ReactElement } from "react";
import { AgGridReact } from "ag-grid-react";
import type { GridApi } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { GridQuickFilter } from "../../src/components/grid/GridQuickFilter";
import type { GridPanelGridControls } from "../../src/components/grid/grid-panel-context";
import { gridFilterKey, gridOptsKey } from "../../src/components/grid/grid-personalize";
import { GRID_FILTER_ROW_HEIGHT } from "../../src/components/grid/useGridFilter";
import { clearCurrentUserCache } from "../../src/portal-shell/current-user";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { screenApplyStore, screenContextStore } from "../../src/screen-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const ls = installMemoryLocalStorage();

const SCREEN = "scr-rv";
const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
  { key: "qty", header: "수량", width: 90, type: "number", editable: true },
];
const BASE_DATA = [
  { code: "A", name: "부품창고", qty: 1 },
  { code: "B", name: "자재창고", qty: 2 },
  { code: "C", name: "부품대기", qty: 3 },
];
/** 값 받기 시험이 행 객체를 고치므로 시험마다 새로 만든다. */
let DATA = BASE_DATA.map((row) => ({ ...row }));

let r: Rendered | null = null;
let renderSpy: MockInstance;

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });
/** 조건이 참이 될 때까지 짧게 반복해 기다린다(고정 대기 대신). 못 되면 던진다. */
async function until(cond: () => boolean, label = "조건", timeoutMs = 3000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`시간 안에 ${label} 이(가) 참이 되지 않았다`);
    await wait(10);
  }
}
function gridEl(props: Partial<AgDataGridProps> = {}) {
  return createElement(AgDataGrid, { columns: COLUMNS, rowKey: "code", data: DATA, columnSizing: "fixed", height: "auto", excelExport: false, ...props });
}
/** 한 패널에 놓을 그리드들. 각자 gridId 를 주어 개인화 키가 겹치지 않게 한다. */
const panel = (...children: ReactElement[]) =>
  createElement(
    TabPageContext.Provider,
    { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } },
    createElement(GridPanel, { title: "목록" }, createElement("div", null, ...children)),
  );
async function show(el: ReactElement) {
  if (r) await act(async () => rerender(r!, el));
  else await act(async () => void (r = renderWithMantine(el)));
  await wait(60);
}
function apis(): GridApi[] {
  const seen: GridApi[] = [];
  for (const ctx of renderSpy.mock.contexts as Array<{ api?: GridApi }>) {
    if (ctx?.api && !seen.includes(ctx.api)) seen.push(ctx.api);
  }
  return seen.filter((a) => !a.isDestroyed());
}
const api = (i = 0) => apis()[i]!;
const tid = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: Element | null) => act(async () => void (el as HTMLElement).click());
async function openMenu() {
  const target = tid("grid-settings-menu")!;
  if (target.getAttribute("aria-expanded") !== "true") {
    await click(target);
    await until(() => tid("grid-settings-dropdown") !== null, "설정 메뉴");
  }
}
async function toggleFilter() {
  await openMenu();
  await click(tid("grid-filter-row-item"));
  await wait(20);
}
async function typeQuick(text: string) {
  const input = tid("grid-quick-filter-input") as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await until(() => apis().some((a) => a.getGridOption("quickFilterText") === text), `검색어 ${text}`);
}
const colIds = (a: GridApi) => a.getAllGridColumns().map((c) => c.getColId());
const selectedIds = (a: GridApi) => a.getSelectedNodes().map((n) => n.data.code as string);

beforeEach(async () => {
  DATA = BASE_DATA.map((row) => ({ ...row }));
  ls.clear();
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  await seedCurrentUser("u1");
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  screenContextStore.clearTab("t1");
  vi.restoreAllMocks();
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
});

describe("1. 머리글 전체 선택은 보이는 행만 고른다", () => {
  const headerCheckbox = () => document.querySelector<HTMLInputElement>(".ag-header-select-all input")!;

  it("검색어로 1행만 보이는 상태에서 머리글 전체 선택을 누르면 1건만 선택되고 화면 onRowSelect 에도 1건만 간다", async () => {
    const onRowSelect = vi.fn();
    await show(panel(gridEl({ personalize: false, selectable: true, multiSelect: true, onRowSelect })));
    await toggleFilter();
    await typeQuick("자재");
    await until(() => api().getDisplayedRowCount() === 1, "거른 행 1");
    await click(headerCheckbox());
    await until(() => onRowSelect.mock.calls.length > 0, "화면 onRowSelect 호출");
    expect(selectedIds(api())).toEqual(["B"]);
    expect(onRowSelect.mock.calls.at(-1)![0]).toEqual(["B"]);
  });

  it("거르지 않을 때는 모든 행을 고른다(전과 같다)", async () => {
    await show(panel(gridEl({ personalize: false, selectable: true, multiSelect: true })));
    await click(headerCheckbox());
    await until(() => selectedIds(api()).length === 3, "전체 선택");
    expect(selectedIds(api()).sort()).toEqual(["A", "B", "C"]);
  });

  it("먼저 골라 둔 행이 걸러져 숨으면 선택이 풀리고 화면 onRowSelect·화면 문맥·값 받기가 숨은 행을 쓰지 않는다", async () => {
    const onRowSelect = vi.fn();
    await show(panel(gridEl({ personalize: false, selectable: true, multiSelect: true, onRowSelect, acceptScreenApply: true })));
    await toggleFilter();
    // 숨을 B 와 보일 A 를 고른다 — 마지막으로 고른 B 가 화면 문맥이다.
    await act(async () => {
      api().getRowNode("A")!.setSelected(true);
      api().getRowNode("B")!.setSelected(true);
    });
    await until(() => screenContextStore.get("t1")?.values.name === "자재창고", "화면 문맥 B");
    await typeQuick("부품");
    await until(() => selectedIds(api()).join() === "A", "숨은 행 선택 해제");
    await until(() => onRowSelect.mock.calls.at(-1)?.[0]?.join() === "A", "화면 onRowSelect 에 해제 통지");
    // 화면 문맥은 보이는 선택 행(A)이고, 숨은 B 가 아니다.
    await until(() => screenContextStore.get("t1")?.values.name === "부품창고", "화면 문맥 A");
    // 값 받기는 보이는 선택 행(A)에만 들어간다.
    let result: { applied: string[]; skipped: string[] } | null = null;
    await act(async () => {
      result = await screenApplyStore.apply("t1", { qty: "77" });
    });
    expect(result).toEqual({ applied: ["qty"], skipped: [] });
    expect(api().getRowNode("A")!.data.qty).toBe(77);
    expect(api().getRowNode("B")!.data.qty).toBe(2);
  });

  it("보이는 선택이 하나도 남지 않으면 화면 문맥이 비고 값 받기는 아무 행에도 쓰지 않는다", async () => {
    await show(panel(gridEl({ personalize: false, selectable: true, multiSelect: true, acceptScreenApply: true })));
    await toggleFilter();
    await act(async () => api().getRowNode("B")!.setSelected(true));
    await until(() => screenContextStore.get("t1")?.values.name === "자재창고", "화면 문맥 B");
    await typeQuick("부품");
    await until(() => selectedIds(api()).length === 0, "숨은 행 선택 해제");
    await until(() => screenContextStore.get("t1") === null, "화면 문맥 비움");
    let result: { applied: string[]; skipped: string[] } | null = null;
    await act(async () => {
      result = await screenApplyStore.apply("t1", { qty: "77" });
    });
    expect(result).toEqual({ applied: [], skipped: ["qty"] });
    expect(api().getRowNode("B")!.data.qty).toBe(2);
  });
});

describe("2. 저장 키가 바뀌거나 접힐 때 조건·검색어를 지운다", () => {
  const PLAIN = gridFilterKey("u1", SCREEN, "g");
  const OPTS = gridOptsKey("u1", SCREEN, "g");

  it("켜고 검색한 뒤 personalize 를 false 로 바꿔도(숨은 탭 패턴) 이번에 켠 걸러 보기는 검색어와 함께 그대로다", async () => {
    await show(panel(gridEl({ gridId: "g" })));
    await toggleFilter();
    await typeQuick("부품");
    await until(() => api().getDisplayedRowCount() === 2, "거른 행 2");
    await show(panel(gridEl({ gridId: "g", personalize: false })));
    expect(tid("grid-quick-filter")).not.toBeNull();
    expect(api().getDisplayedRowCount()).toBe(2);
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("부품");
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    // 저장 위치는 새 개인화 여부를 따른다 — 이후 끄면 별도 키에 적힌다.
    await toggleFilter();
    expect(JSON.parse(ls.getItem(PLAIN)!)).toEqual({ filterOpen: false });
  });

  it("저장된 켜짐으로 시작한 그리드는 personalize 가 바뀌어도 다시 읽지 않아 켜진 채 검색어를 지키고, 접으면 칸별 조건만 지운다", async () => {
    ls.setItem(OPTS, JSON.stringify({ filterOpen: true }));
    await show(panel(gridEl({ gridId: "g" })));
    expect(tid("grid-quick-filter")).not.toBeNull();
    await typeQuick("부품");
    await show(panel(gridEl({ gridId: "g", personalize: false })));
    expect(tid("grid-quick-filter")).not.toBeNull();
    expect(api().getDisplayedRowCount()).toBe(2);
    await act(async () => {
      await api().setColumnFilterModel("qty", { filterType: "number", type: "greaterThan", filter: 1 });
      api().onFilterChanged();
    });
    await until(() => api().getDisplayedRowCount() === 1, "칸별 조건까지 거른 행 1");
    await toggleFilter();
    await until(() => api().getDisplayedRowCount() === 2, "칸별 조건 해제");
    expect(api().getFilterModel()).toEqual({});
    // 검색어는 검색 칸이 남아 있으니 그대로다
    expect(api().getGridOption("quickFilterText")).toBe("부품");
  });

  it("저장 키가 바뀌어(gridId) 입력 줄이 접히면 칸별 조건만 지워지고 검색어는 남는다(토글을 거치지 않는 경로)", async () => {
    await show(panel(gridEl({ gridId: "g", personalize: false })));
    await toggleFilter();
    await act(async () => {
      await api().setColumnFilterModel("qty", { filterType: "number", type: "greaterThan", filter: 1 });
      api().onFilterChanged();
    });
    await typeQuick("창고");
    await until(() => api().getDisplayedRowCount() === 1, "거른 행 1");
    // 같은 그리드가 다른 gridId 로 바뀌면 저장 키가 바뀌어 이번 마운트의 선택이 버려지고 접힌다.
    await show(panel(gridEl({ gridId: "g2", personalize: false })));
    await until(() => api().getDisplayedRowCount() === 2, "칸별 조건 해제");
    expect(api().getFilterModel()).toEqual({});
    expect(api().getGridOption("quickFilterText")).toBe("창고");
    expect(tid("grid-quick-filter")).not.toBeNull();
    expect(api().getGridOption("floatingFiltersHeight")).toBe(0);
  });

  it("filter={true} 그리드는 키가 바뀌어 입력 줄이 접혀도 검색어를 남기고 칸별 조건만 지운다", async () => {
    ls.setItem(gridFilterKey("u1", SCREEN, "g"), JSON.stringify({ filterOpen: true }));
    await show(panel(gridEl({ gridId: "g", filter: true, personalize: false })));
    expect(api().getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    await act(async () => {
      await api().setColumnFilterModel("qty", { filterType: "number", type: "greaterThan", filter: 1 });
      api().onFilterChanged();
    });
    await typeQuick("창고");
    await show(panel(gridEl({ gridId: "g2", filter: true, personalize: false })));
    await until(() => api().getGridOption("floatingFiltersHeight") === 0, "입력 줄 접힘");
    await until(() => Object.keys(api().getFilterModel()).length === 0, "칸별 조건 해제");
    expect(api().getGridOption("quickFilterText")).toBe("창고");
    expect(api().getDisplayedRowCount()).toBe(2);
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("창고");
  });

  it("검색 칸은 그리드에 걸린 검색어로 시작하고, 가리키는 그리드가 바뀌면 그 그리드의 검색어로 맞춘다", async () => {
    const a: GridPanelGridControls = { setQuickFilter: vi.fn(), getQuickFilterText: () => "가" };
    const b: GridPanelGridControls = { setQuickFilter: vi.fn(), getQuickFilterText: () => "나" };
    await act(async () => void (r = renderWithMantine(createElement(GridQuickFilter, { controls: a }))));
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("가");
    await act(async () => rerender(r!, createElement(GridQuickFilter, { controls: b })));
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("나");
  });

  it("filter={true} 그리드의 검색 칸을 다시 마운트해도 걸린 검색어를 이어받는다(빈칸인데 행이 숨는 일이 없다)", async () => {
    await show(panel(gridEl({ gridId: "g", filter: true, personalize: false })));
    await typeQuick("부품");
    await until(() => api().getDisplayedRowCount() === 2, "거른 행 2");
    // 설정 메뉴가 없는 그리드로 바꿔 검색 칸을 거두고, 다시 켜서 새로 마운트시킨다.
    await show(panel(gridEl({ gridId: "g", filter: true, personalize: false, settingsMenu: false, excelExport: false })));
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("부품");
    expect(api().getDisplayedRowCount()).toBe(2);
  });
});

describe("3. 한 GridPanel 에 그리드가 여럿이면 대상이 엉키지 않는다", () => {
  it("엑셀이 꺼진 그리드가 앞서 있어도 엑셀이 켜진 그리드가 대상이라 엑셀 항목이 남는다", async () => {
    await show(panel(gridEl({ gridId: "a", personalize: false, excelExport: false }), gridEl({ gridId: "b", personalize: false, excelExport: undefined })));
    await openMenu();
    expect(tid("grid-excel")).not.toBeNull();
    expect(tid("grid-columns-reset-button")).not.toBeNull();
  });

  it("메뉴 대상이 아닌 filter 생략 그리드는 저장된 켜짐을 무시하고 꺼진 채 시작한다", async () => {
    ls.setItem(gridFilterKey("u1", SCREEN, "b"), JSON.stringify({ filterOpen: true }));
    // a 가 개인화 그리드라 메뉴·걸러 보기 대상이다. b 는 끌 메뉴가 없다.
    await show(panel(gridEl({ gridId: "a" }), gridEl({ gridId: "b", personalize: false })));
    // 검색 칸은 걸러 보기 대상(a)의 것 하나뿐이다
    expect(document.querySelectorAll('[data-testid="grid-quick-filter"]').length).toBe(1);
    expect(api(0).getGridOption("floatingFiltersHeight")).toBeUndefined();
    expect(api(1).getGridOption("floatingFiltersHeight")).toBeUndefined();
    expect(document.querySelectorAll(".ag-floating-filter").length).toBe(0);
    // 메뉴의 「칸별 필터 보기」 는 a 를 켠다.
    await toggleFilter();
    expect(tid("grid-quick-filter")).not.toBeNull();
    expect(api(0).getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    expect(api(1).getGridOption("floatingFiltersHeight")).toBeUndefined();
  });

  it("메뉴 대상은 filter 생략인데 다른 그리드가 filter={true} 면 「칸별 필터 보기」·검색 칸·건수가 그 filter={true} 그리드를 가리킨다", async () => {
    ls.setItem(gridOptsKey("u1", SCREEN, "a"), JSON.stringify({ filterOpen: true }));
    await show(panel(gridEl({ gridId: "a" }), gridEl({ gridId: "b", personalize: false, filter: true })));
    // a(메뉴 대상)의 저장된 켜짐은 무시된다 — 걸러 보기 대상은 b 다.
    expect(api(0).getGridOption("floatingFiltersHeight")).toBeUndefined();
    expect(api(1).getGridOption("floatingFiltersHeight")).toBe(0);
    await toggleFilter();
    expect(api(1).getGridOption("floatingFiltersHeight")).toBe(GRID_FILTER_ROW_HEIGHT);
    expect(api(0).getGridOption("floatingFiltersHeight")).toBeUndefined();
    await typeQuick("부품");
    await until(() => api(1).getDisplayedRowCount() === 2, "b 거름");
    expect(api(0).getDisplayedRowCount()).toBe(3);
    await until(() => tid("grid-panel-filter-count")?.textContent === "2 / 3건", "b 의 거른 건수");
  });

  it("걸러 보기 대상을 잃어 접히면 그 그리드의 조건이 지워진다", async () => {
    await show(panel(gridEl({ gridId: "a", personalize: false })));
    await toggleFilter();
    await typeQuick("부품");
    await until(() => api(0).getDisplayedRowCount() === 2, "a 거름");
    // filter={true} 그리드가 새로 들어오면 걸러 보기 대상이 그쪽으로 넘어간다.
    await show(panel(gridEl({ gridId: "a", personalize: false }), gridEl({ gridId: "b", personalize: false, filter: true })));
    await until(() => api(0).getDisplayedRowCount() === 3, "a 조건 해제");
    expect(api(0).getGridOption("quickFilterText")).toBe("");
    expect((tid("grid-quick-filter-input") as HTMLInputElement).value).toBe("");
  });
});

describe("4. 저장된 켜짐이 그리드 준비 뒤에 들어와도 칸 상태를 이어 준다", () => {
  it("personalize={false}: 사용자 확인이 마운트 뒤에 오면 켜지면서도 사용자가 바꾼 순서·너비가 그대로다", async () => {
    // 사용자 확인 전(공유 사용자 저장소가 빈 상태)으로 시작한다.
    clearCurrentUserCache();
    ls.setItem(gridFilterKey("u1", SCREEN, "main"), JSON.stringify({ filterOpen: true }));
    await show(panel(gridEl({ personalize: false })));
    await act(async () => {
      api().moveColumns(["qty"], 0);
      api().setColumnWidths([{ key: "name", newWidth: 222 }]);
    });
    const before = api().getColumnState().map((c) => `${c.colId}:${c.width}`).join();
    await seedCurrentUser("u1");
    await until(() => api().getGridOption("floatingFiltersHeight") === GRID_FILTER_ROW_HEIGHT, "저장된 켜짐 반영");
    await wait(30);
    expect(api().getColumnState().map((c) => `${c.colId}:${c.width}`).join()).toBe(before);
    expect(colIds(api())).toEqual(["qty", "code", "name"]);
  });
});

describe("5. [컬럼 원래대로]", () => {
  async function resetFrom(el: ReactElement) {
    await show(el);
    await act(async () => {
      api().moveColumns(["qty"], 0);
      api().setColumnWidths([{ key: "name", newWidth: 260 }]);
      api().applyColumnState({ state: [{ colId: "qty", sort: "desc" }] });
    });
    await openMenu();
  }

  it("정의 상태를 한 번에 적용해 정렬 이벤트가 나지 않고 정렬은 그대로다", async () => {
    await resetFrom(panel(gridEl({ personalize: false })));
    const sortChanged = vi.fn();
    api().addEventListener("sortChanged", sortChanged);
    await click(tid("grid-columns-reset-button"));
    await until(() => colIds(api()).join() === "code,name,qty", "정의 순서");
    expect(api().getColumn("name")!.getActualWidth()).toBe(120);
    expect(api().getColumn("qty")!.getSort()).toBe("desc");
    expect(sortChanged).not.toHaveBeenCalled();
  });

  it("선택 체크박스 열은 맨 앞에 남는다", async () => {
    await resetFrom(panel(gridEl({ personalize: false, selectable: true, multiSelect: true })));
    await click(tid("grid-columns-reset-button"));
    await until(() => colIds(api()).join() === "ag-Grid-SelectionColumn,code,name,qty", "선택 열 맨 앞");
  });

  it("auto 그리드는 타이머를 기다리지 않고 바로 자동 너비를 잰다", async () => {
    await resetFrom(panel(gridEl({ personalize: false, columnSizing: "auto" })));
    await wait(120);
    const auto = vi.spyOn(api(), "autoSizeAllColumns");
    await click(tid("grid-columns-reset-button"));
    expect(auto).toHaveBeenCalledTimes(1);
    await wait(120);
    expect(auto).toHaveBeenCalledTimes(1);
  });
});
