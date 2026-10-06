/** @vitest-environment happy-dom */

/**
 * AgDataGrid 특성 시험(R0) — 파일을 여러 조각으로 나누기 전에 지금 동작을 그대로 고정한다.
 * 고치지 않을 것까지 적어 둔다(예: 선택 변경 알림은 임시 ID 를 무시하고 선택 동기화는 임시 ID 를 먼저 본다).
 *
 * 이미 덮인 축은 다시 쓰지 않는다.
 *  - 엑셀 열 순서: ag-data-grid-excel.unit.test.ts
 *  - 필드 오류·mdmValidate 렌더: grid-mdm-validate.unit.test.ts
 *  - 자동 너비 호출 순서: grid-personalize-autosize.unit.test.ts
 *  - 커서 클릭·↑↓·controlled·편집 그리드 ↓: grid-row-cursor-render.unit.test.ts
 *  - 편집 확정 때 행 선택의 순수 함수: grid-check-row-on-edit.unit.test.ts
 *  - 사용자 리사이즈 뒤 자동 너비 가드: grid-personalize-render.unit.test.ts "사용자가 바꾼 뒤에는 자동 너비가 바꾼 너비를 덮지 않는다"
 *
 * ag-grid api 는 AgGridReact.render 의 this 로 잡는다(grid-personalize-render 시험과 같은 방식).
 */
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { AgGridReact } from "ag-grid-react";
import type { GridApi, IRowNode } from "ag-grid-community";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { AgDataGrid, type AgDataGridProps } from "../../src/components/grid/AgDataGrid";
import { gridPrefKey } from "../../src/components/grid/grid-personalize";
import { TabPageContext } from "../../src/portal-shell/tab-page-context";
import { installMemoryLocalStorage, seedCurrentUser } from "./grid-personalize-test-env";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
const ls = installMemoryLocalStorage();

const TEMP = "__gridTempId";
type Row = Record<string, unknown>;

/** 시험마다 새로 만든다 — ag-grid 편집은 행 객체를 직접 고친다. */
const makeData = (): Row[] => [
  { id: 1, name: "가", qty: 10 },
  { id: 2, name: "나", qty: 20 },
  { id: 3, name: "다", qty: 30 },
];
const columns = [
  { key: "name", header: "이름" },
  { key: "qty", header: "수량" },
];
const editColumns = [
  { key: "name", header: "이름", editable: true },
  { key: "qty", header: "수량" },
];

let container: HTMLDivElement;
let root: Root | null = null;
let renderSpy: MockInstance;
let data: Row[];

const settle = (ms = 50) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

async function render(props: Partial<AgDataGridProps> & Record<string, unknown> = {}) {
  await act(async () => {
    root!.render(createElement(AgDataGrid, { columns, data, height: "auto", ...props } as never));
  });
  await settle();
}

function api(): GridApi {
  const list = (renderSpy.mock.contexts as Array<{ api?: GridApi }>).map((c) => c?.api).filter((a): a is GridApi => !!a && !a.isDestroyed());
  return list.at(-1)!;
}
const node = (id: string) => api().getRowNode(id)!;
const gridEl = () => container.querySelector(".cm-data-grid") as HTMLDivElement;
const rowEl = (rowId: string) => container.querySelector(`.ag-center-cols-container [row-id="${rowId}"]`) as HTMLElement;
const cellEl = (rowId: string, colId: string) => rowEl(rowId).querySelector(`[col-id="${colId}"]`) as HTMLElement;
const classesOf = (rowId: string) => Array.from(rowEl(rowId).classList);
const selectedIds = () => api().getSelectedNodes().map((n) => n.id);
/** 지금 그려진 모든 행 노드의 setSelected 를 지켜본다. */
const spyAllSetSelected = (): MockInstance[] => {
  const spies: MockInstance[] = [];
  api().forEachNode((n) => void spies.push(vi.spyOn(n, "setSelected")));
  return spies;
};
const redrawn = (spy: MockInstance) => spy.mock.calls.map((c) => (c[0] as { rowNodes?: IRowNode[] } | undefined)?.rowNodes?.map((n) => n.id) ?? null);

/** ag-grid 는 행 클릭·선택 이벤트를 비동기로 내보낸다 — 누른 뒤 한 번 가라앉힌다. */
async function click(el: Element) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}
async function keydown(key: string): Promise<KeyboardEvent> {
  const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  await act(async () => {
    gridEl().dispatchEvent(ev);
  });
  await settle();
  return ev;
}
/** 사용자가 칸을 두 번 눌러 편집을 연다(입력 칸이 떠 있어야 편집 중이다). */
async function startEdit(rowId: string, colId: string) {
  await act(async () => {
    cellEl(rowId, colId).dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  });
  await settle();
  expect(container.querySelector(".ag-cell-inline-editing input")).not.toBeNull();
}

beforeEach(() => {
  data = makeData();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  renderSpy = vi.spyOn(AgGridReact.prototype, "render");
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete (globalThis as Record<string, unknown>).__dkOasisGridPersonalizeRegistry__;
});

describe("선택 동기화 (selectedRows ↔ 체크 상태 ↔ onRowSelect)", () => {
  it("selectedRows 를 바꾸면 체크 상태가 따라간다 — 되울림 알림은 실제로는 나가며, 늘 반영이 끝난 집합을 싣는다", async () => {
    // 동기화 가드(selectionSyncRef)는 microtask 에서 풀리는데 ag-grid 의 selectionChanged 콜백은 그보다 늦게(비동기) 와서,
    // 지금은 가드가 되울림을 막지 못한다. 고치지 않고 그대로 고정한다 — 알림 내용은 중간 집합이 아니라 최종 집합이다.
    const onRowSelect = vi.fn();
    const props = { selectable: true, multiSelect: true, rowKey: "id", onRowSelect } as const;
    await render({ ...props, selectedRows: [1] });
    await render({ ...props, selectedRows: [1] }); // 새 배열로 다시 렌더 — 첫 렌더 값은 아래 시험 참조
    expect(selectedIds()).toEqual(["1"]);
    expect(Array.from(container.querySelectorAll(".ag-center-cols-container .ag-row-selected")).map((e) => e.getAttribute("row-id"))).toEqual(["1"]);

    onRowSelect.mockClear();
    await render({ ...props, selectedRows: [2, 3] });
    expect(selectedIds().sort()).toEqual(["2", "3"]);
    expect(onRowSelect).toHaveBeenCalled();
    for (const [ids] of onRowSelect.mock.calls) expect(ids).toEqual([2, 3]);

    onRowSelect.mockClear();
    await render({ ...props, selectedRows: [] });
    expect(selectedIds()).toEqual([]);
    expect(onRowSelect).toHaveBeenCalled();
    for (const [ids, rows] of onRowSelect.mock.calls) {
      expect(ids).toEqual([]);
      expect(rows).toEqual([]);
    }
  });

  it("마운트 첫 렌더의 selectedRows 는 아직 반영되지 않는다 — selectedRows(새 배열)·data 가 바뀐 다음 렌더에 반영된다(지금 동작 그대로)", async () => {
    // 동기화 효과는 첫 렌더 때 행이 올라오기 전에 돌고, 그 뒤 deps(selectedRows·selectable·rowKey·data)가 안 바뀌면 다시 돌지 않는다.
    await render({ selectable: true, multiSelect: true, rowKey: "id", selectedRows: [1] });
    expect(selectedIds()).toEqual([]);
    await render({ selectable: true, multiSelect: true, rowKey: "id", selectedRows: [1] });
    expect(selectedIds()).toEqual(["1"]);
  });

  it("selectable 이 아니거나 selectedRows 가 없으면 동기화하지 않는다 — 어느 행에도 setSelected 를 부르지 않는다", async () => {
    // selectable=false 는 ag-grid 에 선택 모드를 주지 않아 setSelected 가 결과를 못 바꾼다 — 그래서 선택 결과가 아니라 호출 여부를 본다.
    await render({ selectable: false, rowKey: "id", selectedRows: [1] });
    const spies = spyAllSetSelected();
    await render({ selectable: false, rowKey: "id", selectedRows: [1] }); // 새 배열로 다시 렌더 — 동기화 효과가 돌 자리
    expect(selectedIds()).toEqual([]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();

    await render({ selectable: true, multiSelect: true, rowKey: "id" });
    const spies2 = spyAllSetSelected();
    await render({ selectable: true, multiSelect: true, rowKey: "id" });
    for (const spy of spies2) expect(spy).not.toHaveBeenCalled();
  });

  it("사용자가 체크하면 onRowSelect(ids, data) — 한 건이면 data 는 객체, 여러 건이면 배열", async () => {
    const onRowSelect = vi.fn();
    await render({ selectable: true, multiSelect: true, rowKey: "id", onRowSelect });
    const checkbox = (rowId: string) => rowEl(rowId).querySelector(".ag-selection-checkbox input") as HTMLInputElement;
    expect(checkbox("1")).not.toBeNull();

    await click(checkbox("1"));
    expect(onRowSelect).toHaveBeenLastCalledWith([1], data[0]);

    await click(checkbox("3"));
    expect(onRowSelect).toHaveBeenLastCalledWith([1, 3], [data[0], data[2]]);
  });

  it("임시 ID 행: 선택 변경 알림은 임시 ID 를 무시하고 rowKey 값을 쓰지만, 선택 동기화는 임시 ID 를 먼저 본다", async () => {
    data = [
      { id: 7, name: "임시", [TEMP]: "tmp-1" },
      { id: 8, name: "일반" },
    ];
    const onRowSelect = vi.fn();
    const props = { selectable: true, multiSelect: true, rowKey: "id", onRowSelect } as const;
    await render({ ...props, selectedRows: ["tmp-1"] });
    await render({ ...props, selectedRows: ["tmp-1"] });
    // 동기화: 임시 ID 로 찾는다 — 행 id 는 임시 ID 이고, rowKey 값(7)으로는 선택되지 않는다.
    expect(selectedIds()).toEqual(["tmp-1"]);
    // 같은 선택의 되울림 알림은 임시 ID 가 아니라 rowKey 값(7)을 싣는다 — 동기화와 알림의 ID 기준이 다르다(고치지 않는다).
    expect(onRowSelect).toHaveBeenCalled();
    for (const call of onRowSelect.mock.calls) expect(call).toEqual([[7], data[0]]);
    await render({ ...props, selectedRows: [7] });
    expect(selectedIds()).toEqual([]);
    onRowSelect.mockClear();

    // 알림: 사용자가 임시 ID 행을 체크하면 ids 에는 임시 ID 가 아니라 rowKey 값(7)이 실린다(불일치 그대로 고정).
    await render({ ...props, selectedRows: undefined });
    await click(rowEl("tmp-1").querySelector(".ag-selection-checkbox input")!);
    expect(onRowSelect).toHaveBeenLastCalledWith([7], data[0]);
  });

  it("rowClickCheck: 일반 칸 클릭은 토글하고, 제외 열·입력 칸·체크박스 대상 클릭은 토글하지 않는다", async () => {
    const onRowSelect = vi.fn();
    await render({ selectable: true, multiSelect: true, rowKey: "id", rowClickCheck: true, selectExcludeColumns: ["qty"], onRowSelect });

    await click(cellEl("1", "name"));
    expect(selectedIds()).toEqual(["1"]);
    await click(cellEl("1", "name"));
    expect(selectedIds()).toEqual([]);

    await click(cellEl("2", "qty"));
    expect(selectedIds()).toEqual([]);

    const input = document.createElement("input");
    cellEl("2", "name").appendChild(input);
    await click(input);
    expect(selectedIds()).toEqual([]);

    // 체크박스를 직접 누르면 ag-grid 가 한 번 토글한다 — 행 클릭 쪽에서 또 토글하면 도로 풀린다.
    await click(rowEl("3").querySelector(".ag-selection-checkbox input")!);
    expect(selectedIds()).toEqual(["3"]);
  });

  it("rowClickCheck 는 selectable 이 아니면 setSelected 를 부르지 않는다", async () => {
    await render({ selectable: false, rowKey: "id", rowClickCheck: true });
    const spies = spyAllSetSelected();
    await click(cellEl("1", "name"));
    expect(selectedIds()).toEqual([]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("enableRowClickSelect: 제외 열이 아닌 칸을 누르면 토글하고, 제외 열이면 토글하지 않는다", async () => {
    await render({ selectable: true, multiSelect: true, rowKey: "id", enableRowClickSelect: true, selectExcludeColumns: ["qty"] });
    await click(cellEl("1", "name"));
    expect(selectedIds()).toEqual(["1"]);
    await click(cellEl("2", "qty"));
    expect(selectedIds()).toEqual(["1"]);
    await click(cellEl("1", "name"));
    expect(selectedIds()).toEqual([]);
  });
});

describe("편집 확정 (onCellValueChanged · checkRowOnEdit)", () => {
  /** 사용자가 입력 칸에 값을 쓰고 편집을 끝낸다. */
  async function typeAndCommit(value: string) {
    const input = container.querySelector(".ag-cell-inline-editing input") as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => void api().stopEditing());
    await settle();
  }

  it("사용자 편집 — 인자는 {rowKey, field, newValue, oldValue, row}", async () => {
    const onCellValueChanged = vi.fn();
    await render({ columns: editColumns, rowKey: "id", onCellValueChanged });
    await startEdit("2", "name");
    await typeAndCommit("새이름");
    expect(onCellValueChanged).toHaveBeenCalledTimes(1);
    expect(onCellValueChanged).toHaveBeenCalledWith({ rowKey: 2, field: "name", newValue: "새이름", oldValue: "나", row: data[1] });
    expect(data[1].name).toBe("새이름");
  });

  it("api 로 값을 바꿔도 같은 알림이 가고, 임시 ID 행은 rowKey 자리에 임시 ID 가 실린다", async () => {
    data = [{ id: 5, name: "임시", [TEMP]: "tmp-9" }];
    const onCellValueChanged = vi.fn();
    await render({ columns: editColumns, rowKey: "id", onCellValueChanged });
    await act(async () => void node("tmp-9").setDataValue("name", "바뀜"));
    await settle();
    expect(onCellValueChanged).toHaveBeenCalledWith({ rowKey: "tmp-9", field: "name", newValue: "바뀜", oldValue: "임시", row: data[0] });
  });

  it("checkRowOnEdit + selectable 이면 편집한 행이 실제로 체크된다", async () => {
    const onRowSelect = vi.fn();
    await render({ columns: editColumns, rowKey: "id", selectable: true, multiSelect: true, checkRowOnEdit: true, onRowSelect });
    expect(selectedIds()).toEqual([]);
    await startEdit("3", "name");
    await typeAndCommit("편집");
    expect(selectedIds()).toEqual(["3"]);
    expect(rowEl("3").classList.contains("ag-row-selected")).toBe(true);
    expect(onRowSelect).toHaveBeenLastCalledWith([3], data[2]);
  });

  it("checkRowOnEdit 가 없으면 편집해도 체크하지 않는다", async () => {
    await render({ columns: editColumns, rowKey: "id", selectable: true, multiSelect: true });
    await act(async () => void node("3").setDataValue("name", "편집"));
    await settle();
    expect(selectedIds()).toEqual([]);
  });
});

describe("getRowClass 와 다시 그리기", () => {
  it("_rowState·nativeeditor_status 에 따라 삭제·추가·수정 클래스가 붙는다", async () => {
    data = [
      { id: 1, name: "a", _rowState: "deleted" },
      { id: 2, name: "b", _rowState: "added" },
      { id: 3, name: "c", _rowState: "copied" },
      { id: 4, name: "d", _rowState: "modified" },
      { id: 5, name: "e", nativeeditor_status: "deleted" },
      { id: 6, name: "f" },
    ];
    await render({ rowKey: "id" });
    expect(classesOf("1")).toContain("ag-row-deleted");
    expect(classesOf("2")).toContain("ag-row-inserted");
    expect(classesOf("3")).toContain("ag-row-inserted");
    expect(classesOf("4")).toContain("ag-row-modified");
    expect(classesOf("5")).toContain("ag-row-deleted");
    for (const cls of ["ag-row-deleted", "ag-row-inserted", "ag-row-modified", "ag-row-highlighted"]) expect(classesOf("6")).not.toContain(cls);
  });

  it("커서 행에는 ag-row-highlighted 가 붙는다", async () => {
    await render({ rowKey: "id", highlightedRowKey: 2 });
    expect(classesOf("2")).toContain("ag-row-highlighted");
    expect(classesOf("1")).not.toContain("ag-row-highlighted");
  });

  it("getRowClassExtra — 문자열도 배열도 행 클래스로 붙는다", async () => {
    await render({
      rowKey: "id",
      getRowClassExtra: (row: Row) => (row.id === 1 ? "extra-one" : row.id === 2 ? ["extra-a", "extra-b"] : undefined),
    });
    expect(classesOf("1")).toContain("extra-one");
    expect(classesOf("2")).toEqual(expect.arrayContaining(["extra-a", "extra-b"]));
    expect(classesOf("3").some((c) => c.startsWith("extra-"))).toBe(false);
  });

  it("_rowState 가 바뀐 행만 redrawRows({rowNodes}) 로 다시 그리고 새 클래스가 붙는다", async () => {
    await render({ rowKey: "id" });
    const spy = vi.spyOn(api(), "redrawRows");
    data = [data[0], { ...data[1], _rowState: "modified" }, data[2]];
    await render({ rowKey: "id" });
    expect(redrawn(spy)).toEqual([["2"]]);
    expect(classesOf("2")).toContain("ag-row-modified");
    expect(classesOf("1")).not.toContain("ag-row-modified");
  });

  it("nativeeditor_status 가 바뀐 행도 그 행만 다시 그린다", async () => {
    await render({ rowKey: "id" });
    const spy = vi.spyOn(api(), "redrawRows");
    data = [data[0], data[1], { ...data[2], nativeeditor_status: "deleted" }];
    await render({ rowKey: "id" });
    expect(redrawn(spy)).toEqual([["3"]]);
    expect(classesOf("3")).toContain("ag-row-deleted");
  });

  it("상태가 같은 데이터로 다시 렌더하면 다시 그리지 않는다", async () => {
    await render({ rowKey: "id" });
    const spy = vi.spyOn(api(), "redrawRows");
    data = data.map((r) => ({ ...r }));
    await render({ rowKey: "id" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rowClassRefreshToken 이 바뀌면 인자 없이 redrawRows() 로 전체를 다시 그린다", async () => {
    let flag = false;
    const getRowClassExtra = (row: Row) => (flag && row.id === 1 ? "late" : undefined);
    await render({ rowKey: "id", getRowClassExtra, rowClassRefreshToken: 1 });
    expect(classesOf("1")).not.toContain("late");
    const spy = vi.spyOn(api(), "redrawRows");
    flag = true;
    await render({ rowKey: "id", getRowClassExtra, rowClassRefreshToken: 2 });
    expect(spy.mock.calls.at(-1)).toEqual([]);
    expect(classesOf("1")).toContain("late");
  });

  it("nativeeditor_status === inserted 행은 표시 순서 맨 뒤로 간다", async () => {
    data = [
      { id: 1, name: "새로", nativeeditor_status: "inserted" },
      { id: 2, name: "나" },
      { id: 3, name: "다" },
      { id: 4, name: "또새로", nativeeditor_status: "inserted" },
    ];
    await render({ rowKey: "id" });
    const order = Array.from({ length: api().getDisplayedRowCount() }, (_, i) => api().getDisplayedRowAtIndex(i)!.id);
    expect(order).toEqual(["2", "3", "1", "4"]);
  });
});

describe("행 커서의 나머지", () => {
  it("행을 더블클릭하면 onRowDoubleClick(row, event)", async () => {
    const onRowDoubleClick = vi.fn();
    await render({ rowKey: "id", onRowDoubleClick });
    await act(async () => {
      cellEl("2", "name").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    await settle();
    expect(onRowDoubleClick).toHaveBeenCalledTimes(1);
    expect(onRowDoubleClick).toHaveBeenCalledWith(data[1], expect.any(MouseEvent));
  });

  it("onRowExpandCollapse 가 있으면 →/← 가 커서 행 키와 expand 값으로 부르고 기본 동작을 막는다", async () => {
    const onRowExpandCollapse = vi.fn();
    await render({ rowKey: "id", highlightedRowKey: 2, onRowExpandCollapse });
    const right = await keydown("ArrowRight");
    expect(onRowExpandCollapse).toHaveBeenLastCalledWith(2, true);
    expect(right.defaultPrevented).toBe(true);
    const left = await keydown("ArrowLeft");
    expect(onRowExpandCollapse).toHaveBeenLastCalledWith(2, false);
    expect(left.defaultPrevented).toBe(true);
  });

  it("커서가 없으면 →/← 는 콜백을 부르지 않고 기본 동작도 막지 않는다", async () => {
    const onRowExpandCollapse = vi.fn();
    await render({ rowKey: "id", onRowExpandCollapse });
    const ev = await keydown("ArrowRight");
    expect(onRowExpandCollapse).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("onRowExpandCollapse 가 없으면 →/← 를 가로채지 않는다", async () => {
    await render({ rowKey: "id", highlightedRowKey: 2 });
    const ev = await keydown("ArrowRight");
    expect(ev.defaultPrevented).toBe(false);
  });

  it("편집 가능한 열이 있는 그리드는 칸 포커스 행 데이터로 onFocusedRowChange 를 부른다", async () => {
    const onFocusedRowChange = vi.fn();
    await render({ columns: editColumns, rowKey: "id", onFocusedRowChange });
    await act(async () => void api().setFocusedCell(1, "name"));
    await settle();
    expect(onFocusedRowChange).toHaveBeenLastCalledWith(data[1]);
  });

  it("커서가 A 에서 B 로 옮겨 가면 redrawRows 에는 이전 행 A 와 새 행 B 두 개만 넘어간다", async () => {
    await render({ rowKey: "id", highlightedRowKey: 1 });
    const spy = vi.spyOn(api(), "redrawRows");
    await render({ rowKey: "id", highlightedRowKey: 2 });
    expect(redrawn(spy)).toEqual([["1", "2"]]);
    expect(classesOf("2")).toContain("ag-row-highlighted");
    expect(classesOf("1")).not.toContain("ag-row-highlighted");
  });

  it("임시 ID 행을 클릭하면 onRowClick 의 row[rowKey] 가 임시 ID 이고 원본 행은 그대로다", async () => {
    data = [{ id: 7, name: "임시", [TEMP]: "tmp-1" }, { id: 8, name: "일반" }];
    const onRowClick = vi.fn();
    await render({ rowKey: "id", onRowClick });
    await click(cellEl("tmp-1", "name"));
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick.mock.calls[0][0]).toEqual({ id: "tmp-1", name: "임시", [TEMP]: "tmp-1" });
    expect(data[0].id).toBe(7);

    await click(cellEl("8", "name"));
    expect(onRowClick.mock.calls[1][0]).toBe(data[1]);
  });
});

describe("훅 경계를 넘는 ref", () => {
  it("pendingHighlightRedrawRef: 편집 중인 행으로 커서를 옮기면 그 행은 바로 다시 그리지 않고 편집이 끝난 다음 틱에 그린다", async () => {
    await render({ columns: editColumns, rowKey: "id", highlightedRowKey: 2 });
    await startEdit("1", "name");
    const spy = vi.spyOn(api(), "redrawRows");

    await render({ columns: editColumns, rowKey: "id", highlightedRowKey: 1 });
    // 이전 커서 행(2)만 바로 그린다 — 편집 중인 행(1)을 그리면 편집기가 닫힌다.
    expect(redrawn(spy)).toEqual([["2"]]);
    expect(container.querySelector(".ag-cell-inline-editing input")).not.toBeNull();

    await act(async () => void api().stopEditing());
    await settle();
    expect(redrawn(spy)).toEqual([["2"], ["1"]]);
    expect(classesOf("1")).toContain("ag-row-highlighted");
  });

  it("pendingHighlightRedrawRef: 편집 중인 행에서 커서를 떼어도 이전 행은 편집이 끝난 뒤에 그린다", async () => {
    await render({ columns: editColumns, rowKey: "id", highlightedRowKey: 1 });
    await startEdit("1", "name");
    const spy = vi.spyOn(api(), "redrawRows");

    await render({ columns: editColumns, rowKey: "id", highlightedRowKey: 3 });
    expect(redrawn(spy)).toEqual([["3"]]);
    expect(container.querySelector(".ag-cell-inline-editing input")).not.toBeNull();
    expect(classesOf("1")).toContain("ag-row-highlighted");

    await act(async () => void api().stopEditing());
    await settle();
    expect(redrawn(spy)).toEqual([["3"], ["1"]]);
    expect(classesOf("1")).not.toContain("ag-row-highlighted");
  });

  it("pendingHighlightRedrawRef: rowClassRefreshToken 이 편집 중에 바뀌면 편집 중인 행만 빼고 그리고, 그 행은 편집이 끝난 뒤에 그린다", async () => {
    await render({ columns: editColumns, rowKey: "id", rowClassRefreshToken: 1 });
    await startEdit("2", "name");
    const spy = vi.spyOn(api(), "redrawRows");
    await render({ columns: editColumns, rowKey: "id", rowClassRefreshToken: 2 });
    // 편집 중인 행(2)을 뺀 나머지만 바로 그린다.
    expect(redrawn(spy)).toEqual([["1", "3"]]);
    await act(async () => void api().stopEditing());
    await settle();
    expect(redrawn(spy)).toEqual([["1", "3"], ["2"]]);
  });

  describe("userResizedRef", () => {
    const SCREEN = "scr-char";
    const KEY = gridPrefKey("u1", SCREEN, "main");
    const cols = [
      { key: "code", header: "코드", width: 100 },
      { key: "name", header: "이름", width: 120 },
    ];
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ code: `C${i}`, name: `이름${i}` }));
    let r: Rendered | null = null;

    const el = (n: number): ReactElement =>
      createElement(
        TabPageContext.Provider,
        { value: { pageId: SCREEN, serviceId: "", tabId: "t1" } },
        createElement(AgDataGrid, { columns: cols, rowKey: "code", data: rows(n), columnSizing: "auto", height: "auto" } as never),
      );

    afterEach(async () => {
      await act(async () => r?.unmount());
      r = null;
      ls.clear();
    });

    it("사용자 리사이즈 뒤에는 데이터 갱신에 자동 너비가 돌지 않고, 기본값 복원 뒤에는 다시 돈다", async () => {
      ls.clear();
      await seedCurrentUser("u1");
      await act(async () => void (r = renderWithMantine(el(2))));
      await settle(120);
      const a = api();
      // 너비를 끌면 저장 너비가 생겨 자동 너비가 autoSizeAllColumns 대신 autoSizeColumns(나머지 컬럼) 로 가므로 둘 다 센다.
      const allSpy = vi.spyOn(a, "autoSizeAllColumns");
      const someSpy = vi.spyOn(a, "autoSizeColumns");
      const autoCalls = () => allSpy.mock.calls.length + someSpy.mock.calls.length;

      // 데이터 갱신 — 아직 사용자가 건드리지 않았으니 자동 너비가 돈다.
      await act(async () => rerender(r!, el(3)));
      await settle(200);
      expect(autoCalls()).toBeGreaterThan(0);
      allSpy.mockClear();
      someSpy.mockClear();

      // 사용자가 컬럼 너비를 끌었다
      await act(async () => void a.setColumnWidths([{ key: "code", newWidth: 222 }]));
      await act(
        async () =>
          void a.dispatchEvent({ type: "columnResized", source: "uiColumnResized", finished: true, columns: [a.getColumn("code")] } as never),
      );
      await settle(10);

      await act(async () => rerender(r!, el(4)));
      await settle(200);
      expect(autoCalls()).toBe(0);
      expect(a.getColumn("code")!.getActualWidth()).toBe(222);

      // 개인화 [기본값 복원] — userResized 를 풀고 자동 너비를 다시 돌린다.
      const header = document.querySelector('.ag-header-cell[col-id="code"]')!;
      await act(async () => void header.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 30 })));
      await settle(50);
      const reset = document.querySelector<HTMLElement>('[data-testid="grid-header-menu-reset"]')!;
      expect(reset).not.toBeNull();
      await act(async () => void reset.click());
      await settle(200);
      expect(ls.getItem(KEY)).toBeNull();
      expect(autoCalls()).toBeGreaterThan(0);

      // 복원 뒤에는 데이터 갱신에도 자동 너비가 다시 돈다(userResizedRef 가 풀렸다).
      allSpy.mockClear();
      someSpy.mockClear();
      await act(async () => rerender(r!, el(5)));
      await settle(200);
      expect(autoCalls()).toBeGreaterThan(0);
    });
  });
});
