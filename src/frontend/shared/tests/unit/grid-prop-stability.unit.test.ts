/** @vitest-environment happy-dom */
/**
 * AgDataGrid 참조 안정화 — 호출자가 인라인 함수를 넘겨 다시 그려도 AgGridReact 에 내려가는 객체·콜백 참조가 바뀌지 않는다.
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
  it("인라인 isRowSelectable·getRowHeight·onRowOrderChange 를 새로 넘겨도 rowSelection·getRowHeight·onRowDragEnd 참조가 같다", async () => {
    const make = () =>
      grid({
        selectable: true,
        multiSelect: true,
        isRowSelectable: (row) => row.code !== "B",
        getRowHeight: () => 30,
        onRowOrderChange: () => {},
      });
    await act(async () => void (r = renderWithMantine(make())));
    await wait(30);
    const before = seen.at(-1)!;
    expect(before.rowSelection).toBeTruthy();
    const n = seen.length;
    await act(async () => rerender(r!, make()));
    await wait(30);
    expect(seen.length).toBeGreaterThan(n);
    const after = seen.at(-1)!;
    expect(after.rowSelection).toBe(before.rowSelection);
    expect(after.getRowHeight).toBe(before.getRowHeight);
    expect(after.onRowDragEnd).toBe(before.onRowDragEnd);
  });

  it("최신 isRowSelectable·getRowHeight 를 부른다 (ref 로 읽는다)", async () => {
    let allowed = "B";
    const make = (h: number) =>
      grid({
        selectable: true,
        isRowSelectable: (row) => row.code === allowed,
        getRowHeight: () => h,
      });
    await act(async () => void (r = renderWithMantine(make(30))));
    await wait(30);
    const first = seen.at(-1)!;
    allowed = "A";
    await act(async () => rerender(r!, make(44)));
    await wait(30);
    const last = seen.at(-1)!;
    const sel = (last.rowSelection as { isRowSelectable: (n: { data?: unknown }) => boolean }).isRowSelectable;
    expect(sel({ data: { code: "A" } })).toBe(true);
    expect(sel({ data: { code: "B" } })).toBe(false);
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
