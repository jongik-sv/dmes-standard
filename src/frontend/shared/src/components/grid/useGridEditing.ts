"use client";

import { useRef, useEffect, useCallback, useMemo, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { CellValueChangedEvent, RowClassParams, IRowNode } from "ag-grid-community";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import { mdmCaption, validateMdmValue } from "../../mdm-meta";
import type { GridColumn, AgDataGridProps } from "./grid-types";
import { indexFieldErrors } from "./field-errors";
import { pickCellIssue, type MdmCellCheck, type useGridMdm } from "./grid-mdm";
import { isCursorRow, selectEditedRow } from "./row-cursor";

/** `useGridEditing` 매개변수 — AgDataGrid 의 prop·ref 를 그대로 받는다. */
export interface UseGridEditingOptions {
  gridRef: RefObject<AgGridReact | null>;
  gridReady: boolean;
  columns: GridColumn[];
  data: Record<string, unknown>[];
  rowKey: string;
  /** useGridMdm 결과(포털 탭 MDM 메타). 공급자 밖이면 undefined. */
  mdm: ReturnType<typeof useGridMdm>;
  mdmValidate: boolean;
  fieldErrors: AgDataGridProps["fieldErrors"];
  checkRowOnEdit: boolean;
  selectable: boolean;
  onCellValueChanged: AgDataGridProps["onCellValueChanged"];
}

/**
 * AgDataGrid 칸 편집·검증 — 칸 검증 표시 상태(서버 오류·고친 칸·화면 검사), 열 정의가 쓰는 고정 함수 `cellIssue`,
 * 칸 값 변경 처리(handleCellValueChanged), 서버 오류 칸 효과.
 */
export function useGridEditing(opts: UseGridEditingOptions) {
  const {
    gridRef,
    gridReady,
    columns,
    data,
    rowKey,
    mdm,
    mdmValidate,
    fieldErrors,
    checkRowOnEdit,
    selectable,
    onCellValueChanged,
  } = opts;
  // 칸 검증 표시(mdmValidate·fieldErrors) — 상태는 ref 에 두고 열 정의에는 고정 함수만 넘긴다. 상태가 바뀔 때 열 정의를 다시 만들면
  // ag-grid 가 머리 그룹 셀을 다시 붙인다(AgDataGrid.tsx 의 isRowDraggable 주석). 바뀐 칸만 refreshCells 로 다시 그린다.
  const issuesEnabled = mdmValidate || fieldErrors !== undefined;
  /** 서버 오류: 행 ID → 열 key → 문구. */
  const serverIssuesRef = useRef<Map<string, Map<string, string>>>(new Map());
  /** 서버 오류를 받은 뒤 사용자가 고친 칸(`행ID\u0000열key`) — 그 칸은 서버 표시를 내린다. */
  const serverDismissedRef = useRef<Set<string>>(new Set());
  /** 화면 검사 결과: `행ID\u0000열key` → 검사한 값·문구. */
  const clientIssuesRef = useRef<Map<string, MdmCellCheck>>(new Map());
  const cellIssue = useCallback((rowId: string, colKey: string, value: unknown): string | null => {
    const k = `${rowId}\u0000${colKey}`;
    return pickCellIssue(
      serverIssuesRef.current.get(rowId)?.get(colKey),
      serverDismissedRef.current.has(k),
      clientIssuesRef.current.get(k),
      value
    );
  }, []);
  const leafByKey = useMemo(() => {
    const m = new Map<string, GridColumn>();
    const walk = (cols: GridColumn[]) => {
      for (const c of cols) {
        if (c.children && c.children.length > 0) walk(c.children);
        else if (!m.has(c.key)) m.set(c.key, c);
      }
    };
    walk(columns);
    return m;
  }, [columns]);

  const handleCellValueChanged = useCallback(
    (event: CellValueChangedEvent) => {
      const field = event.colDef.field;
      if (!field) return;
      const data = (event.data ?? {}) as Record<string, unknown>;
      const tempId = data[GRID_TEMP_ID_FIELD];
      const rk =
        typeof tempId === "string" && tempId ? tempId : ((data[rowKey] as string | number) ?? "");
      selectEditedRow(checkRowOnEdit, selectable, event.node);
      if (issuesEnabled && event.node.id != null) {
        const rowId = event.node.id;
        const k = `${rowId}\u0000${field}`;
        let refresh = false;
        // 서버 오류가 있던 칸을 고쳤다 — 서버 표시를 내리고 화면 검사로 돌아간다.
        if (serverIssuesRef.current.get(rowId)?.has(field) && !serverDismissedRef.current.has(k)) {
          serverDismissedRef.current.add(k);
          refresh = true;
        }
        // 화면 검사 — 공급자 안 + 편집 가능 + MDM 연결 칸만(spec C2). 문구 캡션은 서버와 같은 폼 캡션, 없으면 열 key.
        const col = leafByKey.get(field);
        const meta = mdmValidate && col?.editable ? mdm?.infoByKey.get(field)?.column : null;
        if (meta) {
          const found = validateMdmValue(meta, event.newValue, data, mdmCaption(meta, "form") ?? field);
          if (found) clientIssuesRef.current.set(k, { value: event.newValue, message: found.message });
          else clientIssuesRef.current.delete(k);
          refresh = true;
        }
        if (refresh) event.api.refreshCells({ rowNodes: [event.node], columns: [event.column], force: true });
      }
      onCellValueChanged?.({
        rowKey: rk,
        field,
        newValue: event.newValue,
        oldValue: event.oldValue,
        row: data,
      });
    },
    [checkRowOnEdit, onCellValueChanged, rowKey, selectable, issuesEnabled, leafByKey, mdmValidate, mdm]
  );

  // 서버 오류 칸 — fieldErrors·data 가 바뀌면 다시 찾아 두고, 표시가 달라졌으면 칸을 다시 그린다. 새 fieldErrors 면 "고친 칸" 기록을 지운다.
  const prevFieldErrorsRef = useRef(fieldErrors);
  const serverIssueSigRef = useRef("");
  useEffect(() => {
    if (!issuesEnabled) return;
    let undismissed = false;
    if (prevFieldErrorsRef.current !== fieldErrors) {
      prevFieldErrorsRef.current = fieldErrors;
      undismissed = serverDismissedRef.current.size > 0;
      serverDismissedRef.current = new Set();
    }
    const next = indexFieldErrors(fieldErrors ?? [], data, rowKey, columns);
    serverIssuesRef.current = next;
    const sig = JSON.stringify([...next].map(([id, cells]) => [id, [...cells]]));
    if (sig === serverIssueSigRef.current && !undismissed) return;
    serverIssueSigRef.current = sig;
    if (gridReady) gridRef.current?.api?.refreshCells({ force: true });
  }, [issuesEnabled, fieldErrors, data, rowKey, columns, gridReady]);

  return { issuesEnabled, cellIssue, handleCellValueChanged };
}

/** `useGridRowClass` 매개변수 — 강조 ref 두 개는 useRowCursor 가 만든 것을 그대로 받는다. */
export interface UseGridRowClassOptions {
  gridRef: RefObject<AgGridReact | null>;
  gridReady: boolean;
  data: Record<string, unknown>[];
  rowKey: string;
  getRowClassExtra: AgDataGridProps["getRowClassExtra"];
  rowClassRefreshToken: AgDataGridProps["rowClassRefreshToken"];
  highlightedRowKeyRef: RefObject<string | number | null>;
  pendingHighlightRedrawRef: RefObject<IRowNode[]>;
}

/**
 * AgDataGrid 행 클래스 — 행 상태·커서 강조·외부 분류 클래스(getRowClass)와 그 다시 그리기 효과(rowClassRefreshToken·_rowState).
 * 커서 다시 그리기 효과(useRowCursor) 바로 뒤에서 불러 효과 순서(커서 → rowClassRefreshToken → _rowState)를 지킨다.
 */
export function useGridRowClass(opts: UseGridRowClassOptions) {
  const {
    gridRef,
    gridReady,
    data,
    rowKey,
    getRowClassExtra,
    rowClassRefreshToken,
    highlightedRowKeyRef,
    pendingHighlightRedrawRef,
  } = opts;
  const getRowClass = useCallback(
    (params: RowClassParams): string | string[] | undefined => {
      if (!params.data) return undefined;
      const row = params.data as Record<string, unknown>;
      const tempId = row[GRID_TEMP_ID_FIELD];
      const rowId = typeof tempId === "string" && tempId ? tempId : row[rowKey];
      const classes: string[] = [];

      if (row.nativeeditor_status === "deleted" || row._rowState === "deleted") {
        classes.push("ag-row-deleted");
      }
      if (row._rowState === "added" || row._rowState === "copied") {
        classes.push("ag-row-inserted");
      }
      if (row._rowState === "modified") {
        classes.push("ag-row-modified");
      }
      if (isCursorRow(rowId, highlightedRowKeyRef.current)) {
        classes.push("ag-row-highlighted");
      }
      // 외부 row 분류 (예: 1년+미사용 JIG)
      if (getRowClassExtra) {
        const extra = getRowClassExtra(row);
        if (extra) {
          if (Array.isArray(extra)) classes.push(...extra);
          else classes.push(extra);
        }
      }

      return classes.length > 0 ? classes : undefined;
    },
    [rowKey, getRowClassExtra]
  );

  useEffect(() => {
    if (rowClassRefreshToken === undefined || !gridReady || !gridRef.current?.api) return;
    const api = gridRef.current.api;
    const editingRows = new Set((api.getEditingCells?.() ?? []).filter((c) => c.rowPinned == null).map((c) => c.rowIndex));
    if (editingRows.size === 0) {
      api.redrawRows();
      return;
    }
    // 편집 중이면 그 행만 편집이 끝난 뒤 다시 그린다(강조와 같은 방식) — 전에는 통째로 건너뛰어, 편집 중에 늦게 온 표시(비동기 검사 결과)가
    // 다음 토큰이 바뀔 때까지 빠졌다.
    const now: IRowNode[] = [];
    api.forEachNode((n) => {
      if (n.rowIndex == null || !editingRows.has(n.rowIndex)) now.push(n);
      else if (!pendingHighlightRedrawRef.current.includes(n)) pendingHighlightRedrawRef.current.push(n);
    });
    if (now.length > 0) api.redrawRows({ rowNodes: now });
  }, [gridReady, rowClassRefreshToken]);

  // _rowState / nativeeditor_status 변경 감지 → 해당 행만 redrawRows (CSS 클래스 재적용)
  // 두 시스템 모두 지원 — useRowStateManager 는 _rowState, useGridDataManager 는 nativeeditor_status 사용
  const prevRowStateMapRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!gridReady || !gridRef.current?.api) return;
    const api = gridRef.current.api;
    const newMap = new Map<string, string>();
    const changedIds: string[] = [];
    for (const row of data) {
      const tempId = row[GRID_TEMP_ID_FIELD];
      const id = String(typeof tempId === "string" && tempId ? tempId : (row[rowKey] ?? ""));
      if (!id) continue;
      const state = `${row._rowState ?? ""}|${row.nativeeditor_status ?? ""}`;
      newMap.set(id, state);
      if (prevRowStateMapRef.current.get(id) !== state) {
        changedIds.push(id);
      }
    }
    prevRowStateMapRef.current = newMap;
    if (changedIds.length > 0) {
      const nodes = changedIds
        .map((id) => api.getRowNode(id))
        .filter((n): n is NonNullable<typeof n> => n != null);
      if (nodes.length > 0) {
        api.redrawRows({ rowNodes: nodes });
      }
    }
  }, [data, gridReady, rowKey]);

  return getRowClass;
}
