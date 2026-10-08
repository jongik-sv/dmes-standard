"use client";

import "./grid.css";
import React, { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, useContext, memo } from "react";
import { MantineContext } from "@mantine/core";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type {
  CellFocusedEvent,
  CellValueChangedEvent,
  SelectionChangedEvent,
  GridReadyEvent,
  RowClickedEvent,
  ColDef,
  ColGroupDef,
  GetRowIdParams,
  RowDragEndEvent,
  ColumnState,
} from "ag-grid-community";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import { GRID_TOOLTIP_SHOW_DELAY_MS } from "./grid-tooltip";
import { useGridTooltipOutside } from "./grid-tooltip-parent";
import { AgDataGridExcelFrame, useGridExcelExport } from "./AgDataGridExcel";
import type { GridColumn, AgDataGridProps } from "./grid-types";
import { useGridPersonalize, type GridPersonalizeColumn } from "./grid-personalize-hook";
import { useGridPanelRegistry, type GridPanelGridControls } from "./grid-panel-context";
import { GridSettingsOverlay } from "./GridSettingsOverlay";
import { GridHeaderBar } from "./GridHeaderBar";
import { ColumnSettingsModal } from "./ColumnSettingsModal";
import { MessageModal } from "../modal";
import { GridHeaderContextMenu } from "./GridHeaderContextMenu";
import { gridRowIdOf } from "./field-errors";
import { useGridMdm, mdmHeaderLabelSignature } from "./grid-mdm";
import { buildColumnDefs, hasEditableColumn, resolveRowDrag } from "./column-defs";
import { displayedRowKeys, useRowCursor } from "./row-cursor";
import { useGridSelection } from "./useGridSelection";
import { useGridScreenContext } from "./useGridScreenContext";
import { useGridEditing, useGridRowClass } from "./useGridEditing";
import { useGridAutoSize } from "./useGridAutoSize";
import { useGridCarry } from "./useGridCarry";
import { GRID_FILTER_LOCALE_TEXT, GRID_FILTER_ROW_CLOSED_CLASS, useGridFilter } from "./useGridFilter";

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
  publishScreenContext = true,
  acceptScreenApply = false,
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
  settingsMenu = true,
  gridId,
  personalize,
  filter,
  title,
  header = true,
}: AgDataGridProps) {
  const gridRef = useRef<AgGridReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // 툴팁은 그리드 밖(body)에 띄워 좁은 그리드에서 잘리지 않게 한다 — 툴팁이 뜰 수 있는 동안에만 popupParent 를 바꾼다.
  useGridTooltipOutside(containerRef, gridRef);
  const hasEditableColumns = useMemo(() => hasEditableColumn(columns), [columns]);
  // 이 그리드가 놓인 자리 — panel(GridPanel 그리드 영역: 메뉴는 GridPanel 머리줄), dialog(대화 상자 안: 엑셀만 있는 머리글 줄 아이콘), standalone(그 밖: 이 그리드의 머리글 줄 아이콘).
  // DOM 을 봐야 알 수 있어 페인트 전에 한 번 정한다(null 인 첫 렌더에는 아이콘을 그리지 않아 깜빡이지 않는다).
  const gridPanelRegistry = useGridPanelRegistry();
  // 스스로 머리줄을 그리는가 — GridPanel 등록부(context)가 없고 header={false} 가 아닐 때. 렌더 중에 정해지고 마운트 뒤 바뀌지 않아(바깥 상자가 처음부터 있다) 그리드가 다시 마운트되지 않는다.
  // GridPanel 안(등록부 있음)이면 GridPanel 머리줄이 이 그리드의 메뉴·검색 칸·건수·칩을 맡으므로 그리지 않는다.
  // GridPanel 안에서 포털로 띄운 대화 상자·떠 있는 창·상세 팝오버는 shared 부품(Modal·FloatingPanel·DetailPopover)이 등록부를 끊어 주므로(GridPanelBoundary) 그 안 그리드는 여기서 자기 머리줄을 그린다.
  const selfHeader = header !== false && gridPanelRegistry === null;
  const [host, setHost] = useState<"panel" | "dialog" | "standalone" | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setHost(isInDialog(el) ? "dialog" : gridPanelRegistry && el.closest(".grid-panel-content") ? "panel" : "standalone");
  }, [gridPanelRegistry]);
  // GridPanel 이 정한 이 그리드의 자리 — 설정 메뉴 대상인가(대상이면 아래 줄 [엑셀] 단추를 뺀다), 걸러 보기 대상인가(filter 생략 그리드는 이것일 때만 켜진다).
  // 한 패널에 그리드가 하나면 둘 다 그 그리드다. 등록 효과(아래)가 채운다.
  // 값 하나씩 따로 둔다(객체 하나로 두면 해제 뒤 다시 등록하는 같은 커밋에서도 새 객체라 한 번 더 그린다).
  const [isMenuTarget, setIsMenuTarget] = useState(false);
  const [isFilterTarget, setIsFilterTarget] = useState(false);
  // 걸러 보기(빠른 검색 + 칸별 입력 줄) — filter 세 상태(true·false·생략)와 꺼진 동안의 비용·켜짐 기억은 useGridFilter.ts 머리 주석.
  const gridFilter = useGridFilter({
    filter,
    settingsMenu,
    // 스스로 머리줄을 그리는 그리드는 GridPanel 안 그리드와 같은 규칙으로 걸러 보기를 준다 — 대화 상자 밖(standalone)이면 host 를 panel 처럼 다루고 걸러 보기 대상은 자기 자신이다.
    inPanel: gridPanelRegistry !== null || (selfHeader && host !== "dialog"),
    host: selfHeader && host === "standalone" ? "panel" : host,
    isFilterTarget: selfHeader ? true : isFilterTarget,
    gridRef,
    gridId,
    personalize,
    editable: hasEditableColumns,
    serverPaged: gridPanelRegistry?.isServerPaged?.() ?? false,
  });
  const [gridReady, setGridReady] = useState(false);
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

  // 칸 편집·검증(useGridEditing.ts) — 검증 상태는 ref 에 두고 열 정의에는 고정 함수 cellIssue 만 넘긴다.
  const { issuesEnabled, cellIssue, handleCellValueChanged } = useGridEditing({
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
  });

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
      ...(gridFilter.filterColumns ? { filter: true } : {}),
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
      // 표시 순서라 빠른 검색에서 뺀다 — 넣으면 "1" 이 모든 행의 번호에 걸린다.
      getQuickFilterText: () => "",
      tooltipValueGetter: () => "",
    };
    return [noCol, ...defs];
  }, [columns, effectiveSortable, shouldAutoSizeColumns, resolvedColumnSizing, rowDragField, stableIsRowDraggable, rowNumber, mdm, issuesEnabled, cellIssue, gridFilter.filterColumns]);

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

  const getRowId = useCallback(
    (params: GetRowIdParams) => gridRowIdOf(params.data as Record<string, unknown>, rowKey),
    [rowKey]
  );

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

  // 자동 너비·여백 분배(useGridAutoSize.ts) — 개인화 훅에 넘길 sizedColumnsRef·다시 맞춤 콜백을 만들므로 개인화 훅보다 먼저 부른다.
  const {
    sizedColumnsRef,
    rerunAutoSizeAfterRestore,
    rerunAutoSizeAfterReset,
    autoSizeNowAfterColumnReset,
    onFirstDataRendered,
    onRowDataUpdated,
    onGridSizeChanged,
    handleColumnResized,
  } = useGridAutoSize({
    gridRef,
    containerRef,
    gridReady,
    data,
    columns,
    mdm,
    resolvedColumnSizing,
    shouldAutoSizeColumns,
    autoSizeOnDataUpdate,
  });

  // 화면 문맥 자동 게시(useGridScreenContext.ts) — 선택 행(없으면 포커스 행)을 도구 창 위젯에 넘긴다. 아래 이벤트 처리기에 덧붙이며, 끄면(false) 이벤트 배선이 예전과 같다.
  const screenCtx = useGridScreenContext({ gridRef, containerRef, enabled: publishScreenContext, acceptApply: acceptScreenApply });
  const onSelectionChangedWithCtx = useCallback(
    (event: SelectionChangedEvent) => {
      handleSelectionChanged(event);
      // 새 데이터를 받으며 옛 선택이 사라지는 변경은 사용자 조작이 아니라 데이터 갱신이다(다른 그리드의 문맥을 빼앗지 않는다).
      if (event.source === "rowDataChanged" || event.source === "gridInitializing") screenCtx.onDataChange();
      else screenCtx.onUserPick();
    },
    [handleSelectionChanged, screenCtx]
  );
  const onRowDataUpdatedWithCtx = useCallback(
    () => {
      onRowDataUpdated();
      screenCtx.onDataChange();
    },
    [onRowDataUpdated, screenCtx]
  );
  const onCellValueChangedWithCtx = useCallback(
    (event: CellValueChangedEvent) => {
      handleCellValueChanged(event);
      screenCtx.onDataChange();
    },
    [handleCellValueChanged, screenCtx]
  );

  // 컬럼 개인화(gridId·personalize) — 복원·자동 저장·열 정의 재주입 뒤 재적용. 결과(handle)는 컬럼 설정 창(C3)이 쓴다.
  const getGridApi = useCallback(() => gridRef.current?.api, []);
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
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
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
  // 초기화 — 바로 되돌리지 않고 확인 창을 거친다(저장한 설정을 지우므로). 설정 창의 [기본값 복원] 은 창 안에서 하는 일이라 확인 없이 resetPersonalize 를 쓴다.
  const requestReset = useCallback(() => {
    if (!personalizeHandleRef.current.enabled) return;
    setHeaderMenu(null);
    setResetConfirmOpen(true);
  }, []);
  const closeResetConfirm = useCallback(() => setResetConfirmOpen(false), []);
  const confirmReset = useCallback(() => {
    setResetConfirmOpen(false);
    personalizeHandleRef.current.reset();
  }, []);
  const resetColumnsAutoSizeRef = useRef(autoSizeNowAfterColumnReset);
  resetColumnsAutoSizeRef.current = autoSizeNowAfterColumnReset;
  // [컬럼 원래대로](개인화가 꺼진 그리드) — 칸 순서·너비·숨김·고정을 열 정의대로 되돌리고 정렬은 지킨다. 저장값이 없어 확인 창을 띄우지 않는다.
  // resetColumnState 는 정렬까지 정의대로 지우므로(정렬 되살리기가 sortChanged 를 두 번 낸다) 정렬을 뺀 정의 상태를 한 번에 적용한다 — state 에 sort 키가 없으면 ag-grid 는 정렬을 건드리지 않는다.
  // 선택 체크박스 열 같은 자동 열은 정의가 없어 맨 앞에 그대로 둔다(applyOrder 가 목록에 없는 열을 뒤로 보내므로). 정의에 너비가 없는 열(auto 그리드)은 너비를 건드리지 않고 바로 자동 너비를 잰다.
  const resetColumns = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api || api.isDestroyed()) return;
    const defCols = api.getColumns() ?? [];
    const lead = api.getAllGridColumns().filter((c) => !defCols.includes(c));
    const state: ColumnState[] = [
      ...lead.map((c) => ({ colId: c.getColId() })),
      ...defCols.map((c) => {
        const d = c.getColDef();
        return {
          colId: c.getColId(),
          hide: d.hide ?? d.initialHide ?? false,
          pinned: d.pinned ?? d.initialPinned ?? null,
          width: d.width ?? d.initialWidth ?? undefined,
          flex: d.flex ?? d.initialFlex ?? null,
        };
      }),
    ];
    api.applyColumnState({ state, applyOrder: true });
    resetColumnsAutoSizeRef.current();
  }, []);
  const toggleAutoSave = useCallback(() => {
    const handle = personalizeHandleRef.current;
    handle.setAutoSave(!handle.autoSave);
  }, []);
  // 창에서 숨기거나 다시 켠 뒤에는 복원 때와 같은 갈래로 자동 너비·여백 분배를 다시 돌린다(auto 그리드의 오른쪽 빈 공간·다시 켠 컬럼 너비).
  // 저장 너비가 있는 컬럼은 sizedColumnsRef 가 지킨다.
  const rerunAfterApplyRef = useRef(rerunAutoSizeAfterRestore);
  rerunAfterApplyRef.current = rerunAutoSizeAfterRestore;
  const applyPersonalize = useCallback((state: ColumnState[]) => {
    personalizeHandleRef.current.apply(state);
    rerunAfterApplyRef.current();
  }, []);
  // 설정 창 [지금 상태 저장](자동 저장이 꺼진 그리드에만 보인다) — 적용한 뒤 바로 저장한다.
  const savePersonalize = useCallback((state: ColumnState[]) => {
    personalizeHandleRef.current.apply(state);
    personalizeHandleRef.current.saveNow();
    rerunAfterApplyRef.current();
  }, []);
  // GridPanel 의 자동 저장 스위치 구독 — 스위치 값이 바뀐 렌더 뒤에 알린다(읽기 함수는 그 렌더가 갱신한 handle ref 를 읽는다).
  const autoSaveListenersRef = useRef(new Set<() => void>());
  const autoSave = personalizeHandle.autoSave;
  useEffect(() => {
    for (const fn of [...autoSaveListenersRef.current]) fn();
  }, [autoSave]);
  // GridPanel 에 올리는 명령 — 켜짐 상태(개인화·엑셀)가 같은 동안 같은 객체(렌더마다 새로 만들지 않는다). 개인화 명령은 개인화가 켜진 동안만,
  // 엑셀 명령은 엑셀 출력이 켜진 그리드만 채운다. 엑셀 함수·행 수는 ref 로 읽어 명령 객체가 바뀌지 않게 한다.
  // 엑셀 항목은 excelExport 를 주지 않아도 켠다(메뉴 항목만 — 아래 줄·행 수 안내는 excelExport 객체를 줄 때만). excelExport={false}·settingsMenu={false} 는 끈다.
  // 메뉴는 GridPanel 안이면 GridPanel 머리줄이, 밖이면 이 그리드 머리글 줄의 아이콘(GridSettingsOverlay)이 맡는다.
  const excelOptions = excelExport || undefined;
  const hasExcel = excelExport !== false && settingsMenu;
  const exportExcelRef = useRef<() => void>(() => {});
  const rowCountRef = useRef(0);
  const baseControls = useMemo<GridPanelGridControls>(
    () => ({
      ...(personalizeEnabled && settingsMenu
        ? {
            openSettings,
            requestReset,
            getAutoSave: () => personalizeHandleRef.current.autoSave,
            setAutoSave: (next: boolean) => personalizeHandleRef.current.setAutoSave(next),
            subscribeAutoSave: (listener: () => void) => {
              autoSaveListenersRef.current.add(listener);
              return () => {
                autoSaveListenersRef.current.delete(listener);
              };
            },
          }
        : {}),
      ...(!personalizeEnabled && settingsMenu ? { resetColumns } : {}),
      ...(hasExcel
        ? { exportExcel: () => exportExcelRef.current(), canExportExcel: () => rowCountRef.current > 0 }
        : {}),
    }),
    [personalizeEnabled, settingsMenu, hasExcel, openSettings, requestReset, resetColumns],
  );
  // GridPanel 에 올리는 명령 = 기본 명령 + 걸러 보기 명령. 머리글 줄 설정 아이콘(overlay, header={false})에는 filter={true} 의 걸러 보기만 보인다(filter 생략의 걸러 보기는 머리줄이 있는 그리드 전용).
  // 스스로 머리줄을 그리는 그리드의 머리줄 메뉴·검색 칸은 이 gridControls 전체를 쓴다.
  const gridControls = useMemo<GridPanelGridControls>(() => ({ ...gridFilter.controls, ...baseControls }), [gridFilter.controls, baseControls]);
  const overlayControls = useMemo<GridPanelGridControls>(() => ({ ...gridFilter.overlayControls, ...baseControls }), [gridFilter.overlayControls, baseControls]);
  // 이 그리드가 GridPanel 설정 메뉴의 대상이면 아래 줄 [엑셀] 단추를 뺀다(메뉴가 엑셀을 맡는다). 한 패널에 그리드가 여럿이면 대상이 아닌 그리드는 단추를 그대로 둔다.
  // 페인트 전에 등록해야 대상이 된 그리드의 아래 줄 [엑셀] 단추가 첫 프레임에 보였다 사라지지 않는다.
  useLayoutEffect(() => {
    // 설정 메뉴 항목(개인화·엑셀·칸별 필터)이 있거나 빠른 검색 칸을 둘 그리드(filter={true})만 올린다. settingsMenu={false} 면 gridControls 에 메뉴 명령이 없다.
    // filter 생략 그리드(mode optional)는 설정 메뉴가 있으면 「칸별 필터 보기」 항목을 가지므로 늘 올린다 — 실제 GridPanel 안 그리드인지는 아래 DOM 검사가 가린다.
    // settingsMenu 가 켜진 그리드는 늘 항목이 있다(개인화 항목 또는 [컬럼 원래대로]). GridPanel 밖 아이콘(showSettingsOverlay)은 [컬럼 원래대로] 하나만으로는 새로 생기지 않는다.
    if (!gridPanelRegistry || !(settingsMenu || gridFilter.mode !== "off")) return;
    // React context 는 포털을 넘어 오므로, GridPanel 안에서 띄운 팝업(룩업 등)의 그리드도 여기로 온다. 실제로 그 패널의
    // 그리드 영역 안에 있고 대화 상자 안이 아닌 그리드만 등록한다 — 개인화가 꺼진 패널에 남의 설정 메뉴가 생기지 않게.
    const el = containerRef.current;
    if (!el || !el.closest(".grid-panel-content") || isInDialog(el)) return;
    const unregister = gridPanelRegistry.register(gridControls, (menu, filterTarget) => {
      setIsMenuTarget(menu);
      setIsFilterTarget(filterTarget);
    });
    return () => {
      unregister();
      setIsMenuTarget(false);
      setIsFilterTarget(false);
    };
  }, [gridPanelRegistry, settingsMenu, personalizeEnabled, hasExcel, gridFilter.mode, gridControls]);
  // 개인화가 꺼지면(탭 비활성·키 충돌로 대기) 열려 있던 창·메뉴를 닫는다. 처음부터 꺼진 그리드는 아무 상태도 건드리지 않는다.
  const wasPersonalizeEnabledRef = useRef(false);
  useEffect(() => {
    if (!personalizeEnabled && wasPersonalizeEnabledRef.current) {
      setSettingsColumns(null);
      setHeaderMenu(null);
      setResetConfirmOpen(false);
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

  // 칸 포커스 — 화면이 onFocusedRowChange 를 받지 않고 문맥 게시도 끈 그리드는 예전처럼 처리기를 달지 않는다.
  const onCellFocusedWithCtx = useCallback(
    (event: CellFocusedEvent) => {
      handleCellFocused(event);
      screenCtx.onUserPick();
    },
    [handleCellFocused, screenCtx]
  );
  // 행 클래스(useGridEditing.ts) — 커서 훅 바로 뒤에서 불러 커서 → rowClassRefreshToken → _rowState 효과 순서를 지킨다.
  const getRowClass = useGridRowClass({
    gridRef,
    gridReady,
    data,
    rowKey,
    getRowClassExtra,
    rowClassRefreshToken,
    highlightedRowKeyRef,
    pendingHighlightRedrawRef,
  });

  // 새 창 분리 때 선택·스크롤·포커스·자체 커서 이어받기(useGridCarry.ts) — gridId 가 없거나 carry 컨텍스트 밖이면 하는 일이 없다. 커서 훅 뒤에서 부른다.
  const { initialState } = useGridCarry({
    gridRef,
    containerRef,
    gridReady,
    gridId,
    data,
    rowKey,
    selectable,
    selectedRows,
    cursorControlled,
    highlightedRowKeyRef,
    setOwnCursorKey,
    onRowClick,
  });

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
  // 스스로 머리줄을 그릴 때 `height` 의 뜻 — GridPanel 안 그리드와 같다: 숫자(또는 CSS 길이 문자열)는 표 높이이고 머리줄·걸린 조건 칩 줄은 그 위에 더해진다(바깥 상자는 내용 높이).
  // 생략·"100%" 는 부모 높이를 채우고(머리줄을 뺀 나머지가 표), "auto" 는 머리줄 + 행 수만큼이다.
  const isSizedTable = selfHeader && !isAutoHeight && !!height && height !== "100%";
  const fillsParent = selfHeader && !isAutoHeight && !isSizedTable;
  const getExcelApi = useCallback(() => gridRef.current?.api, []);
  const headerTitleText = selfHeader && typeof title === "string" ? title : undefined;
  const getPanelTitle = useCallback(() => gridPanelRegistry?.getTitle() ?? headerTitleText, [gridPanelRegistry, headerTitleText]);
  const exportExcel = useGridExcelExport(excelOptions, columns, sortedData, getExcelApi, getPanelTitle);
  exportExcelRef.current = exportExcel;
  rowCountRef.current = data.length;

  // 머리줄이 없는 GridPanel 밖 그리드(header={false} 등)의 설정 아이콘 — 항목(개인화·엑셀)이 하나라도 있을 때만. 있으면 아래 줄 [엑셀] 단추는 메뉴가 맡는다.
  // 스스로 머리줄을 그리는 그리드(selfHeader)는 이 아이콘 없이 머리줄 settings-slot 의 메뉴가 같은 일을 한다(아래 headerMenuControls).
  // 대화 상자 안 그리드는 엑셀 항목만 둔다 — 컬럼 설정·초기화는 모달을 하나 더 띄우는데, 겹친 모달에서는 Esc 한 번에 바깥 창까지 닫히고 Tab 이 갇힌다(머리글 우클릭 메뉴를 뺀 이유와 같다).
  // MantineProvider 밖(Mantine Menu 을 못 쓰는 자리)이면 아이콘을 그리지 않는다 — 아래 줄 [엑셀] 단추도 그대로 둔다.
  const hasMantine = useContext(MantineContext) !== null;
  const dialogControls = useMemo<GridPanelGridControls>(
    () => ({ exportExcel: gridControls.exportExcel, canExportExcel: gridControls.canExportExcel }),
    [gridControls],
  );
  const showSettingsOverlay =
    !selfHeader &&
    settingsMenu &&
    hasMantine &&
    ((host === "standalone" && (personalizeEnabled || hasExcel || filter === true)) || (host === "dialog" && hasExcel));
  // 스스로 그리는 머리줄의 메뉴·검색 칸 — host 가 정해진 뒤에 켠다(첫 렌더에 깜빡이지 않게). 대화 상자 안은 엑셀 출력 항목만 있는 메뉴이고 검색 칸·칩은 없다.
  const headerMenuControls =
    selfHeader && settingsMenu && hasMantine
      ? host === "standalone"
        ? gridControls
        : host === "dialog" && hasExcel
          ? dialogControls
          : null
      : null;
  // 검색 명령이 없는 그리드(filter={false}·settingsMenu={false})는 걸러 보기 대상이 아니다 — GridPanel 의 걸러 보기 대상과 같은 기준.
  const headerFilterControls = selfHeader && host === "standalone" && gridControls.setQuickFilter ? gridControls : null;

  // 행 선택 — 머리글 전체 선택은 보이는 행(걸러진 결과)만 고른다(selectAll "filtered"). 거르지 않을 때는 모든 행이라 전과 같다.
  // 걸러져 숨은 행의 선택은 필터가 바뀔 때 풀린다(useGridFilter 의 handleFilterChanged).
  const rowSelection = selectable
    ? multiSelect
      ? {
          mode: "multiRow" as const,
          enableClickSelection: false,
          checkboxes: true,
          headerCheckbox: true,
          selectAll: "filtered" as const,
          isRowSelectable: isRowSelectable ? (node: { data?: Record<string, unknown> }) => isRowSelectable(node.data ?? {}) : undefined,
        }
      : {
          mode: "singleRow" as const,
          enableClickSelection: false,
          checkboxes: true,
          headerCheckbox: false,
          isRowSelectable: isRowSelectable ? (node: { data?: Record<string, unknown> }) => isRowSelectable(node.data ?? {}) : undefined,
        }
    : undefined;

  const grid = (
    <div
      ref={containerRef}
      className={`cm-data-grid ag-theme-alpine${showSettingsOverlay ? " cm-grid-settings-on" : ""}${isAutoHeight ? " cm-data-grid-auto-height" : ""}${isAutoHeight && sortedData.length === 0 ? " cm-data-grid-empty" : ""}${gridFilter.filterColumns && !gridFilter.rowOpen ? ` ${GRID_FILTER_ROW_CLOSED_CLASS}` : ""} ${className}`.trim()}
      style={
        fillsParent && !excelOptions
          ? // 바깥 상자(머리줄 + 표)가 부모 높이를 채우고 표는 남은 높이를 채운다.
            { flex: "1 1 0", minHeight: 0, width: "100%" }
          : {
              // 숫자 height 는 표 상자 높이 그대로(머리줄은 위에 더해진다). excelExport 가 있으면 감싸개가 그 높이를 갖고 표는 100% 다.
              height: isAutoHeight ? "auto" : excelOptions ? "100%" : fillsParent ? undefined : height || "100%",
              ...(isSizedTable && !excelOptions ? { flex: "none" } : null),
              width: "100%",
            }
      }
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
        initialState={initialState}
        rowSelection={rowSelection}
        onGridReady={onGridReady}
        onFirstDataRendered={onFirstDataRendered}
        onRowDataUpdated={publishScreenContext ? onRowDataUpdatedWithCtx : onRowDataUpdated}
        onGridSizeChanged={onGridSizeChanged}
        onColumnResized={handleColumnResized}
        onRowClicked={handleRowClicked}
        onRowDoubleClicked={handleRowDoubleClicked}
        onCellFocused={publishScreenContext ? onCellFocusedWithCtx : onFocusedRowChange ? handleCellFocused : undefined}
        onCellKeyDown={handleCellKeyDown}
        onCellEditingStopped={handleCellEditingStopped}
        onSelectionChanged={publishScreenContext ? onSelectionChangedWithCtx : handleSelectionChanged}
        onCellValueChanged={publishScreenContext ? onCellValueChangedWithCtx : handleCellValueChanged}
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
        // 머리글을 그리드 밖으로 끌어도 컬럼이 숨겨지지 않는다(개인화 여부와 무관) — 실수 숨김이 자동 저장되어 계속 사라지거나,
        // 개인화가 꺼진 그리드에서 되살릴 길 없이 사라지는 것을 막는다(2026-10-08 DB 뷰어 결함). 숨김은 컬럼 설정 창으로만 한다.
        suppressDragLeaveHidesColumns
        alwaysShowHorizontalScroll={alwaysShowHorizontalScroll}
        domLayout={isAutoHeight ? "autoHeight" : "normal"}
        localeText={gridFilter.filterColumns ? GRID_FILTER_LOCALE_TEXT : undefined}
        {...gridFilter.gridProps}
        {...rowDrag.gridProps}
      />
      {showSettingsOverlay ? <GridSettingsOverlay controls={host === "dialog" ? dialogControls : overlayControls} /> : null}
    </div>
  );

  const body = excelOptions ? (
    <AgDataGridExcelFrame
      options={excelOptions}
      data={data}
      onExcel={exportExcel}
      height={fillsParent ? undefined : height}
      fill={fillsParent}
      hideButton={isMenuTarget || showSettingsOverlay || headerMenuControls !== null}
    >
      {grid}
    </AgDataGridExcelFrame>
  ) : (
    grid
  );
  // 스스로 머리줄을 그리면 바깥을 세로 flex 상자로 감싼다 — 머리줄(+ 걸린 조건 칩 줄) 아래에 표가 온다. 생략·"100%" 면 바깥 상자가 부모를 채우고 표가 남은 높이를 채운다.
  // 숫자 `height` 면 바깥 상자는 내용 높이(auto)이고 표(excelExport 가 있으면 표 + 아래 줄 감싸개)가 그 높이를 갖는다 — 머리줄이 그 위에 더해진다.
  // 건수·검색 칸·메뉴·칩의 구독은 GridHeaderBar 안에 있어 그리드(AgGridReact)를 다시 그리지 않는다.
  const framed = selfHeader ? (
    <div
      className={`cm-grid-with-header${isAutoHeight ? " cm-grid-with-header--auto" : ""}${isSizedTable ? " cm-grid-with-header--sized" : ""}`}
      data-testid="grid-with-header"
      style={{ height: isAutoHeight || isSizedTable ? "auto" : "100%" }}
    >
      <GridHeaderBar title={title} count={sortedData.length} filterControls={headerFilterControls} menuControls={headerMenuControls} />
      {body}
    </div>
  ) : (
    body
  );
  // 늘 같은 모양(Fragment)으로 돌려준다 — 개인화가 켜지고 꺼질 때 그리드가 다시 마운트되지 않게. 꺼진 동안 덧붙는 DOM 은 없다.
  return (
    <>
      {framed}
      {personalizeEnabled && headerMenu ? (
        <GridHeaderContextMenu
          x={headerMenu.x}
          y={headerMenu.y}
          nonce={headerMenu.nonce}
          autoSave={autoSave}
          onOpenSettings={openSettings}
          onToggleAutoSave={toggleAutoSave}
          onReset={requestReset}
          onClose={closeHeaderMenu}
        />
      ) : null}
      {personalizeEnabled && settingsColumns ? (
        <ColumnSettingsModal
          opened
          columns={settingsColumns}
          onApply={applyPersonalize}
          onReset={resetPersonalize}
          onSave={autoSave ? undefined : savePersonalize}
          onClose={closeSettings}
        />
      ) : null}
      {personalizeEnabled && resetConfirmOpen ? (
        <MessageModal
          open
          title="초기화"
          alertType="confirm"
          message={
            <span data-testid="grid-reset-confirm">
              이 그리드의 컬럼 순서·너비·표시·고정·정렬을 기본값으로 되돌리고 저장한 설정을 지웁니다. 계속할까요?
            </span>
          }
          onClose={closeResetConfirm}
          onConfirm={confirmReset}
        />
      ) : null}
    </>
  );
}

export const AgDataGrid = memo(AgDataGridComponent);
export { AgDataGrid as DataGrid };
