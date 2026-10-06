"use client";

import { useRef, useEffect, useCallback, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { RowClickedEvent, SelectionChangedEvent } from "ag-grid-community";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import type { AgDataGridProps } from "./grid-types";

/**
 * rowClickCheck 토글 제외 대상 판정 — 클릭 지점이 입력요소(input/select/textarea/button/a·contentEditable)·
 * 편집 중 셀(.ag-cell-inline-editing)·행 선택 체크박스(.ag-selection-checkbox/.ag-checkbox)이면 true.
 * 이런 대상 클릭 시에는 행 체크 토글을 건너뛴다(예: 체크박스 직접 클릭 → ag-grid 가 이미 토글하므로 이중 토글 방지).
 */
function isNonToggleClickTarget(target: EventTarget | null | undefined): boolean {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest(
    'input, select, textarea, button, a, [contenteditable="true"], .ag-cell-inline-editing, .ag-selection-checkbox, .ag-checkbox'
  );
}

/** `useGridSelection` 매개변수 — AgDataGrid 의 prop·ref 를 그대로 받는다. */
export interface UseGridSelectionOptions {
  gridRef: RefObject<AgGridReact | null>;
  data: Record<string, unknown>[];
  rowKey: string;
  selectable: boolean;
  selectedRows: AgDataGridProps["selectedRows"];
  onRowSelect: AgDataGridProps["onRowSelect"];
  enableRowClickSelect: boolean;
  rowClickCheck: boolean;
  selectExcludeColumns: string[];
}

/**
 * AgDataGrid 행 선택 — 제어형 선택 동기화(selectedRows), 선택 변경 알림(onRowSelect), 행 클릭의 선택 토글(enableRowClickSelect·rowClickCheck).
 * 행 클릭 처리기(handleRowClicked)는 AgDataGrid 에 남고, 포커스 이동 뒤·커서 이동 앞에서 `applyRowClickSelection` 을 부른다.
 */
export function useGridSelection(opts: UseGridSelectionOptions) {
  const {
    gridRef,
    data,
    rowKey,
    selectable,
    selectedRows,
    onRowSelect,
    enableRowClickSelect,
    rowClickCheck,
    selectExcludeColumns,
  } = opts;
  // ★제어형 선택 동기화 — selectedRows 제공 시 그리드 체크 상태를 외부 상태에 맞춘다.
  //   (헤더 전체선택을 페이지가 가로채 "필요수량 맞춤 자동선택"으로 교체하는 등 프로그램 선택 제어용.)
  //   동기화가 일으키는 selectionChanged 는 onRowSelect 로 되울리지 않는다(suppress) — prop 이
  //   반영 전(stale)인 렌더에서 되울리면 그 사이 사용자가 추가한 체크를 이전 집합으로 덮어쓴다
  //   (빠른 연속 체크 시 두 번째 체크가 풀리는 경합). 최신 상태 렌더의 동기화가 최종 정합을 맞춘다.
  const selectionSyncRef = useRef(false);
  useEffect(() => {
    const api = gridRef.current?.api;
    if (!api || selectedRows === undefined || !selectable) return;
    const want = new Set(selectedRows.map(String));
    selectionSyncRef.current = true;
    try {
      api.forEachNode((node) => {
        const d = (node.data ?? {}) as Record<string, unknown>;
        const tempId = d[GRID_TEMP_ID_FIELD];
        const id = typeof tempId === "string" && tempId ? tempId : String(d[rowKey] ?? "");
        const sel = want.has(id);
        if (node.isSelected() !== sel) node.setSelected(sel);
      });
    } finally {
      // setSelected 의 selectionChanged 는 동기 발화가 기본이지만, 이벤트 큐 지연 대비 microtask 로 해제.
      queueMicrotask(() => {
        selectionSyncRef.current = false;
      });
    }
  }, [selectedRows, selectable, rowKey, data]);

  const selectExcludeColumnsRef = useRef(selectExcludeColumns);
  selectExcludeColumnsRef.current = selectExcludeColumns;

  /** 행 클릭의 선택 토글 — handleRowClicked 가 포커스 이동 뒤, 커서 이동 앞에서 부른다. */
  const applyRowClickSelection = useCallback(
    (event: RowClickedEvent) => {
      // enableRowClickSelect: 클릭한 컬럼이 제외 목록에 없으면 선택 토글
      if (enableRowClickSelect && event.node) {
        const target = event.event?.target as HTMLElement | undefined;
        const cell = target?.closest("[col-id]");
        const colId = cell?.getAttribute("col-id") ?? "";
        if (!selectExcludeColumnsRef.current.includes(colId)) {
          event.node.setSelected(!event.node.isSelected());
        }
      }

      // rowClickCheck: 행 아무 곳 클릭 시 체크 토글. 단 입력요소/편집 중 셀/선택 체크박스 클릭은 제외
      // (isNonToggleClickTarget) — 체크박스 직접 클릭 시 ag-grid 가 이미 토글하므로 이중 토글 방지.
      if (rowClickCheck && selectable && event.node) {
        const target = event.event?.target;
        if (!isNonToggleClickTarget(target)) {
          const el = target as HTMLElement | undefined;
          const cell = el?.closest?.("[col-id]");
          const colId = cell?.getAttribute("col-id") ?? "";
          if (!selectExcludeColumnsRef.current.includes(colId)) {
            event.node.setSelected(!event.node.isSelected());
          }
        }
      }
    },
    [enableRowClickSelect, rowClickCheck, selectable]
  );

  const handleSelectionChanged = useCallback(
    (_event: SelectionChangedEvent) => {
      if (!gridRef.current?.api || !onRowSelect) return;
      // 제어형 동기화(selectedRows 강제 반영) 중의 변경은 되울리지 않는다 — 위 동기화 effect 주석 참조.
      if (selectionSyncRef.current) return;
      const selectedNodes = gridRef.current.api.getSelectedNodes();
      const selectedIds = selectedNodes.map((node) => node.data[rowKey] as string | number);
      const selectedData = selectedNodes.map((node) => node.data as Record<string, unknown>);
      onRowSelect(selectedIds, selectedData.length === 1 ? selectedData[0] : selectedData);
    },
    [onRowSelect, rowKey]
  );

  return { handleSelectionChanged, applyRowClickSelection };
}
