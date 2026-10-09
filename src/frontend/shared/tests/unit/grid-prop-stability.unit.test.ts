/** @vitest-environment happy-dom */
/**
 * AgDataGrid 참조 안정화 — 호출자가 인라인 getRowHeight·onRowOrderChange 를 넘겨 다시 그려도 AgGridReact 에 내려가는 콜백 참조가 바뀌지 않는다.
 * isRowSelectable 은 ag-grid 가 참조 변경으로 선택 가능 여부를 다시 계산하므로 참조를 그대로 따른다.
 * 마운트 때 GridPanel 안 그리드가 다시 그려지는 횟수도 함께 본다.
 */
import { act, createElement } from "react";
import { AgGridReact } from "ag-grid-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AgDataGrid, type AgDataGridProps, type GridColumn } from "../../src/components/grid/AgDataGrid";
import { GridPanel } from "../../src/components/grid/GridPanel";
import { renderWithMantine, rerender, type Rendered } from "./mantine-test-utils";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const COLUMNS: GridColumn[] = [
  { key: "code", header: "코드", width: 100 },
  { key: "name", header: "이름", width: 120 },
];
const DATA = [
  { code: "A", name: "가" },
  { code: "B", name: "나" },
];

let r: Rendered | null = null;
let seen: Array<Record<string, unknown>> = [];

beforeEach(() => {
  seen = [];
  const original = AgGridReact.prototype.render;
  vi.spyOn(AgGridReact.prototype, "render").mockImplementation(function (this: AgGridReact) {
    seen.push({ ...(this.props as Record<string, unknown>) });
    return original.call(this);
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await act(async () => r?.unmount());
  r = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

const wait = (ms: number) =>
  act(async () => {
    await new Promise((res) => setTimeout(res, ms));
  });

function grid(props: Partial<AgDataGridProps> = {}) {
  return createElement(AgDataGrid, { columns: COLUMNS, rowKey: "code", data: DATA, columnSizing: "fixed", height: 200, excelExport: false, ...props });
}

describe("AgDataGrid 참조 안정화", () => {
  it("인라인 getRowHeight·onRowOrderChange 를 새로 넘겨도 getRowHeight·onRowDragEnd 참조가 같다", async () => {
    const make = () => grid({ selectable: true, multiSelect: true, getRowHeight: () => 30, onRowOrderChange: () => {} });
    await act(async () => void (r = renderWithMantine(make())));
    await wait(30);
    const before = seen.at(-1)!;
    const n = seen.length;
    await act(async () => rerender(r!, make()));
    await wait(30);
    expect(seen.length).toBeGreaterThan(n);
    const after = seen.at(-1)!;
    expect(after.rowSelection).toBe(before.rowSelection);
    expect(after.getRowHeight).toBe(before.getRowHeight);
    expect(after.onRowDragEnd).toBe(before.onRowDragEnd);
  });

  it("isRowSelectable 참조를 고정하면 rowSelection 도 고정되고, 새 함수를 넘기면 새 rowSelection 으로 다시 계산시킨다", async () => {
    const stable = (row: Record<string, unknown>) => row.code !== "B";
    await act(async () => void (r = renderWithMantine(grid({ selectable: true, isRowSelectable: stable }))));
    await wait(30);
    const first = seen.at(-1)!.rowSelection;
    await act(async () => rerender(r!, grid({ selectable: true, isRowSelectable: stable })));
    await wait(30);
    expect(seen.at(-1)!.rowSelection).toBe(first);
    await act(async () => rerender(r!, grid({ selectable: true, isRowSelectable: (row) => row.code === "B" })));
    await wait(30);
    const next = seen.at(-1)!.rowSelection as { isRowSelectable: (n: { data?: unknown }) => boolean };
    expect(next).not.toBe(first);
    expect(next.isRowSelectable({ data: { code: "B" } })).toBe(true);
  });

  it("getRowHeight 는 최신 함수를 부른다 (ref 로 읽는다)", async () => {
    const make = (h: number) => grid({ getRowHeight: () => h });
    await act(async () => void (r = renderWithMantine(make(30))));
    await wait(30);
    const first = seen.at(-1)!;
    await act(async () => rerender(r!, make(44)));
    await wait(30);
    const last = seen.at(-1)!;
    expect((last.getRowHeight as (p: { data?: unknown }) => number)({ data: {} })).toBe(44);
    expect(last.getRowHeight).toBe(first.getRowHeight);
  });

  it("isRowSelectable·getRowHeight 를 주지 않으면 undefined 를 내린다", async () => {
    await act(async () => void (r = renderWithMantine(grid({ selectable: true }))));
    await wait(30);
    const last = seen.at(-1)!;
    expect(last.getRowHeight).toBeUndefined();
    expect((last.rowSelection as { isRowSelectable?: unknown }).isRowSelectable).toBeUndefined();
  });
});

describe("입력 배열 안정화 (화면이 rows·columns 를 렌더마다 새로 만드는 경우)", () => {
  it("원소가 같으면 rowData·columnDefs 참조가 그대로다", async () => {
    const make = () => grid({ columns: COLUMNS.map((c) => ({ ...c })), data: DATA.map((row) => row) });
    await act(async () => void (r = renderWithMantine(make())));
    await wait(30);
    const before = seen.at(-1)!;
    const n = seen.length;
    await act(async () => rerender(r!, make()));
    await wait(30);
    expect(seen.length).toBeGreaterThan(n);
    const after = seen.at(-1)!;
    expect(after.rowData).toBe(before.rowData);
    expect(after.columnDefs).toBe(before.columnDefs);
  });

  it("한 행만 새 객체로 바뀌면 rowData 는 새 배열이고 그 행의 셀만 갱신된다", async () => {
    const make = (name: string) => grid({ data: [DATA[0], { code: "B", name }] });
    await act(async () => void (r = renderWithMantine(make("나"))));
    await wait(30);
    const before = seen.at(-1)!;
    const cell = (id: string) => document.querySelector(`.ag-row[row-id="${id}"] .ag-cell[col-id="name"]`);
    const cellA = cell("A");
    expect(cell("B")?.textContent).toBe("나");
    await act(async () => rerender(r!, make("다")));
    await wait(30);
    const after = seen.at(-1)!;
    expect(after.rowData).not.toBe(before.rowData);
    expect(after.columnDefs).toBe(before.columnDefs);
    expect(cell("B")?.textContent).toBe("다");
    expect(cell("A")).toBe(cellA);
  });
});

describe("마운트 다시 그리기", () => {
  it("GridPanel 안 그리드는 마운트 때 AgGridReact 를 3번 넘게 그리지 않는다", async () => {
    // 최소는 첫 렌더 + 자리(host)·대상 정함 + gridReady 세 번이다 — 대상 등록·해제가 더 얹히면 늘어난다.
    await act(async () => {
      r = renderWithMantine(createElement(GridPanel, { title: "목록" }, grid()));
    });
    await wait(60);
    expect(seen.length).toBeLessThanOrEqual(3);
  });
});
