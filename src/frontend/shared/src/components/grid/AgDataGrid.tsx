"use client";

import "./grid.css";
import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type {
  GridReadyEvent,
  RowClickedEvent,
  ColumnResizedEvent,
  ColDef,
  ColGroupDef,
  GetRowIdParams,
  RowDragEndEvent,
  RowClassParams,
  CellValueChangedEvent,
  IRowNode,
  ColumnState,
} from "ag-grid-community";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import { mdmCaption, validateMdmValue } from "../../mdm-meta";
import { GRID_SIZE_CHANGE_SETTLE_MS, resolveGridSizeChangeAction } from "./grid-size-change";
import { GRID_TOOLTIP_SHOW_DELAY_MS } from "./grid-tooltip";
import { useGridTooltipOutside } from "./grid-tooltip-parent";
import { AgDataGridExcelFrame } from "./AgDataGridExcel";
import type { GridColumn, AgDataGridProps } from "./grid-types";
import { useGridPersonalize, type GridPersonalizeColumn } from "./grid-personalize-hook";
import { useGridPanelRegistry, type GridPanelGridControls } from "./grid-panel-context";
import { ColumnSettingsModal } from "./ColumnSettingsModal";
import { GridHeaderContextMenu } from "./GridHeaderContextMenu";
import { gridRowIdOf, indexFieldErrors } from "./field-errors";
import { useGridMdm, pickCellIssue, mdmHeaderLabelSignature, type MdmCellCheck } from "./grid-mdm";
import { buildColumnDefs, hasEditableColumn, resolveRowDrag } from "./column-defs";
import { displayedRowKeys, isCursorRow, selectEditedRow, useRowCursor } from "./row-cursor";
import { useGridSelection } from "./useGridSelection";

export type { GridColumn, AgDataGridProps, AgDataGridFieldError } from "./grid-types";
export { gridRowIdOf, indexFieldErrors } from "./field-errors";
export type { MdmCellCheck, MdmGridTooltipParams } from "./grid-mdm";
export type { BuildColumnDefsOptions } from "./column-defs";
export { resolveRowDrag, buildColumnDefs, hasEditableColumn } from "./column-defs";
export { displayedRowKeys, nextCursorIndex, isCursorRow, selectEditedRow } from "./row-cursor";
export {
  pickCellIssue,
  MDM_INVALID_CELL_CLASS,
  MdmGridTooltip,
  mdmHeaderLabelSignature,
  sameGridMdmValues,
  useResolvedGridColumns,
} from "./grid-mdm";

/** `rowNumber` 로 넣는 행번호 열의 colId — 테스트·화면이 이 칸을 집을 때 쓴다. */
export const ROW_NUMBER_COL_ID = "__rowNo";

ModuleRegistry.registerModules([AllCommunityModule]);

/** 요소가 대화 상자(Mantine Modal 등 role="dialog") 안에 있는가. */
function isInDialog(el: Element): boolean {
  return el.closest('[role="dialog"]') != null;
}
/** 저장 너비 컬럼이 없을 때의 집합(공유 상수 — 렌더마다 새로 만들지 않는다). */
const EMPTY_SIZED_COLUMNS: ReadonlySet<string> = new Set();
export { GRID_TOOLTIP_SHOW_DELAY_MS };

function AgDataGridComponent({
  columns = [],
  data = [],
  rowKey = "id",
  height,
  selectable = false,
  multiSelect = false,
  checkRowOnEdit = false,
  selectedRows,
  isRowSelectable,
  onRowSelect,
  onRowClick,
  onRowDoubleClick,
  onFocusedRowChange,
  editArrowNavigation = false,
  sortable = true,
  emptyMessage = "데이터가 없습니다.",
  emptyTestId,
  className = "",
  rowNumber = false,
  // 기본값을 `null` 이 아니라 `undefined` 로 둔다 — "화면이 넘기지 않았다"와 "화면이 커서를 지냈다"를 구분해야
  // 커서를 자체 관리하는 기본 동작과 controlled 계약을 동시에 살릴 수 있다.
  highlightedRowKey,
  scrollToRow = null,
  loading = false,
  loadingMessage = "조회 중...",
  autoSizeColumns,
  alwaysShowHorizontalScroll = false,
  autoSizeOnDataUpdate = true,
  ariaLabel,
  getRowHeight,
  enableRowClickSelect = false,
  selectExcludeColumns = [],
  rowClickCheck = false,
  onCellValueChanged,
  singleClickEdit = false,
  stopEditingWhenCellsLoseFocus = true,
  columnSizing = "auto",
  getRowClassExtra,
  rowClassRefreshToken,
  onRowExpandCollapse,
  wrapHeaderText = false,
  autoHeaderHeight = false,
  tooltipShowDelay = GRID_TOOLTIP_SHOW_DELAY_MS,
  rowDragField,
  isRowDraggable,
  onRowOrderChange,
  mdmValidate = false,
  fieldErrors,
  excelExport,
  gridId,
  personalize,
}: AgDataGridProps) {
  const gridRef = useRef<AgGridReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 툴팁은 그리드 밖(body)에 띄워 좁은 그리드에서 잘리지 않게 한다 — 툴팁이 뜰 수 있는 동안에만 popupParent 를 바꾼다.
  useGridTooltipOutside(containerRef, gridRef);
  const [gridReady, setGridReady] = useState(false);
  const userResizedRef = useRef(false);
  /**
   * 컬럼 개인화로 너비가 저장된 colId(사용자가 직접 끌어 맞춘 컬럼). 자동 너비는 나머지 컬럼에만, 여백 분배는 이 컬럼 너비를 고정한 채로 한다.
   * 비어 있으면(저장값 없음·저장 너비 없음) 자동 너비 흐름은 개인화 전과 같은 호출(autoSizeAllColumns·기존 sizeColumnsToFit)이다.
   */
  const sizedColumnsRef = useRef<ReadonlySet<string>>(EMPTY_SIZED_COLUMNS);
  const autoSizeTimerRef = useRef<number | null>(null);
  const sizeChangeTimerRef = useRef<number | null>(null);
  /** 직전 grid size-change 시점의 컨테이너 폭. 0 이하면 숨김/미레이아웃. */
  const lastGridWidthRef = useRef(0);
  const resolvedColumnSizing = columnSizing ?? "auto";
  const shouldAutoSizeColumns = resolvedColumnSizing === "auto" && autoSizeColumns !== false;

  // 행 드래그(TSK-05-02 D6) — onRowOrderChange 가 없으면 핸들러를 만들지 않고 AgGridReact 에 더 넘기는 prop 이 없어 기존 그리드와
  // 렌더가 같다. managed row drag 가 끝나면 화면에 보이는 행 순서대로 행 키를 모아 알린다. 드래그를 켠 그리드와
  // rowDragField 를 준 그리드는 정렬을 끈다.
  const rowDrag = resolveRowDrag(onRowOrderChange, sortable, (event: RowDragEndEvent) => {
    onRowOrderChange?.(displayedRowKeys(event.api, rowKey));
  });
  const effectiveSortable = rowDrag.sortable && !rowDragField;
  // isRowDraggable 은 ref 로 읽는다 — 호출자가 인라인 함수를 넘겨도 열 정의를 다시 만들지 않게 한다(열 그룹 정의가 렌더마다
  // 바뀌면 ag-grid 가 머리 그룹 셀을 다시 붙이고, React 개발 모드 효과 재실행에서 null 그룹을 읽어 죽는다 — mdm TSK-08-02 실측).
  const isRowDraggableRef = useRef(isRowDraggable);
  isRowDraggableRef.current = isRowDraggable;
  const hasRowDraggable = !!isRowDraggable;
  const stableIsRowDraggable = useMemo(
    () => (hasRowDraggable ? (row: Record<string, unknown>) => isRowDraggableRef.current?.(row) ?? true : undefined),
    [hasRowDraggable]
  );
  // MDM 화면 메타(포털 탭 공급자 안에서만) — 비운 머리글 캡션·머리글 툴팁. 메타가 실제로 바뀔 때만 값이 바뀐다.
  const mdm = useGridMdm(columns);

  // 칸 검증 표시(mdmValidate·fieldErrors) — 상태는 ref 에 두고 열 정의에는 고정 함수만 넘긴다. 상태가 바뀔 때 열 정의를 다시 만들면
  // ag-grid 가 머리 그룹 셀을 다시 붙인다(아래 isRowDraggable 주석). 바뀐 칸만 refreshCells 로 다시 그린다.
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
  // 열 그룹 묶기는 개인화 여부와 무관하게 늘 켠다. 개인화 상태(실행 중)로 판정하면 개인화 훅 ↔ 열 정의 순환이 생기고, personalize prop 으로
  // 판정하면 숨은 탭처럼 prop 이 켜지고 꺼질 때마다 열 정의가 다시 들어가 ag-grid 가 컬럼 상태를 정의값으로 되돌린다. 그룹 묶기는 그룹 머리를
  // 가르는 이동·고정만 막으므로 개인화를 끈 그룹 그리드에도 해가 없다. 그룹 없는 그리드는 열 정의에 영향이 없다.
  const columnDefs = useMemo<(ColDef | ColGroupDef)[]>(() => {
    const defs = buildColumnDefs(columns, {
      sortable: effectiveSortable,
      columnSizing: resolvedColumnSizing,
      shouldAutoSizeColumns,
      rowDragField,
      isRowDraggable: stableIsRowDraggable,
      ...(mdm ? { mdm } : {}),
      ...(issuesEnabled ? { cellIssue } : {}),
      lockGroups: true,
    });
    // 체크박스는 rowSelection 설정에서 자동 관리 (수동 컬럼 불필요)
    if (!rowNumber) return defs;
    const noOpt = typeof rowNumber === "object" ? rowNumber : {};
    // 정렬·필터 뒤의 표시 순서를 1부터 매긴다.
    // 주의: ag-grid 33 community 에는 `rowNumber` ColDef 속성도 `RowNumberColumn` 컴포넌트도 없다
    // (설치본 colDef.d.ts 에 `rowNumber` 없음 — `A types rowNumber` 로 확인). `valueGetter` 가 받는
    // `params.node.rowIndex`(설치본 colDef.d.ts:852, rowNode.d.ts:69) 로 직접 만든다.
    // 이 번호는 표시 순서이지 저장 값이 아니다 — 정렬하면 다시 매겨진다.
    const noCol: ColDef = {
      colId: ROW_NUMBER_COL_ID,
      headerName: noOpt.header ?? "No",
      width: noOpt.width ?? 56,
      minWidth: 40,
      maxWidth: 120,
      pinned: "left",
      sortable: false,
      resizable: false,
      suppressMovable: true,
      cellStyle: { textAlign: "center" },
      headerClass: "header-center",
      valueGetter: (params: { node: { rowIndex: number | null } | null }) =>
        (params.node?.rowIndex ?? -1) + 1,
      tooltipValueGetter: () => "",
    };
    return [noCol, ...defs];
  }, [columns, effectiveSortable, shouldAutoSizeColumns, resolvedColumnSizing, rowDragField, stableIsRowDraggable, rowNumber, mdm, issuesEnabled, cellIssue]);

  // 셀 툴팁 — 말줄임된 긴 값을 확인하도록 셀 값을 ag-grid 툴팁으로 띄운다. 잘림 여부는 보지 않아 짧은 값도 뜬다(값 검증 오류 칸은 열 정의의 getter 가 오류 문구를 먼저 띄운다).
  // 지연은 그리드 tooltipShowDelay(기본 GRID_TOOLTIP_SHOW_DELAY_MS), 열에서 끄려면 GridColumn.tooltip=false.
  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: effectiveSortable,
      resizable: true,
      wrapHeaderText,
      autoHeaderHeight,
      tooltipValueGetter: (params: { value?: unknown }) =>
        params.value == null ? "" : String(params.value),
    }),
    [effectiveSortable, wrapHeaderText, autoHeaderHeight]
  );

  // HTML 설명 머리글 라벨(MdmHeaderLabel)을 단 열이 바뀌면 머리글을 한 번 다시 만든다. ag-grid 는 만든 뒤 colDef 에 innerHeaderComponent 가
  // 생기거나 빠져도 기본 머리글을 다시 만들지 않는다(tests/unit/aggrid-inner-header-capability.unit.test.ts 3). 메타는 늘 그리드를 만든 뒤 오므로
  // HTML 열이 있는 그리드에서 한 번 일어난다 — 그때 화면의 상태 있는 머리글 컴포넌트도 다시 마운트된다. HTML 열이 없는 그리드는 부르지 않는다.
  const headerLabelSignature = useMemo(() => mdmHeaderLabelSignature(columnDefs), [columnDefs]);
  /** 지금 머리글 칸들이 만들어질 때의 라벨 서명. 그리드는 첫 렌더 값으로 만들어진다. */
  const appliedHeaderLabelRef = useRef(headerLabelSignature);
  useEffect(() => {
    if (!gridReady || appliedHeaderLabelRef.current === headerLabelSignature) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const apply = (triesLeft: number) => {
      const api = gridRef.current?.api;
      if (!api || api.isDestroyed()) return;
      // ag-grid-react 는 바뀐 열 정의를 자기 효과(이 효과보다 먼저 돈다)에서 넘긴다 — 아직 대기 중이면 잠깐 뒤에 다시 본다.
      const current = mdmHeaderLabelSignature((api.getColumns() ?? []).map((c) => c.getColDef()));
      if (current !== headerLabelSignature && triesLeft > 0) {
        retry = setTimeout(() => apply(triesLeft - 1), 0);
        return;
      }
      appliedHeaderLabelRef.current = headerLabelSignature;
      api.refreshHeader();
    };
    apply(3);
    return () => clearTimeout(retry);
  }, [gridReady, headerLabelSignature]);

  const hasEditableColumns = useMemo(() => hasEditableColumn(columns), [columns]);

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

  const getRowId = useCallback(
    (params: GetRowIdParams) => gridRowIdOf(params.data as Record<string, unknown>, rowKey),
    [rowKey]
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

  const onGridReady = useCallback((_params: GridReadyEvent) => {
    setGridReady(true);
  }, []);

  // 행 선택(useGridSelection.ts) — 제어형 선택 동기화·선택 변경 알림·행 클릭의 선택 토글.
  const { handleSelectionChanged, applyRowClickSelection } = useGridSelection({
    gridRef,
    data,
    rowKey,
    selectable,
    selectedRows,
    onRowSelect,
    enableRowClickSelect,
    rowClickCheck,
    selectExcludeColumns,
  });

  const columnSizingRef = useRef(resolvedColumnSizing);
  columnSizingRef.current = resolvedColumnSizing;

  /** 현재 컬럼 폭을 min 으로 잠그고, 그리드가 더 넓을 때만 여백을 분배한다. */
  const fillRemainingColumnSpace = useCallback(() => {
    if (!gridRef.current?.api) return;
    // fit 은 flex 가 이미 그리드 폭을 채운다. 컨테이너와 ag 루트의 1px 테두리 차이로 여기에 들어오면
    // sizeColumnsToFit 이 flex 가중치(col.width 비율)를 버리고 모든 열을 같은 폭으로 만든다.
    if (columnSizingRef.current === "fit") return;
    try {
      const api = gridRef.current.api;
      const cols = api.getColumns?.() ?? [];
      const totalWidth = cols.reduce((sum, c) => sum + (c.getActualWidth?.() ?? 0), 0);
      const gridWidth = containerRef.current?.clientWidth ?? 0;
      if (gridWidth > 0 && totalWidth > 0 && totalWidth < gridWidth) {
        const sized = sizedColumnsRef.current;
        api.sizeColumnsToFit({
          defaultMinWidth: 1,
          columnLimits: cols.map((c) =>
            // 저장 너비 컬럼은 늘리지도 줄이지도 않는다(개인화). 없으면 예전과 같은 한계값이다.
            sized.has(c.getColId())
              ? { key: c.getColId(), minWidth: c.getActualWidth(), maxWidth: c.getActualWidth() }
              : { key: c.getColId(), minWidth: c.getActualWidth() }
          ),
        });
      }
    } catch {
      // 그리드 DOM이 아직 준비되지 않은 경우 무시
    }
  }, []);

  const autoSizeAllColumnsHandler = useCallback(() => {
    if (!gridRef.current?.api) return;
    // 컨텐츠 기반 자동 폭은 columnSizing="auto" 또는 autoSizeColumns={true}일 때만 사용한다.
    if (!shouldAutoSizeColumns) return;
    try {
      const sized = sizedColumnsRef.current;
      if (sized.size === 0) gridRef.current.api.autoSizeAllColumns(false);
      else {
        // 저장 너비 컬럼(사용자가 직접 맞춘 컬럼)은 빼고 나머지만 내용에 맞춘다 — autoSizeAllColumns 와 같은 대상(보이는 컬럼)에서 뺀다.
        const keys = gridRef.current.api
          .getAllDisplayedColumns()
          .map((c) => c.getColId())
          .filter((id) => !sized.has(id));
        if (keys.length > 0) gridRef.current.api.autoSizeColumns(keys, false);
      }
      // 컨텐츠 기준 자동 폭 합계가 그리드보다 좁으면 남는 공간을 분배하여 채움.
      fillRemainingColumnSpace();
      lastGridWidthRef.current = containerRef.current?.clientWidth ?? 0;
    } catch {
      // 그리드 DOM이 아직 준비되지 않은 경우 다음 렌더에서 다시 시도됨
    }
  }, [shouldAutoSizeColumns, fillRemainingColumnSpace]);

  const scheduleAutoSizeAllColumns = useCallback(() => {
    if (autoSizeTimerRef.current != null) {
      window.clearTimeout(autoSizeTimerRef.current);
    }
    autoSizeTimerRef.current = window.setTimeout(() => {
      autoSizeTimerRef.current = null;
      autoSizeAllColumnsHandler();
    }, 50);
  }, [autoSizeAllColumnsHandler]);

  const scheduleFillRemainingColumnSpace = useCallback(() => {
    if (sizeChangeTimerRef.current != null) {
      window.clearTimeout(sizeChangeTimerRef.current);
    }
    sizeChangeTimerRef.current = window.setTimeout(() => {
      sizeChangeTimerRef.current = null;
      fillRemainingColumnSpace();
      lastGridWidthRef.current = containerRef.current?.clientWidth ?? 0;
    }, GRID_SIZE_CHANGE_SETTLE_MS);
  }, [fillRemainingColumnSpace]);

  // 컬럼 개인화(gridId·personalize) — 복원·자동 저장·열 정의 재주입 뒤 재적용. 결과(handle)는 컬럼 설정 창(C3)이 쓴다.
  // 기본값 복원 뒤에는 아래 마운트 직후 효과와 같은 갈래로 자동 너비 맞춤을 다시 돌린다.
  const getGridApi = useCallback(() => gridRef.current?.api, []);
  const rerunAutoSize = useCallback(() => {
    if (resolvedColumnSizing === "auto" && shouldAutoSizeColumns) scheduleAutoSizeAllColumns();
    else scheduleFillRemainingColumnSpace();
  }, [resolvedColumnSizing, shouldAutoSizeColumns, scheduleAutoSizeAllColumns, scheduleFillRemainingColumnSpace]);
  const rerunAutoSizeAfterRestore = useCallback(() => {
    if (!userResizedRef.current) rerunAutoSize();
  }, [rerunAutoSize]);
  const rerunAutoSizeAfterReset = useCallback(() => {
    userResizedRef.current = false;
    rerunAutoSize();
  }, [rerunAutoSize]);
  const personalizeHandle = useGridPersonalize({
    getApi: getGridApi,
    gridReady,
    gridId,
    personalize,
    columns,
    columnDefs,
    selectable,
    rowKey,
    rowDragField,
    sizedColumnsRef,
    onRestored: rerunAutoSizeAfterRestore,
    onReset: rerunAutoSizeAfterReset,
  });

  // 컬럼 설정 창·머리글 우클릭 메뉴·GridPanel [컬럼 설정] 단추 — 개인화가 동작 중(handle.enabled)일 때만 생긴다. 꺼진 그리드는 DOM·핸들러가 예전과 같다.
  // 창·메뉴는 열렸을 때만 그린다(닫힌 동안은 상태가 null 이라 Mantine 부품을 만들지 않는다).
  const personalizeEnabled = personalizeHandle.enabled;
  const personalizeHandleRef = useRef(personalizeHandle);
  personalizeHandleRef.current = personalizeHandle;
  const [settingsColumns, setSettingsColumns] = useState<GridPersonalizeColumn[] | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ x: number; y: number; nonce: number } | null>(null);
  const headerMenuNonceRef = useRef(0);
  const openSettings = useCallback(() => {
    const handle = personalizeHandleRef.current;
    if (!handle.enabled) return;
    const cols = handle.getColumns();
    if (cols.length === 0) return;
    setHeaderMenu(null);
    setSettingsColumns(cols);
  }, []);
  const closeSettings = useCallback(() => setSettingsColumns(null), []);
  const closeHeaderMenu = useCallback(() => setHeaderMenu(null), []);
  const resetPersonalize = useCallback(() => personalizeHandleRef.current.reset(), []);
  // 창에서 숨기거나 다시 켠 뒤에는 복원 때와 같은 갈래로 자동 너비·여백 분배를 다시 돌린다(auto 그리드의 오른쪽 빈 공간·다시 켠 컬럼 너비).
  // 저장 너비가 있는 컬럼은 sizedColumnsRef 가 지킨다.
  const rerunAfterApplyRef = useRef(rerunAutoSizeAfterRestore);
  rerunAfterApplyRef.current = rerunAutoSizeAfterRestore;
  const applyPersonalize = useCallback((state: ColumnState[]) => {
    personalizeHandleRef.current.apply(state);
    rerunAfterApplyRef.current();
  }, []);
  // GridPanel 에 올리는 명령 — 그리드가 사는 동안 같은 객체(렌더마다 새로 만들지 않는다).
  const gridControls = useMemo<GridPanelGridControls>(() => ({ openSettings, reset: resetPersonalize }), [openSettings, resetPersonalize]);
  const gridPanelRegistry = useGridPanelRegistry();
  useEffect(() => {
    if (!gridPanelRegistry || !personalizeEnabled) return;
    // React context 는 포털을 넘어 오므로, GridPanel 안에서 띄운 팝업(룩업 등)의 그리드도 여기로 온다. 실제로 그 패널의
    // 그리드 영역 안에 있고 대화 상자 안이 아닌 그리드만 등록한다 — 개인화가 꺼진 패널에 남의 [컬럼 설정] 단추가 생기지 않게.
    const el = containerRef.current;
    if (!el || !el.closest(".grid-panel-content") || isInDialog(el)) return;
    return gridPanelRegistry.register(gridControls);
  }, [gridPanelRegistry, personalizeEnabled, gridControls]);
  // 개인화가 꺼지면(탭 비활성·키 충돌로 대기) 열려 있던 창·메뉴를 닫는다. 처음부터 꺼진 그리드는 아무 상태도 건드리지 않는다.
  const wasPersonalizeEnabledRef = useRef(false);
  useEffect(() => {
    if (!personalizeEnabled && wasPersonalizeEnabledRef.current) {
      setSettingsColumns(null);
      setHeaderMenu(null);
    }
    wasPersonalizeEnabledRef.current = personalizeEnabled;
  }, [personalizeEnabled]);
  // 머리글 우클릭 — 머리글이면 브라우저 기본 메뉴를 막고 마우스 위치에 메뉴를 띄운다. 셀·그 밖의 영역·머리글 안의 입력 칸(필터 입력 등)은
  // 브라우저 기본 동작을 그대로 둔다.
  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!personalizeHandleRef.current.enabled) return;
    const target = e.target;
    if (!(target instanceof Element) || !target.closest(".ag-header")) return;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    // 대화 상자(룩업 창 등) 안의 그리드는 설정 창을 겹쳐 띄우지 않는다 — 겹친 창에서는 Esc 한 번에 바깥 창까지 닫히고 Tab 이 갇힌다.
    if (isInDialog(target)) return;
    e.preventDefault();
    headerMenuNonceRef.current += 1;
    setHeaderMenu({ x: e.clientX, y: e.clientY, nonce: headerMenuNonceRef.current });
  }, []);

  // ★그리드 준비 직후 1회 폭 정리 — 데이터가 0건이면 ag-grid 가 firstDataRendered / rowDataUpdated 를
  //   내보내지 않아 아래 핸들러들이 한 번도 호출되지 않는다. 그 결과 "조회 결과가 없습니다" 상태에서
  //   컬럼 폭 합이 그리드보다 좁아도 우측이 빈 채로 남았다(2026-08-07 CR 이력 화면에서 실측: 그리드 976px
  //   vs 컬럼합 694px). 데이터 유무와 무관하게 마운트 후 한 번은 반드시 맞춘다.
  //   deps 는 길이만 본다 — 배열을 인라인으로 만드는 페이지에서 매 렌더 재실행되는 것을 피한다.
  //   mdm(포털 탭 MDM 메타)은 받아 온 뒤 한 번 바뀐다 — 열 정의를 다시 넣으면 ag-grid 가 colDef.width 를 다시 적용해
  //   채워 둔 여백이 사라지고(fixed·auto), 캡션이 길어지면 내용 폭도 달라지므로 다시 맞춘다. 공급자 밖이면 늘 undefined 라 영향이 없다.
  useEffect(() => {
    if (!gridReady || userResizedRef.current) return;
    if (resolvedColumnSizing === "auto" && shouldAutoSizeColumns) {
      scheduleAutoSizeAllColumns();
      return;
    }
    scheduleFillRemainingColumnSpace();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    gridReady,
    data.length,
    columns.length,
    mdm,
    resolvedColumnSizing,
    shouldAutoSizeColumns,
    scheduleAutoSizeAllColumns,
    scheduleFillRemainingColumnSpace,
  ]);

  const onFirstDataRendered = useCallback(() => {
    // 컨텐츠 기반 폭 재측정(autoSize)은 "auto" 모드 전용이지만,
    // ★여백 분배(fill)는 모드와 무관하게 적용한다 — 컬럼 폭 합이 그리드보다 좁으면 우측에
    //  빈 공간이 남아 보기 흉했다(2026-08-07 사용자 요구). fill 은 현재 폭을 min 으로 잠그고
    //  남는 공간만 나누므로 fixed 의 픽셀 폭이 줄지 않고, fit 은 이미 꽉 차 있어 no-op 이다.
    if (resolvedColumnSizing === "auto") {
      scheduleAutoSizeAllColumns(); // 내부에서 fill 까지 수행
      return;
    }
    scheduleFillRemainingColumnSpace();
  }, [resolvedColumnSizing, scheduleAutoSizeAllColumns, scheduleFillRemainingColumnSpace]);

  const onRowDataUpdated = useCallback(() => {
    if (userResizedRef.current) return; // 사용자가 직접 조정한 폭은 건드리지 않는다
    if (resolvedColumnSizing === "auto") {
      if (autoSizeOnDataUpdate && shouldAutoSizeColumns) scheduleAutoSizeAllColumns();
      return;
    }
    // fixed/fit — 행 수가 바뀌며 세로 스크롤바가 생겼다 사라지면 가용 폭도 변한다. 여백만 재분배.
    scheduleFillRemainingColumnSpace();
  }, [
    autoSizeOnDataUpdate,
    shouldAutoSizeColumns,
    resolvedColumnSizing,
    scheduleAutoSizeAllColumns,
    scheduleFillRemainingColumnSpace,
  ]);

  // 컨테이너 폭 변경 시:
  //  - 숨김→표시(0→양수): 컨텐츠 측정(autoSize)
  //  - 일반 창 리사이즈: 드래그 중엔 스킵, settle 후 여백만 분배 (autoSize 금지 → 번쩍임 방지)
  const onGridSizeChanged = useCallback(() => {
    if (userResizedRef.current) return;

    const nextWidth = containerRef.current?.clientWidth ?? 0;
    const action = resolveGridSizeChangeAction(lastGridWidthRef.current, nextWidth);
    if (action === "none") return;

    // fixed/fit 은 컨텐츠 재측정 없이 여백 분배만 (autoSize 는 "auto" 모드 전용).
    if (resolvedColumnSizing !== "auto" || !shouldAutoSizeColumns) {
      lastGridWidthRef.current = nextWidth;
      scheduleFillRemainingColumnSpace();
      return;
    }

    if (action === "autosize") {
      lastGridWidthRef.current = nextWidth;
      scheduleAutoSizeAllColumns();
      return;
    }

    // fill: trailing settle — 연속 리사이즈 중 중간 프레임에서는 컬럼을 건드리지 않음
    scheduleFillRemainingColumnSpace();
  }, [
    shouldAutoSizeColumns,
    resolvedColumnSizing,
    scheduleAutoSizeAllColumns,
    scheduleFillRemainingColumnSpace,
  ]);

  useEffect(() => {
    return () => {
      if (autoSizeTimerRef.current != null) {
        window.clearTimeout(autoSizeTimerRef.current);
      }
      if (sizeChangeTimerRef.current != null) {
        window.clearTimeout(sizeChangeTimerRef.current);
      }
    };
  }, []);

  // ★행 커서(row-cursor.ts) — 커서 상태·커서/스크롤 효과·키 처리. 강조 ref 는 아래 getRowClass·rowClassRefreshToken 효과가 함께 쓴다.
  const {
    cursorControlled,
    setOwnCursorKey,
    highlightedRowKeyRef,
    pendingHighlightRedrawRef,
    handleCellEditingStopped,
    handleContainerKeyDown,
    handleCellFocused,
    handleCellKeyDown,
    handleRowDoubleClicked,
  } = useRowCursor({
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
  });

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

  const handleColumnResized = useCallback((event: ColumnResizedEvent) => {
    if (event.source === "uiColumnResized") {
      userResizedRef.current = true;
    }
  }, []);

  const handleRowClicked = useCallback(
    (event: RowClickedEvent) => {
      // 행 클릭 시 컨테이너로 focus 이동 → 이후 ArrowUp/Down 키보드 네비게이션이 동작.
      // preventScroll: focus 호출이 페이지 스크롤을 유발하지 않도록.
      // 단, cellEditor 가 활성 상태(편집 중)면 input focus 를 빼앗지 않도록 skip.
      const editingCells = gridRef.current?.api?.getEditingCells?.();
      if (!editingCells || editingCells.length === 0) {
        containerRef.current?.focus({ preventScroll: true });
      }

      applyRowClickSelection(event);

      const rowData = event.data;
      const tempId = rowData[GRID_TEMP_ID_FIELD];
      const rowId = typeof tempId === "string" && tempId ? tempId : String(rowData[rowKey] ?? "");
      // 자체 관리 모드면 클릭이 커서를 옮긴다 — 화면이 `highlightedRowKey` 를 넘기면 그쪽이 소유라 건드리지 않는다.
      if (!cursorControlled && rowId) setOwnCursorKey(rowId);
      if (typeof tempId === "string" && tempId) {
        onRowClick?.({ ...rowData, [rowKey]: tempId }, event.event!);
      } else {
        onRowClick?.(rowData, event.event!);
      }
    },
    [onRowClick, rowKey, applyRowClickSelection, cursorControlled]
  );

  const sortedData = useMemo(() => {
    const addedRows = data.filter((row) => row.nativeeditor_status === "inserted");
    const otherRows = data.filter((row) => row.nativeeditor_status !== "inserted");
    return [...otherRows, ...addedRows];
  }, [data]);

  const noRowsOverlayComponent = useMemo(
    () =>
      function NoRowsOverlay() {
        return (
          <div className="ag-overlay-no-rows-wrapper">
            <span data-testid={emptyTestId}>{emptyMessage}</span>
          </div>
        );
      },
    [emptyMessage, emptyTestId]
  );

  const loadingOverlayComponent = useMemo(
    () =>
      function LoadingOverlay() {
        return (
          <div className="ag-overlay-loading-wrapper">
            <div className="loading-spinner"></div>
            <span>{loadingMessage}</span>
          </div>
        );
      },
    [loadingMessage]
  );

  const isDataEmpty = sortedData.length === 0;

  // 조회 중 표시·데이터 없음 안내를 상태에 맞게 맞춘다(noRowsOverlayComponent 정의 뒤에 둬야 의존성에 쓸 수 있다).
  useEffect(() => {
    if (!gridReady || !gridRef.current?.api) return;
    const api = gridRef.current.api;
    if (loading) {
      api.showLoadingOverlay();
      return;
    }
    // hideOverlay 는 "데이터 없음" 안내까지 숨긴다 — 조회가 끝났는데 행이 없으면 안내를 다시 띄운다.
    // 안내가 이미 떠 있어도 거둔 뒤 다시 띄운다: ag-grid 는 떠 있는 오버레이 부품을 새 옵션(emptyMessage)으로
    // 갱신하지 않으므로, 문구가 바뀌거나 비어 있음 여부가 바뀔 때마다 새로 만들어야 최신 문구가 보인다.
    api.hideOverlay();
    if (api.getDisplayedRowCount() === 0) api.showNoRowsOverlay();
  }, [loading, gridReady, isDataEmpty, noRowsOverlayComponent]);

  const isAutoHeight = height === "auto";
  const getExcelApi = useCallback(() => gridRef.current?.api, []);

  const grid = (
    <div
      ref={containerRef}
      className={`cm-data-grid ag-theme-alpine${isAutoHeight ? " cm-data-grid-auto-height" : ""}${isAutoHeight && sortedData.length === 0 ? " cm-data-grid-empty" : ""} ${className}`.trim()}
      style={{ height: isAutoHeight ? "auto" : excelExport ? "100%" : height || "100%", width: "100%" }}
      aria-label={ariaLabel || "데이터 목록"}
      aria-busy={loading}
      tabIndex={-1}
      onKeyDown={handleContainerKeyDown}
      onContextMenu={personalizeEnabled ? handleContextMenu : undefined}
    >
      <AgGridReact
        ref={gridRef}
        rowData={sortedData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        getRowId={getRowId}
        getRowClass={getRowClass}
        rowSelection={
          selectable
            ? {
                mode: multiSelect ? "multiRow" : "singleRow",
                enableClickSelection: false,
                checkboxes: true,
                headerCheckbox: multiSelect,
                isRowSelectable: isRowSelectable
                  ? (node: { data?: Record<string, unknown> }) => isRowSelectable(node.data ?? {})
                  : undefined,
              }
            : undefined
        }
        onGridReady={onGridReady}
        onFirstDataRendered={onFirstDataRendered}
        onRowDataUpdated={onRowDataUpdated}
        onGridSizeChanged={onGridSizeChanged}
        onColumnResized={handleColumnResized}
        onRowClicked={handleRowClicked}
        onRowDoubleClicked={handleRowDoubleClicked}
        onCellFocused={onFocusedRowChange ? handleCellFocused : undefined}
        onCellKeyDown={handleCellKeyDown}
        onCellEditingStopped={handleCellEditingStopped}
        onSelectionChanged={handleSelectionChanged}
        onCellValueChanged={handleCellValueChanged}
        singleClickEdit={singleClickEdit}
        suppressClickEdit={false}
        stopEditingWhenCellsLoseFocus={stopEditingWhenCellsLoseFocus}
        suppressAutoSize={false}
        noRowsOverlayComponent={noRowsOverlayComponent}
        loadingOverlayComponent={loadingOverlayComponent}
        animateRows={false}
        tooltipShowDelay={tooltipShowDelay}
        suppressCellFocus={!hasEditableColumns}
        /*
         * ★셀 텍스트 드래그 선택·복사는 항상 허용(2026-08-07 사용자 요구).
         *   구: enableCellTextSelection={!hasEditableColumns} → 편집 컬럼이 하나라도 있으면 ag 가
         *   셀에 user-select:none 을 걸어 "어떤 화면은 복사가 되고 어떤 화면은 안 되는" 편차가 생겼다
         *   (실측: masterRuleList 셀 computed user-select=none, 드래그 선택 결과 빈 문자열).
         *   편집 기능과 병존 가능하며(편집 중 셀은 input 자체 선택 동작), ensureDomOrder 는 화면 순서대로
         *   복사되도록 DOM 순서를 보장한다.
         */
        enableCellTextSelection
        ensureDomOrder
        headerHeight={28}
        rowHeight={26}
        getRowHeight={
          getRowHeight
            ? (params: { data?: Record<string, unknown> }) => getRowHeight(params.data ?? {})
            : undefined
        }
        suppressColumnVirtualisation={resolvedColumnSizing === "auto"}
        suppressHorizontalScroll={false}
        // 개인화가 켜지면 머리글을 그리드 밖으로 끌어도 컬럼이 숨겨지지 않는다 — 실수 숨김이 자동 저장되어 계속 사라지는 것을 막는다.
        // 숨김은 컬럼 설정 창으로만 한다. 꺼진 그리드는 ag-grid 기본(false)이라 예전과 같다.
        suppressDragLeaveHidesColumns={personalizeEnabled}
        alwaysShowHorizontalScroll={alwaysShowHorizontalScroll}
        domLayout={isAutoHeight ? "autoHeight" : "normal"}
        {...rowDrag.gridProps}
      />
    </div>
  );

  const body = excelExport ? (
    <AgDataGridExcelFrame
      options={excelExport}
      columns={columns}
      data={data}
      fallbackRows={sortedData}
      height={height}
      getApi={getExcelApi}
    >
      {grid}
    </AgDataGridExcelFrame>
  ) : (
    grid
  );
  // 늘 같은 모양(Fragment)으로 돌려준다 — 개인화가 켜지고 꺼질 때 그리드가 다시 마운트되지 않게. 꺼진 동안 덧붙는 DOM 은 없다.
  return (
    <>
      {body}
      {personalizeEnabled && headerMenu ? (
        <GridHeaderContextMenu
          x={headerMenu.x}
          y={headerMenu.y}
          nonce={headerMenu.nonce}
          onOpenSettings={openSettings}
          onReset={resetPersonalize}
          onClose={closeHeaderMenu}
        />
      ) : null}
      {personalizeEnabled && settingsColumns ? (
        <ColumnSettingsModal
          opened
          columns={settingsColumns}
          onApply={applyPersonalize}
          onReset={resetPersonalize}
          onClose={closeSettings}
        />
      ) : null}
    </>
  );
}

export const AgDataGrid = memo(AgDataGridComponent);
export { AgDataGrid as DataGrid };
