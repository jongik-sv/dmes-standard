/** @vitest-environment happy-dom */
// 새 창 분리 때 AgDataGrid(gridId)의 체크 선택·스크롤·포커스 칸·자체 커서를 이어받는다(설계 2026-10-06-popout-carry-state-design §4.7).
// 앞쪽은 가짜 ag-grid api 로 useGridCarry 를 직접 보고, 뒤쪽은 실제 ag-grid(AgDataGrid)로 복원·왕복을 본다.
import { act, createElement, StrictMode, useRef, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgDataGrid } from "../../src/components/grid/AgDataGrid";
import { GRID_TEMP_ID_FIELD } from "../../src/components/grid/GridPanel";
import {
  GRID_CARRY_MAX_SELECTION,
  buildGridInitialState,
  useGridCarry,
  type UseGridCarryOptions,
} from "../../src/components/grid/useGridCarry";
import { CarryStateProvider, createCarryRegistry, type CarryRegistry } from "../../src/portal-shell/carry-state";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const columns = [{ key: "name", header: "이름" }];
const data = [
  { id: 1, name: "가" },
  { id: 2, name: "나" },
  { id: 3, name: "다" },
];
let container: HTMLDivElement;
let root: Root | null = null;

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}

function restoreRegistry(light: Record<string, unknown>): CarryRegistry {
  return createCarryRegistry({ light, bulky: {}, hadBulky: false });
}

function wrap(element: ReactNode, registry: CarryRegistry | null, strict: boolean): ReactNode {
  const tree = registry ? createElement(CarryStateProvider, { registry, children: element }) : element;
  return strict ? createElement(StrictMode, null, tree) : tree;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  container.remove();
  vi.restoreAllMocks();
});

describe("buildGridInitialState", () => {
  it("복원값의 체크 선택·스크롤·포커스 칸만 initialState 로 만든다", () => {
    const value = {
      rowSelection: ["2"],
      scroll: { top: 40, left: 0 },
      focusedCell: { colId: "name", rowIndex: 1, rowPinned: null },
      cursor: "3",
    };
    expect(buildGridInitialState(value, { selectable: true, selectedRowsControlled: false })).toEqual({
      rowSelection: ["2"],
      scroll: { top: 40, left: 0 },
      focusedCell: { colId: "name", rowIndex: 1, rowPinned: null },
    });
  });

  it("selectable 이 아니거나 selectedRows 제어형이면 체크 선택을 뺀다", () => {
    const value = { rowSelection: ["2"], scroll: { top: 1, left: 2 } };
    expect(buildGridInitialState(value, { selectable: false, selectedRowsControlled: false })).toEqual({ scroll: { top: 1, left: 2 } });
    expect(buildGridInitialState(value, { selectable: true, selectedRowsControlled: true })).toEqual({ scroll: { top: 1, left: 2 } });
  });

  it("넘길 칸이 없거나 값이 없으면 undefined", () => {
    expect(buildGridInitialState(undefined, { selectable: true, selectedRowsControlled: false })).toBeUndefined();
    expect(buildGridInitialState(null, { selectable: true, selectedRowsControlled: false })).toBeUndefined();
    expect(buildGridInitialState({ cursor: "1" }, { selectable: true, selectedRowsControlled: false })).toBeUndefined();
    expect(buildGridInitialState({ rowSelection: [] }, { selectable: true, selectedRowsControlled: false })).toBeUndefined();
  });
});

// ---- 가짜 api 로 보는 useGridCarry ----

interface FakeApi {
  calls: string[];
  editing: boolean;
  state: Record<string, unknown>;
  isDestroyed: () => boolean;
  getEditingCells: () => unknown[];
  stopEditing: () => void;
  getState: () => Record<string, unknown>;
}

function makeApi(state: Record<string, unknown> = {}, editing = false): FakeApi {
  const api: FakeApi = {
    calls: [],
    editing,
    state,
    isDestroyed: () => false,
    getEditingCells: () => (api.editing ? [{ rowIndex: 0 }] : []),
    stopEditing: () => {
      api.calls.push("stopEditing");
      api.editing = false;
    },
    getState: () => {
      api.calls.push("getState");
      return api.state;
    },
  };
  return api;
}

interface ProbeProps extends Partial<Omit<UseGridCarryOptions, "gridRef" | "containerRef" | "highlightedRowKeyRef">> {
  api?: FakeApi;
  /** 커서 ref 의 현재 값(useRowCursor 가 커밋 때 맞추는 값). */
  cursor?: string | number | null;
  inDialog?: boolean;
  onInitial?: (state: unknown) => void;
}

function Probe(props: ProbeProps) {
  const gridRef = { current: props.api ? { api: props.api } : null } as unknown as UseGridCarryOptions["gridRef"];
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<string | number | null>(props.cursor ?? null);
  cursorRef.current = props.cursor ?? null;
  const { initialState } = useGridCarry({
    gridRef,
    containerRef,
    gridReady: props.gridReady ?? true,
    gridId: props.gridId,
    data: props.data ?? data,
    rowKey: props.rowKey ?? "id",
    selectable: props.selectable ?? true,
    selectedRows: props.selectedRows,
    cursorControlled: props.cursorControlled ?? false,
    highlightedRowKeyRef: cursorRef,
    setOwnCursorKey: props.setOwnCursorKey ?? (() => {}),
    onRowClick: props.onRowClick,
  });
  props.onInitial?.(initialState);
  const inner = createElement("div", { ref: containerRef });
  return props.inDialog ? createElement("div", { role: "dialog" }, inner) : inner;
}

async function mountProbe(props: ProbeProps, registry: CarryRegistry | null, strict = false) {
  await act(async () => {
    root!.render(wrap(createElement(Probe, props), registry, strict));
  });
}

describe("useGridCarry — 모으기", () => {
  it("편집기를 먼저 확정한 뒤 getState 의 체크 선택·스크롤·포커스 칸과 자체 커서만 담는다", async () => {
    const api = makeApi(
      {
        rowSelection: ["2", "3"],
        scroll: { top: 120, left: 8 },
        focusedCell: { colId: "name", rowIndex: 1, rowPinned: undefined },
        columnOrder: { orderedColIds: ["name"] },
        sort: { sortModel: [] },
        filter: { filterModel: {} },
      },
      true,
    );
    const registry = createCarryRegistry();
    await mountProbe({ gridId: "g1", api, cursor: "3" }, registry);
    const { light } = registry.collect();
    expect(api.calls).toEqual(["stopEditing", "getState"]);
    expect(light["grid:g1"]).toEqual({
      rowSelection: ["2", "3"],
      scroll: { top: 120, left: 8 },
      focusedCell: { colId: "name", rowIndex: 1, rowPinned: null },
      cursor: "3",
    });
  });

  it("편집 중이 아니면 stopEditing 을 부르지 않는다", async () => {
    const api = makeApi({ scroll: { top: 1, left: 0 } });
    const registry = createCarryRegistry();
    await mountProbe({ gridId: "g1", api }, registry);
    registry.collect();
    expect(api.calls).toEqual(["getState"]);
  });

  it("화면이 커서를 쥐면(controlled) 커서를 담지 않는다", async () => {
    const api = makeApi({ scroll: { top: 5, left: 0 } });
    const registry = createCarryRegistry();
    await mountProbe({ gridId: "g1", api, cursor: "3", cursorControlled: true }, registry);
    expect(registry.collect().light["grid:g1"]).toEqual({ scroll: { top: 5, left: 0 } });
  });

  it("selectedRows(제어형) 이거나 selectable 이 아니면 체크 선택을 담지 않는다", async () => {
    const registry = createCarryRegistry();
    const api = makeApi({ rowSelection: ["1"], scroll: { top: 5, left: 0 } });
    await mountProbe({ gridId: "g1", api, selectedRows: [1] }, registry);
    expect(registry.collect().light["grid:g1"]).toEqual({ scroll: { top: 5, left: 0 } });
    await mountProbe({ gridId: "g1", api, selectable: false }, registry);
    expect(registry.collect().light["grid:g1"]).toEqual({ scroll: { top: 5, left: 0 } });
  });

  it("체크 선택이 상한보다 많으면 선택만 뺀다(handoff 크기 보호)", async () => {
    const ids = Array.from({ length: GRID_CARRY_MAX_SELECTION + 1 }, (_, i) => String(i));
    const api = makeApi({ rowSelection: ids, scroll: { top: 5, left: 0 } });
    const registry = createCarryRegistry();
    await mountProbe({ gridId: "g1", api }, registry);
    expect(registry.collect().light["grid:g1"]).toEqual({ scroll: { top: 5, left: 0 } });
  });

  it("담을 것이 없으면 null, 그리드가 아직 없으면 null", async () => {
    const registry = createCarryRegistry();
    await mountProbe({ gridId: "g1", api: makeApi({}) }, registry);
    expect(registry.collect().light["grid:g1"]).toBeNull();
    await mountProbe({ gridId: "g1" }, registry);
    expect(registry.collect().light["grid:g1"]).toBeNull();
  });
});

describe("useGridCarry — 아무것도 안 하는 경우", () => {
  it("gridId 가 없으면 등록도 복원도 재호출도 없다", async () => {
    const onRowClick = vi.fn();
    const initial = vi.fn();
    const registry = restoreRegistry({ "grid:g1": { rowSelection: ["2"], cursor: "2" } });
    await mountProbe({ api: makeApi({}), onRowClick, onInitial: initial }, registry);
    expect(registry.collect()).toEqual({ light: {}, bulky: {} });
    expect(onRowClick).not.toHaveBeenCalled();
    expect(initial).toHaveBeenLastCalledWith(undefined);
  });

  it("carry 컨텍스트 밖이면 등록도 복원도 재호출도 없다", async () => {
    const onRowClick = vi.fn();
    const initial = vi.fn();
    await mountProbe({ gridId: "g1", api: makeApi({}), onRowClick, onInitial: initial }, null);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(initial).toHaveBeenLastCalledWith(undefined);
  });

  it("대화 상자 안 그리드는 등록하지 않는다", async () => {
    const registry = createCarryRegistry();
    await mountProbe({ gridId: "g1", api: makeApi({ scroll: { top: 1, left: 0 } }), inDialog: true }, registry);
    expect(registry.collect()).toEqual({ light: {}, bulky: {} });
  });
});

describe("useGridCarry — 복원", () => {
  const value = { rowSelection: ["2"], scroll: { top: 40, left: 0 }, cursor: "3" };

  it("복원값이 있으면 initialState 를 넘기고, 자체 커서를 세우고 onRowClick 을 한 번 부른다", async () => {
    const onRowClick = vi.fn();
    const setOwnCursorKey = vi.fn();
    const initial = vi.fn();
    await mountProbe({ gridId: "g1", onRowClick, setOwnCursorKey, onInitial: initial }, restoreRegistry({ "grid:g1": value }));
    expect(initial).toHaveBeenLastCalledWith({ rowSelection: ["2"], scroll: { top: 40, left: 0 } });
    expect(setOwnCursorKey).toHaveBeenCalledTimes(1);
    expect(setOwnCursorKey).toHaveBeenCalledWith("3");
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(data[2], expect.any(MouseEvent));
  });

  it("StrictMode 에서도 onRowClick 은 한 번이다", async () => {
    const onRowClick = vi.fn();
    const initial = vi.fn();
    await mountProbe({ gridId: "g1", onRowClick, onInitial: initial }, restoreRegistry({ "grid:g1": value }), true);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(initial).toHaveBeenLastCalledWith({ rowSelection: ["2"], scroll: { top: 40, left: 0 } });
  });

  it("화면이 커서를 쥐고 있으면(controlled) 커서를 세우지도 onRowClick 을 부르지도 않는다", async () => {
    const onRowClick = vi.fn();
    const setOwnCursorKey = vi.fn();
    await mountProbe(
      { gridId: "g1", onRowClick, setOwnCursorKey, cursorControlled: true, cursor: 1 },
      restoreRegistry({ "grid:g1": value }),
    );
    expect(setOwnCursorKey).not.toHaveBeenCalled();
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("selectedRows(제어형) 를 넘기면 체크 선택은 initialState 에 넣지 않는다", async () => {
    const initial = vi.fn();
    await mountProbe({ gridId: "g1", selectedRows: [1], onInitial: initial }, restoreRegistry({ "grid:g1": value }));
    expect(initial).toHaveBeenLastCalledWith({ scroll: { top: 40, left: 0 } });
  });

  it("그리드가 준비되기 전에는 기다리고, 준비되면 한 번 부른다", async () => {
    const onRowClick = vi.fn();
    const registry = restoreRegistry({ "grid:g1": value });
    await mountProbe({ gridId: "g1", onRowClick, gridReady: false }, registry);
    expect(onRowClick).not.toHaveBeenCalled();
    await mountProbe({ gridId: "g1", onRowClick, gridReady: true }, registry);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("행이 아직 비어 있으면 기다렸다가 행이 오면 부른다", async () => {
    const onRowClick = vi.fn();
    const registry = restoreRegistry({ "grid:g1": value });
    await mountProbe({ gridId: "g1", onRowClick, data: [] }, registry);
    expect(onRowClick).not.toHaveBeenCalled();
    await mountProbe({ gridId: "g1", onRowClick, data }, registry);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(data[2], expect.any(MouseEvent));
  });

  it("그 행이 없으면 부르지 않고, 한 번 판단한 뒤에는 다시 보지 않는다", async () => {
    const onRowClick = vi.fn();
    const setOwnCursorKey = vi.fn();
    const registry = restoreRegistry({ "grid:g1": { cursor: "99" } });
    await mountProbe({ gridId: "g1", onRowClick, setOwnCursorKey }, registry);
    await mountProbe({ gridId: "g1", onRowClick, setOwnCursorKey, data: [...data, { id: 99, name: "새" }] }, registry);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(setOwnCursorKey).not.toHaveBeenCalled();
  });

  it("사용자가 먼저 다른 행을 눌렀으면 부르지 않는다", async () => {
    const onRowClick = vi.fn();
    await mountProbe({ gridId: "g1", onRowClick, cursor: "1" }, restoreRegistry({ "grid:g1": value }));
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("임시 ID 행은 행 키 칸을 임시 ID 로 바꿔 넘긴다(행 클릭과 같은 모양)", async () => {
    const onRowClick = vi.fn();
    const rows = [{ id: "", name: "새", [GRID_TEMP_ID_FIELD]: "tmp-1" }];
    await mountProbe({ gridId: "g1", onRowClick, data: rows }, restoreRegistry({ "grid:g1": { cursor: "tmp-1" } }));
    expect(onRowClick).toHaveBeenCalledWith({ ...rows[0], id: "tmp-1" }, expect.any(MouseEvent));
  });

  it("같은 key 의 복원값은 한 번만 쓰인다(나중에 마운트되는 같은 gridId 는 처음 상태)", async () => {
    const registry = restoreRegistry({ "grid:g1": value });
    const first = vi.fn();
    await mountProbe({ gridId: "g1", onInitial: first }, registry);
    expect(first).toHaveBeenLastCalledWith({ rowSelection: ["2"], scroll: { top: 40, left: 0 } });
    await act(async () => root!.unmount());
    root = createRoot(container);
    const second = vi.fn();
    await mountProbe({ gridId: "g1", onInitial: second }, registry);
    expect(second).toHaveBeenLastCalledWith(undefined);
  });
});

// ---- 실제 ag-grid ----

const cursorRows = () =>
  Array.from(container.querySelectorAll(".ag-center-cols-container .ag-row-highlighted")).map((el) => el.getAttribute("row-id"));
const checkedRows = () =>
  Array.from(container.querySelectorAll(".ag-center-cols-container .ag-row-selected")).map((el) => el.getAttribute("row-id"));

async function renderGrid(props: Record<string, unknown>, registry: CarryRegistry | null, strict = false) {
  const grid = createElement(AgDataGrid, { columns, data, height: "auto", ...props } as never);
  await act(async () => {
    root!.render(wrap(grid, registry, strict));
  });
  await settle();
}

async function clickRow(rowId: string) {
  const cell = container.querySelector(`.ag-center-cols-container [row-id="${rowId}"] .ag-cell`) as HTMLElement;
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

describe("AgDataGrid 이어받기 (실제 ag-grid)", () => {
  const saved = { "grid:g1": { rowSelection: ["2"], cursor: "3" } };

  it("분리 창: 체크 선택과 자체 커서가 되살아나고 onRowClick 이 한 번 불린다", async () => {
    const onRowClick = vi.fn();
    await renderGrid({ gridId: "g1", selectable: true, multiSelect: true, onRowClick }, restoreRegistry(saved));
    expect(checkedRows()).toEqual(["2"]);
    expect(cursorRows()).toEqual(["3"]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(data[2], expect.any(MouseEvent));
  });

  it("StrictMode 에서도 onRowClick 은 한 번이다", async () => {
    const onRowClick = vi.fn();
    await renderGrid({ gridId: "g1", selectable: true, multiSelect: true, onRowClick }, restoreRegistry(saved), true);
    expect(checkedRows()).toEqual(["2"]);
    expect(cursorRows()).toEqual(["3"]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });

  it("화면이 highlightedRowKey 를 넘기면(controlled) 커서는 화면 값이고 onRowClick 은 부르지 않는다", async () => {
    const onRowClick = vi.fn();
    await renderGrid({ gridId: "g1", selectable: true, multiSelect: true, highlightedRowKey: 1, onRowClick }, restoreRegistry(saved));
    expect(cursorRows()).toEqual(["1"]);
    expect(checkedRows()).toEqual(["2"]);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("selectedRows(제어형) 를 넘기면 이어받은 체크 선택을 쓰지 않는다(화면 값이 소유)", async () => {
    await renderGrid({ gridId: "g1", selectable: true, multiSelect: true, selectedRows: [] }, restoreRegistry(saved));
    expect(checkedRows()).toEqual([]);
  });

  it("gridId 가 없으면 복원도 등록도 재호출도 없다", async () => {
    const onRowClick = vi.fn();
    const registry = restoreRegistry(saved);
    await renderGrid({ selectable: true, multiSelect: true, onRowClick }, registry);
    expect(checkedRows()).toEqual([]);
    expect(cursorRows()).toEqual([]);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(registry.collect().light).toEqual({});
  });

  it("carry 컨텍스트 밖이면 지금과 같다", async () => {
    const onRowClick = vi.fn();
    await renderGrid({ gridId: "g1", selectable: true, multiSelect: true, onRowClick }, null);
    expect(checkedRows()).toEqual([]);
    expect(cursorRows()).toEqual([]);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("편집 가능한 그리드는 포커스 칸도 되살린다", async () => {
    const editColumns = [{ key: "name", header: "이름", editable: true }];
    await renderGrid(
      { gridId: "g1", columns: editColumns },
      restoreRegistry({ "grid:g1": { focusedCell: { colId: "name", rowIndex: 1, rowPinned: null } } }),
    );
    const focused = container.querySelector(".ag-center-cols-container .ag-cell-focus");
    expect(focused?.closest(".ag-row")?.getAttribute("row-id")).toBe("2");
  });

  it("왕복: 포털 탭에서 고른 체크·커서를 모아 분리 창 그리드가 같은 모양으로 시작한다", async () => {
    const tab = createCarryRegistry();
    await renderGrid({ gridId: "g1", selectable: true, multiSelect: true, rowClickCheck: true }, tab);
    await clickRow("2");
    expect(checkedRows()).toEqual(["2"]);
    expect(cursorRows()).toEqual(["2"]);
    const collected = JSON.parse(JSON.stringify(tab.collect().light));
    expect(collected["grid:g1"]).toMatchObject({ rowSelection: ["2"], cursor: "2" });

    await act(async () => root!.unmount());
    root = createRoot(container);
    const onRowClick = vi.fn();
    await renderGrid({ gridId: "g1", selectable: true, multiSelect: true, onRowClick }, restoreRegistry(collected));
    expect(checkedRows()).toEqual(["2"]);
    expect(cursorRows()).toEqual(["2"]);
    expect(onRowClick).toHaveBeenCalledTimes(1);
  });
});
