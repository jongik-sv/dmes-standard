"use client";

import { useState, useRef, useEffect, useCallback, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type {
  RowDoubleClickedEvent,
  CellFocusedEvent,
  CellKeyDownEvent,
  CellEditingStoppedEvent,
  IRowNode,
  GridApi,
} from "ag-grid-community";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import type { AgDataGridProps } from "./grid-types";

/** 화면에 보이는 행 순서대로 rowKey 값을 모은다(임시 ID 칸이 있으면 그 값). 드래그가 끝난 뒤 순서를 넘길 때 쓴다. */
export function displayedRowKeys(
  api: {
    getDisplayedRowCount: () => number;
    getDisplayedRowAtIndex: (index: number) => { data?: unknown } | undefined | null;
  },
  rowKey: string,
): (string | number)[] {
  const keys: (string | number)[] = [];
  const count = api.getDisplayedRowCount();
  for (let i = 0; i < count; i++) {
    const data = (api.getDisplayedRowAtIndex(i)?.data ?? {}) as Record<string, unknown>;
    const tempId = data[GRID_TEMP_ID_FIELD];
    keys.push(typeof tempId === "string" && tempId ? tempId : (data[rowKey] as string | number));
  }
  return keys;
}

/**
 * ↑/↓ 로 옮겨 갈 행 번호(표시 순서). 옮길 곳이 없으면 null.
 * 기준 행이 없으면(-1) 방향과 무관하게 첫 행으로 간다. 맨 위·맨 아래에서는 멈춘다.
 */
export function nextCursorIndex(currentIndex: number, totalRows: number, key: "ArrowUp" | "ArrowDown"): number | null {
  if (totalRows <= 0) return null;
  if (currentIndex < 0 || currentIndex >= totalRows) return 0;
  const target = key === "ArrowDown" ? currentIndex + 1 : currentIndex - 1;
  return target < 0 || target >= totalRows ? null : target;
}

/**
 * 이 행이 커서 행인가. 키를 문자열로 맞춰 비교한다 — 행 데이터의 키는 숫자일 수 있고,
 * 그리드가 자체 관리하는 커서 키와 ag-grid 행 ID 는 문자열이다.
 */
export function isCursorRow(rowId: unknown, cursorKey: string | number | null | undefined): boolean {
  if (cursorKey == null || cursorKey === "" || rowId == null) return false;
  return String(rowId) === String(cursorKey);
}

export function selectEditedRow(
  checkRowOnEdit: boolean,
  selectable: boolean,
  node:
    | {
        isSelected: () => boolean | undefined;
        setSelected: (selected: boolean) => void;
      }
    | null
    | undefined
): void {
  if (!checkRowOnEdit || !selectable || !node || node.isSelected()) return;
  node.setSelected(true);
}

/** `useRowCursor` 매개변수 — AgDataGrid 의 prop·ref 를 그대로 받는다. */
export interface UseRowCursorOptions {
  gridRef: RefObject<AgGridReact | null>;
  gridReady: boolean;
  data: Record<string, unknown>[];
  rowKey: string;
  highlightedRowKey: AgDataGridProps["highlightedRowKey"];
  scrollToRow: AgDataGridProps["scrollToRow"];
  editArrowNavigation: boolean;
  onRowClick: AgDataGridProps["onRowClick"];
  onRowDoubleClick: AgDataGridProps["onRowDoubleClick"];
  onFocusedRowChange: AgDataGridProps["onFocusedRowChange"];
  onRowExpandCollapse: AgDataGridProps["onRowExpandCollapse"];
}

/**
 * AgDataGrid 행 커서 — 커서 상태(controlled·자체 관리), 커서·스크롤 효과, ↑/↓·←/→ 키 처리, 칸 포커스·더블 클릭 콜백.
 * `highlightedRowKeyRef` 는 행 클래스(getRowClass)가 읽고, `pendingHighlightRedrawRef` 는 rowClassRefreshToken 효과가 함께 쓴다.
 */
export function useRowCursor(opts: UseRowCursorOptions) {
  const {
    gridRef,
    gridReady,
    data,
    rowKey,
    highlightedRowKey,
    scrollToRow,
    editArrowNavigation,
    onRowClick,
    onRowDoubleClick,
    onFocusedRowChange,
    onRowExpandCollapse,
  } = opts;
  // ★행 커서 — 화면이 `highlightedRowKey` 를 넘기면 그 값이 곧 커서(controlled), 안 넘기면 아래가 소유한다.
  const [ownCursorKey, setOwnCursorKey] = useState<string | null>(null);
  const cursorControlled = highlightedRowKey !== undefined;
  const cursorKey: string | number | null = cursorControlled ? highlightedRowKey ?? null : ownCursorKey;
  // 화면 값을 자체 커서에도 따라 적어 둔다. `selectedId ?? undefined` 처럼 값을 넘기다가 undefined 로 바꾸는 화면은
  // 선택을 지운 뜻인데, 이걸 안 하면 자체 관리로 넘어가며 예전에 클릭한 행의 커서가 되살아난다.
  useEffect(() => {
    setOwnCursorKey(highlightedRowKey == null ? null : String(highlightedRowKey));
  }, [highlightedRowKey]);

  const highlightedRowKeyRef = useRef(cursorKey);
  const prevHighlightedRowKeyRef = useRef<string | number | null>(null);
  /** 강조가 바뀌었지만 편집 중이라 아직 다시 그리지 못한 행. */
  const pendingHighlightRedrawRef = useRef<IRowNode[]>([]);

  useEffect(() => {
    // 스크롤 정책:
    //  1) scrollToRow 명시 → "middle" 정렬 (행추가/포커스 이동 등 명시 의도).
    //  2) highlightedRowKey 만 변경 → 위치 인자 없이 ensureNodeVisible 호출.
    //     ag-grid 기본 동작상 행이 이미 화면 안이면 스크롤하지 않으므로,
    //     단순 선택 시 사용자가 추적 중인 위치가 가운데로 끌려가는 회귀를 막는다.
    //     행추가로 새 행이 시야 밖에 있으면 최소 거리만큼 시야 안으로 들어온다.
    if (!gridReady || !gridRef.current?.api) return;
    const api = gridRef.current.api;
    if (scrollToRow) {
      const rowNode = api.getRowNode(String(scrollToRow));
      if (rowNode) api.ensureNodeVisible(rowNode, "middle");
      return;
    }
    if (highlightedRowKey) {
      const rowNode = api.getRowNode(String(highlightedRowKey));
      if (rowNode) api.ensureNodeVisible(rowNode);
    }
  }, [scrollToRow, highlightedRowKey, gridReady, data]);

  useEffect(() => {
    if (!gridReady || !gridRef.current?.api) return;
    const api = gridRef.current.api;
    const prev = prevHighlightedRowKeyRef.current;
    highlightedRowKeyRef.current = cursorKey;
    prevHighlightedRowKeyRef.current = cursorKey;

    const nodesToRedraw: IRowNode[] = [];
    if (prev !== null) {
      const prevNode = api.getRowNode(String(prev));
      if (prevNode) nodesToRedraw.push(prevNode);
    }
    if (cursorKey !== null && cursorKey !== prev) {
      const newNode = api.getRowNode(String(cursorKey));
      if (newNode) nodesToRedraw.push(newNode);
    }
    // 편집 중인 행을 redrawRows 하면 cell editor 가 닫혀 사용자가 다시 클릭해야 한다. 그 행만 편집이 끝난 뒤(onCellEditingStopped)
    // 다시 그리고, 나머지(보통 이전 강조 행)는 바로 다시 그린다 — 전에는 편집 중이면 통째로 건너뛰어 이전 행 강조가 남았다.
    const editingRows = new Set((api.getEditingCells?.() ?? []).filter((c) => c.rowPinned == null).map((c) => c.rowIndex));
    const now = nodesToRedraw.filter((n) => n.rowIndex == null || !editingRows.has(n.rowIndex));
    pendingHighlightRedrawRef.current.push(...nodesToRedraw.filter((n) => !now.includes(n)));
    if (now.length > 0) {
      api.redrawRows({ rowNodes: now });
    }
  }, [cursorKey, gridReady]);

  const handleCellEditingStopped = useCallback((event: CellEditingStoppedEvent) => {
    const pending = pendingHighlightRedrawRef.current;
    if (pending.length === 0) return;
    // 편집기를 닫은 직후 같은 틱에서 다른 칸 편집을 여는 경우(편집 중 ↑/↓)가 있어 한 틱 미룬다.
    setTimeout(() => {
      const editingRows = new Set((event.api.getEditingCells?.() ?? []).map((c) => c.rowIndex));
      const ready = pending.filter((n) => n.rowIndex == null || !editingRows.has(n.rowIndex));
      if (ready.length === 0) return;
      pendingHighlightRedrawRef.current = pending.filter((n) => !ready.includes(n));
      event.api.redrawRows({ rowNodes: ready });
    }, 0);
  }, []);

  /**
   * ★행 커서를 ↑/↓ 로 한 칸 옮긴다. 옮겼으면 true.
   *
   * <p>`fromIndex` 가 기준 행이다. 없으면 지금 커서(controlled 면 화면 값, 아니면 자체 관리 값) 행이고, 커서가 없으면 첫 행으로 간다.
   * 화면이 `onRowClick` 을 줬으면 그쪽에도 같은 행을 넘겨 준다 — 화면 상태와 커서가 어긋나지 않게.
   */
  const moveRowCursor = useCallback(
    (api: GridApi, key: "ArrowUp" | "ArrowDown", event: Event, fromIndex?: number): boolean => {
      let currentIndex = fromIndex ?? -1;
      if (fromIndex == null && cursorKey != null && cursorKey !== "") {
        const currentNode = api.getRowNode(String(cursorKey));
        if (currentNode && typeof currentNode.rowIndex === "number") {
          currentIndex = currentNode.rowIndex;
        }
      }

      const targetIndex = nextCursorIndex(currentIndex, api.getDisplayedRowCount(), key);
      if (targetIndex == null || targetIndex === currentIndex) return false;

      const targetNode = api.getDisplayedRowAtIndex(targetIndex);
      if (!targetNode?.data) return false;
      api.ensureNodeVisible(targetNode);

      const rowData = targetNode.data as Record<string, unknown>;
      const tempId = rowData[GRID_TEMP_ID_FIELD];
      const rowId = typeof tempId === "string" && tempId ? tempId : String(rowData[rowKey] ?? "");
      if (!cursorControlled && rowId) setOwnCursorKey(rowId);
      if (typeof tempId === "string" && tempId) {
        onRowClick?.({ ...rowData, [rowKey]: tempId }, event);
      } else {
        onRowClick?.(rowData, event);
      }
      return true;
    },
    [cursorKey, cursorControlled, onRowClick, rowKey]
  );

  // 화살표 키 처리:
  // - ↑/↓ : highlightedRowKey 기준 이전/다음 행으로 이동(+onRowClick).
  // - ←/→ : (onRowExpandCollapse 제공 시) 현재 포커스 행 접힘(←)/펼침(→). 트리 그리드용.
  // suppressCellFocus={true} 인 비편집 그리드에서는 ag-grid 가 화살표를 처리하지 않아 컨테이너로 흘러온다.
  // 셀 편집 중 / input 등 편집 가능 요소 포커스 / ag-grid 가 이미 처리한 이벤트는 건너뜀.
  const handleContainerKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const isVertical = e.key === "ArrowUp" || e.key === "ArrowDown";
      const isHorizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (!isVertical && !isHorizontal) return;
      if (e.defaultPrevented) return;
      // 좌우 키는 트리 펼침/접힘 콜백이 있을 때만 가로챈다 (없으면 ag-grid 기본 동작 유지).
      if (isHorizontal && !onRowExpandCollapse) return;

      const api = gridRef.current?.api;
      if (!api) return;

      const editingCells = api.getEditingCells?.();
      if (editingCells && editingCells.length > 0) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable)
        return;
      // 머리글 라벨의 HTML 설명 카드(body 포털)에서 올라온 키 — React 이벤트는 React 트리를 따라 여기까지 온다. 카드 안 ↑↓ 는 설명 스크롤에 둔다.
      if (target?.closest?.("[data-tip-interactive]")) return;

      // ←/→ : 현재 포커스(highlight) 행을 접힘/펼침. 행 이동은 없음 (단순 expand/collapse).
      if (isHorizontal) {
        if (cursorKey == null || cursorKey === "") return;
        e.preventDefault();
        onRowExpandCollapse!(cursorKey, e.key === "ArrowRight");
        return;
      }

      e.preventDefault();

      // 자체 관리 모드에서는 커서만 옮기면 되므로 `onRowClick` 이 없어도 된다(목록이 있으면 기본으로 동작).
      if (!onRowClick && cursorControlled) return;
      moveRowCursor(api, e.key as "ArrowUp" | "ArrowDown", e.nativeEvent);
    },
    [onRowClick, cursorControlled, cursorKey, onRowExpandCollapse, moveRowCursor]
  );

  const handleCellFocused = useCallback(
    (event: CellFocusedEvent) => {
      if (!onFocusedRowChange || event.rowIndex == null || event.rowPinned) return;
      const node = event.api.getDisplayedRowAtIndex(event.rowIndex);
      if (node?.data) onFocusedRowChange(node.data as Record<string, unknown>);
    },
    [onFocusedRowChange]
  );

  /**
   * 칸 포커스가 있는 그리드(편집 가능한 열이 있는 그리드)의 ↑/↓.
   *
   * <p>이 그리드는 `suppressCellFocus={false}` 라 칸이 키를 받는다. ag-grid 가 먼저 포커스 칸을 위·아래로 옮기고
   * `preventDefault` 한 뒤, 이 콜백을 **비동기로** 부른다(33.3.2 dist: `processCellKeyboardEvent` → `cellKeyDown`,
   * 그리드 옵션 콜백은 async 리스너). 그래서 컨테이너 keydown 은 `defaultPrevented` 를 보고 물러나고, 커서는 여기서
   * 키를 누른 칸의 행(`event.rowIndex`) 기준으로 옮긴다 — 포커스 칸과 커서 행이 같은 행에 선다.
   *
   * <ol>
   *   <li>편집 중이고 `editArrowNavigation` 이면 **편집을** 같은 열의 이전·다음 행으로 옮긴다(엑셀식).</li>
   *   <li>그 밖에 편집 중이면 아무것도 하지 않는다. 선택 목록·숫자·날짜시간 편집기는 ↑/↓ 를 값 바꾸기에 쓴다.</li>
   *   <li>편집 중이 아니면 행 커서를 옮긴다.</li>
   * </ol>
   */
  const handleCellKeyDown = useCallback((event: CellKeyDownEvent) => {
    const ke = event.event as KeyboardEvent | null | undefined;
    if (!ke || (ke.key !== "ArrowUp" && ke.key !== "ArrowDown")) return;
    if (ke.altKey || ke.ctrlKey || ke.metaKey || ke.shiftKey || ke.isComposing) return;
    const { api, column, rowIndex } = event;
    if (rowIndex == null || event.rowPinned) return;
    const editing = (api.getEditingCells?.() ?? []).length > 0;

    if (editing) {
      if (!editArrowNavigation) return;
      if ((ke.target as HTMLElement | null)?.tagName !== "INPUT") return;
      const next = rowIndex + (ke.key === "ArrowDown" ? 1 : -1);
      if (next < 0 || next >= api.getDisplayedRowCount()) return;
      ke.preventDefault();
      const colKey = column.getColId();
      api.stopEditing();
      api.ensureIndexVisible(next);
      api.setFocusedCell(next, colKey);
      api.startEditingCell({ rowIndex: next, colKey });
      return;
    }

    if (cursorControlled && !onRowClick) return;
    moveRowCursor(api, ke.key, ke, rowIndex);
  }, [editArrowNavigation, cursorControlled, onRowClick, moveRowCursor]);

  const handleRowDoubleClicked = useCallback(
    (event: RowDoubleClickedEvent) => {
      onRowDoubleClick?.(event.data, event.event!);
    },
    [onRowDoubleClick]
  );

  return {
    cursorControlled,
    setOwnCursorKey,
    highlightedRowKeyRef,
    pendingHighlightRedrawRef,
    handleCellEditingStopped,
    handleContainerKeyDown,
    handleCellFocused,
    handleCellKeyDown,
    handleRowDoubleClicked,
  };
}
