"use client";

import { useRef, useEffect, type MutableRefObject, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { GridState } from "ag-grid-community";
import { useCarryValue } from "../../portal-shell/carry-state";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import { gridRowIdOf } from "./field-errors";
import type { AgDataGridProps } from "./grid-types";

/*
 * 「새 창으로 분리」 때 그리드의 체크 선택·스크롤·포커스 칸·자체 관리 행 커서를 이어받는다(설계 2026-10-06-popout-carry-state-design §4.7).
 *
 * - `gridId` 를 준 그리드만 한다(key `grid:{gridId}`). gridId 가 없거나 carry 컨텍스트(포털 탭·분리 창) 밖이면 등록도 복원도 하지 않아 예전과 같다.
 *   대화 상자 안 그리드(룩업 등)는 하지 않는다.
 * - 모으기: 열린 셀 편집기를 `api.stopEditing()` 으로 확정한 뒤 `api.getState()` 의 rowSelection·scroll·focusedCell 만 담는다. 컬럼 상태(너비·순서·정렬 등)는
 *   담지 않아 그리드 개인화(grid-personalize-hook.ts)의 복원과 겹치지 않는다. 화면이 `highlightedRowKey` 를 넘기면(controlled) 커서는 화면 소유라 담지 않고,
 *   넘기지 않아 그리드가 자체 관리하는 커서 행 키만 담는다.
 * - 복원: ag-grid 33.3.2 에는 `api.setState` 가 없어 `initialState`(그리드 생성 때 한 번만 읽힘)로 넘긴다. 행은 화면 useCarryState 복원으로 첫 렌더부터 들어 있다.
 *   체크 선택·scroll·focusedCell 은 ag-grid 가 행이 들어온 뒤(rowCountReady·firstDataRendered) 적용한다. 행이 첫 렌더에 없었으면(재조회) initialState 를 넘기지 않는다.
 *   화면이 `selectedRows`(제어형 선택)를 넘기면 체크 선택은 건너뛴다.
 * - 자체 관리 커서를 되살린 경우 화면 `onRowClick(row, 합성 click)` 를 그리드가 준비되고 그 행이 있을 때 한 번 부른다(상세 폼 되살리기).
 */

/** 이어받을 체크 선택 행 수 상한 — 크면 light(handoff 256KB)를 넘겨 조건까지 빠질 수 있어 선택은 뺀다. */
export const GRID_CARRY_MAX_SELECTION = 2000;

/** 그리드 하나가 넘기는 값. 모든 칸이 선택이다. */
export interface GridCarryValue {
  rowSelection?: string[];
  scroll?: { top: number; left: number };
  focusedCell?: { colId: string; rowIndex: number; rowPinned?: "top" | "bottom" | null };
  /** 그리드가 자체 관리하던 커서 행 키 */
  cursor?: string;
}

/** 복원값 → ag-grid initialState. 넘길 칸이 없으면 undefined. */
export function buildGridInitialState(
  value: GridCarryValue | null | undefined,
  opts: { selectable: boolean; selectedRowsControlled: boolean }
): GridState | undefined {
  if (!value || typeof value !== "object") return undefined;
  const state: GridState = {};
  if (opts.selectable && !opts.selectedRowsControlled && Array.isArray(value.rowSelection) && value.rowSelection.length > 0) {
    state.rowSelection = value.rowSelection;
  }
  if (value.scroll && typeof value.scroll.top === "number" && typeof value.scroll.left === "number") {
    state.scroll = { top: value.scroll.top, left: value.scroll.left };
  }
  if (value.focusedCell && typeof value.focusedCell.colId === "string" && typeof value.focusedCell.rowIndex === "number") {
    state.focusedCell = {
      colId: value.focusedCell.colId,
      rowIndex: value.focusedCell.rowIndex,
      rowPinned: value.focusedCell.rowPinned ?? null,
    };
  }
  return Object.keys(state).length > 0 ? state : undefined;
}

/** `useGridCarry` 매개변수 — AgDataGrid 의 prop·ref 를 그대로 받는다. */
export interface UseGridCarryOptions {
  gridRef: RefObject<AgGridReact | null>;
  containerRef: RefObject<HTMLElement | null>;
  gridReady: boolean;
  gridId: string | undefined;
  data: Record<string, unknown>[];
  rowKey: string;
  selectable: boolean;
  selectedRows: AgDataGridProps["selectedRows"];
  cursorControlled: boolean;
  /** useRowCursor 가 커밋 때마다 맞추는 현재 커서 키(controlled 면 화면 값, 아니면 자체 값). */
  highlightedRowKeyRef: MutableRefObject<string | number | null>;
  setOwnCursorKey: (key: string | null) => void;
  onRowClick: AgDataGridProps["onRowClick"];
}

export function useGridCarry(opts: UseGridCarryOptions): { initialState: GridState | undefined } {
  const { gridRef, containerRef, gridReady, gridId, data, rowKey, selectable, selectedRows, cursorControlled, highlightedRowKeyRef, setOwnCursorKey, onRowClick } =
    opts;
  // getter·효과가 읽는 최신 prop — 렌더마다 갱신해 등록·효과가 다시 만들어지지 않게 한다.
  const latest = useRef({ selectable, selectedRowsControlled: selectedRows !== undefined, cursorControlled, onRowClick, rowKey });
  latest.current = { selectable, selectedRowsControlled: selectedRows !== undefined, cursorControlled, onRowClick, rowKey };

  const restored = useCarryValue<GridCarryValue | null>(
    gridId ? `grid:${gridId}` : null,
    () => {
      const api = gridRef.current?.api;
      if (!api || api.isDestroyed()) return null;
      // 열린 편집기 값을 확정한다. 값은 ag-grid 가 행 객체에 바로 쓰므로 화면 행 getter 가 읽는 행에 반영된다. 다만 화면의 setState(_rowState 표시 등)는
      // 렌더 뒤에야 반영되어 같은 모으기에는 못 든다(한계).
      if ((api.getEditingCells?.() ?? []).length > 0) api.stopEditing();
      const now = latest.current;
      const state = api.getState();
      const out: GridCarryValue = {};
      const selection = state.rowSelection;
      if (
        now.selectable &&
        !now.selectedRowsControlled &&
        Array.isArray(selection) &&
        selection.length > 0 &&
        selection.length <= GRID_CARRY_MAX_SELECTION
      ) {
        out.rowSelection = selection.map(String);
      }
      if (state.scroll) out.scroll = { top: state.scroll.top, left: state.scroll.left };
      if (state.focusedCell) {
        const { colId, rowIndex, rowPinned } = state.focusedCell;
        out.focusedCell = { colId, rowIndex, rowPinned: rowPinned ?? null };
      }
      const cursor = highlightedRowKeyRef.current;
      if (!now.cursorControlled && cursor != null && cursor !== "") out.cursor = String(cursor);
      return Object.keys(out).length > 0 ? out : null;
    },
    // 룩업 등 대화 상자 안 그리드는 이어받지 않는다(열 때마다 새로 뜨는 그리드가 옛 값을 되살리지 않게).
    { accept: () => !containerRef.current?.closest('[role="dialog"]') }
  );

  // 그리드는 만들 때 한 번만 initialState 를 읽는다 — 첫 렌더 값으로 고정한다. 행이 첫 렌더에 없으면(재조회·행을 이어받지 않는 화면) 넘기지 않는다:
  // 나중에 온 다른 행 목록에 옛 체크 id·스크롤·포커스 칸 번호가 엉뚱하게 적용되지 않게 한다(커서 되살리기는 아래에서 행이 올 때 따로 한다).
  const initialRef = useRef<{ value: GridState | undefined } | null>(null);
  if (initialRef.current === null) {
    initialRef.current = {
      value:
        data.length > 0
          ? buildGridInitialState(restored, { selectable, selectedRowsControlled: selectedRows !== undefined })
          : undefined,
    };
  }

  // 자체 관리 커서 되살리기 — 그리드가 준비되고 그 행이 데이터에 있으면 커서를 세우고 화면 onRowClick 을 한 번 부른다.
  // 행이 비어 있으면(재조회 대기) 행이 오기를 기다리고, 행이 왔는데 없거나 사용자가 먼저 다른 행을 누르거나 화면이 커서를 쥐고 있으면 포기한다.
  const pendingCursorRef = useRef<string | null>(restored?.cursor != null && restored.cursor !== "" ? String(restored.cursor) : null);
  useEffect(() => {
    const pending = pendingCursorRef.current;
    if (pending === null || !gridReady) return;
    const now = latest.current;
    const current = highlightedRowKeyRef.current;
    if (now.cursorControlled || (current != null && String(current) !== pending)) {
      pendingCursorRef.current = null;
      return;
    }
    if (data.length === 0) return;
    pendingCursorRef.current = null;
    const row = data.find((r) => !!r && gridRowIdOf(r, now.rowKey) === pending);
    if (!row) return;
    setOwnCursorKey(pending);
    const tempId = row[GRID_TEMP_ID_FIELD];
    const arg = typeof tempId === "string" && tempId ? { ...row, [now.rowKey]: tempId } : row;
    // 화면 onRowClick 은 event 를 거의 쓰지 않는다 — 합성 click 으로 충분하다.
    now.onRowClick?.(arg, new MouseEvent("click"));
  }, [gridReady, data, highlightedRowKeyRef, setOwnCursorKey]);

  return { initialState: initialRef.current.value };
}
