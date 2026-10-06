"use client";

import "./grid.css";
import React, { useState, useMemo, useRef, useEffect, useCallback, memo, type CSSProperties } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry } from "ag-grid-community";
import type {
  GridReadyEvent,
  RowClickedEvent,
  RowDoubleClickedEvent,
  SelectionChangedEvent,
  ColumnResizedEvent,
  ColDef,
  ColGroupDef,
  GetRowIdParams,
  RowDragEndEvent,
  RowClassParams,
  CellValueChangedEvent,
  CellFocusedEvent,
  CellKeyDownEvent,
  CellEditingStoppedEvent,
  IRowNode,
  EditableCallbackParams,
  GridApi,
  ITooltipParams,
  ColumnState,
} from "ag-grid-community";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import {
  MdmMetaCard,
  mdmCardHasHtml,
  mdmCaption,
  resolveCaption,
  toPhysName,
  useMdmCaptionPriority,
  useMdmColumns,
  useMdmMetaScope,
  validateMdmValue,
  type MdmCaptionPriority,
  type MdmColumnInfo,
  type MdmDomainMeta,
  type MdmScreenColumn,
} from "../../mdm-meta";
import { GRID_SIZE_CHANGE_SETTLE_MS, resolveGridSizeChangeAction } from "./grid-size-change";
import { GRID_TOOLTIP_SHOW_DELAY_MS } from "./grid-tooltip";
import { useGridTooltipOutside } from "./grid-tooltip-parent";
import { AgDataGridExcelFrame, type AgDataGridExcelExport } from "./AgDataGridExcel";
import { MdmHeaderLabel, type MdmHeaderLabelParams } from "./MdmHeaderLabel";
import type { GridColumn, AgDataGridProps, AgDataGridFieldError } from "./grid-types";
import { useGridPersonalize, type GridPersonalizeColumn } from "./grid-personalize-hook";
import { useGridPanelRegistry, type GridPanelGridControls } from "./grid-panel-context";
import { ColumnSettingsModal } from "./ColumnSettingsModal";
import { GridHeaderContextMenu } from "./GridHeaderContextMenu";
import { DateTimeCellEditor, SelectCellEditor } from "./cell-editors";
import { gridRowIdOf, indexFieldErrors } from "./field-errors";

export type { GridColumn, AgDataGridProps, AgDataGridFieldError } from "./grid-types";
export { gridRowIdOf, indexFieldErrors } from "./field-errors";

/** `rowNumber` 로 넣는 행번호 열의 colId — 테스트·화면이 이 칸을 집을 때 쓴다. */
export const ROW_NUMBER_COL_ID = "__rowNo";

ModuleRegistry.registerModules([AllCommunityModule]);

const DEFAULT_FIXED_COLUMN_WIDTH = 120;

/** 요소가 대화 상자(Mantine Modal 등 role="dialog") 안에 있는가. */
function isInDialog(el: Element): boolean {
  return el.closest('[role="dialog"]') != null;
}
/** 저장 너비 컬럼이 없을 때의 집합(공유 상수 — 렌더마다 새로 만들지 않는다). */
const EMPTY_SIZED_COLUMNS: ReadonlySet<string> = new Set();
export { GRID_TOOLTIP_SHOW_DELAY_MS };

function toColumnWidth(width: number | string | undefined): number | undefined {
  if (width == null || width === "") return undefined;
  const parsed = typeof width === "number" ? width : parseInt(String(width), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

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

/** 화면 검사 결과 한 칸 — 검사한 값과 문구. */
export interface MdmCellCheck {
  value: unknown;
  message: string;
}

function sameCellValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a == null && b == null;
  return String(a) === String(b);
}

/**
 * 칸 하나에 보일 오류 문구. 서버 오류가 있고 그 뒤 사용자가 고치지 않았으면(dismissed 아님) 서버 문구,
 * 아니면 화면 검사 문구(검사한 값이 지금 값과 같을 때만 — 값이 바뀌었으면 낡은 판정이다). 없으면 null.
 */
export function pickCellIssue(
  server: string | undefined,
  serverDismissed: boolean,
  client: MdmCellCheck | undefined,
  value: unknown
): string | null {
  if (server != null && !serverDismissed) return server;
  if (client && sameCellValue(client.value, value)) return client.message;
  return null;
}

/**
 * 행 드래그 설정(TSK-05-02 D6). `onRowOrderChange` 가 없으면 정렬 값을 그대로 두고 AgGridReact 에 더 넘기는 prop 이 없다
 * — 기존 그리드와 같은 prop 을 넘긴다. 있으면 정렬을 끄고 managed row drag 와 끝 콜백을 켠다.
 */
export function resolveRowDrag(
  onRowOrderChange: ((orderedKeys: (string | number)[]) => void) | undefined,
  sortable: boolean,
  onRowDragEnd: (event: RowDragEndEvent) => void
): { sortable: boolean; gridProps: { rowDragManaged?: boolean; onRowDragEnd?: (event: RowDragEndEvent) => void } } {
  if (!onRowOrderChange) return { sortable, gridProps: {} };
  return { sortable: false, gridProps: { rowDragManaged: true, onRowDragEnd } };
}

/** buildColumnDefs 옵션 — AgDataGrid props 에서 열 정의에 필요한 값만 받는다. */
export interface BuildColumnDefsOptions {
  sortable: boolean;
  columnSizing: "auto" | "fixed" | "fit";
  shouldAutoSizeColumns: boolean;
  /** 이 key 의 열에 드래그 손잡이(rowDrag)를 둔다. 있으면 정렬을 끈다(managed drag 는 정렬 중 동작하지 않는다). */
  rowDragField?: string;
  /** 행마다 드래그 가능 여부. rowDragField 와 함께 쓴다. */
  isRowDraggable?: (row: Record<string, unknown>) => boolean;
  /**
   * MDM 화면 메타(공급자 안에서만). 열 key → 메타. 있으면 비운 머리글을 MDM 캡션으로 채우고 머리글 툴팁을 MdmMetaCard 로 단다.
   * 없으면(공급자 밖) 열 정의는 예전과 같다.
   */
  mdm?: { infoByKey: Map<string, MdmColumnInfo>; priority: MdmCaptionPriority };
  /**
   * 칸 검증 표시(mdmValidate·fieldErrors 를 쓸 때만). (행 ID, 열 key, 지금 값) → 오류 문구 또는 null.
   * 있으면 잎 열마다 `cell-mdm-invalid` 규칙과 오류 문구를 먼저 보이는 셀 툴팁을 단다. 없으면 열 정의는 예전과 같다.
   */
  cellIssue?: (rowId: string, colKey: string, value: unknown) => string | null;
  /**
   * 열 그룹을 묶는다(그룹에 marryChildren, 그룹 아래 잎에 lockPinned) — 그룹 머리가 갈라진 순서·고정이 생기거나 저장되지 않게 한다.
   * AgDataGrid 는 늘 켠다. 없으면 열 정의는 예전과 같다(순수 함수 시험용).
   */
  lockGroups?: boolean;
}

/** 칸 검증 오류 칸에 다는 클래스. */
export const MDM_INVALID_CELL_CLASS = "cell-mdm-invalid";

/** 머리글 툴팁 컴포넌트에 넘기는 값(ColDef.tooltipComponentParams). */
export interface MdmGridTooltipParams {
  mdmColumn: MdmScreenColumn;
  mdmDomain: MdmDomainMeta | null;
}

/**
 * 사용자 툴팁 상자의 폭. ag-grid React 는 사용자 툴팁을 폭 0 인 absolute 감싸개(.ag-tooltip-custom) 안에 넣는다. 그래서 absolute 인
 * .ag-tooltip 이 내용에 맞춰 줄어들 폭을 얻지 못해 글자마다 줄이 바뀐다(2026-10-03 포털 확인). 내용 폭을 쓰고 넓은 내용은 최대 폭에서 줄을 바꾼다.
 */
const MDM_TOOLTIP_BOX_STYLE: CSSProperties = { width: "max-content", maxWidth: 380 };

/**
 * MDM 메타가 있는 열의 ag-grid 사용자 툴팁(tooltipComponent). ag-grid 는 열의 tooltipComponent 를 머리글과 셀 툴팁에 함께 쓰므로,
 * 머리글(`location: "header"`)이면 MdmMetaCard 를, 셀이면 기본 툴팁과 같은 값 글자를 그린다.
 * ag-grid 툴팁은 마우스가 들어갈 수 없으므로 카드는 늘 글자 카드다(textOnly). HTML 설명 카드는 머리글 라벨(MdmHeaderLabel)이 포털로 띄운다 —
 * 이 경로로 오는 HTML 열은 화면이 innerHeaderComponent 를 직접 준 열뿐이다.
 */
export function MdmGridTooltip(props: ITooltipParams & Partial<MdmGridTooltipParams>) {
  if (props.location === "header" && props.mdmColumn) {
    return (
      <div className="ag-tooltip mdm-meta-tooltip" style={MDM_TOOLTIP_BOX_STYLE}>
        <MdmMetaCard column={props.mdmColumn} domain={props.mdmDomain ?? null} textOnly />
      </div>
    );
  }
  // ag-grid 기본 TooltipComponent 와 같게 value(tooltipValueGetter 결과)만 그린다 — valueFormatted 는 쓰지 않는다.
  const value = props.value;
  return (
    <div className="ag-tooltip" style={MDM_TOOLTIP_BOX_STYLE}>
      {value == null ? "" : String(value)}
    </div>
  );
}

/**
 * HTML 설명 머리글 라벨(MdmHeaderLabel)을 단 잎 열 id 목록(그룹 안까지, 순서대로 이어 붙인 서명). 바뀌면 머리글을 다시 만든다 —
 * ag-grid 는 만든 뒤 colDef 에 innerHeaderComponent 가 생기거나 빠져도 머리글을 스스로 다시 만들지 않는다.
 */
export function mdmHeaderLabelSignature(defs: ReadonlyArray<ColDef | ColGroupDef>): string {
  const ids: string[] = [];
  const walk = (list: ReadonlyArray<ColDef | ColGroupDef>) => {
    for (const d of list) {
      if ("children" in d && Array.isArray(d.children)) walk(d.children);
      else if ((d as ColDef).headerComponentParams?.innerHeaderComponent === MdmHeaderLabel) {
        const c = d as ColDef;
        ids.push(c.colId ?? c.field ?? "");
      }
    }
  };
  walk(defs);
  return ids.join("\u0000");
}

/** 열 하나의 머리글 글자. MDM 이 없으면 적은 header, 그것도 없으면 key(ag-grid 가 field 로 'Code Nm' 같은 이름을 지어내지 않게). */
function columnCaption(col: GridColumn, mdm: BuildColumnDefsOptions["mdm"]): string {
  if (!mdm) return col.header ?? col.key;
  return resolveCaption(mdm.infoByKey.get(col.key)?.column ?? null, "grid", col.header, mdm.priority, col.key);
}

/** 잎 열 하나 → ag-grid ColDef. */
function leafColDef(col: GridColumn, opts: BuildColumnDefsOptions): ColDef {
  const sortableOn = opts.sortable && !opts.rowDragField;
  const isRowDraggable = opts.isRowDraggable;
  const rowDrag: ColDef["rowDrag"] =
    opts.rowDragField && col.key === opts.rowDragField
      ? isRowDraggable
        ? (params: { data?: unknown }) => isRowDraggable((params.data ?? {}) as Record<string, unknown>)
        : true
      : col.rowDrag
        ? true
        : undefined;
  const editableProp: ColDef["editable"] =
    typeof col.editable === "function"
      ? (params: EditableCallbackParams) =>
          (col.editable as (row: Record<string, unknown>) => boolean)(
            params.data as Record<string, unknown>
          )
      : col.editable;
  let cellEditor: ColDef["cellEditor"];
  let cellEditorParams: ColDef["cellEditorParams"];
  if (col.editable) {
    if (col.cellEditor === "number") cellEditor = "agNumberCellEditor";
    else if (col.cellEditor === "select") {
      const optionsGetter = col.cellEditorOptionsGetter;
      if (optionsGetter) {
        // 행별 {value,label} 옵션 — 전용 SelectCellEditor(라벨 행별 정확·선택 즉시 commit).
        cellEditor = SelectCellEditor;
        cellEditorParams = (params: { data?: unknown }) => ({
          options: optionsGetter((params.data ?? {}) as Record<string, unknown>),
        });
      } else if (col.selectNativeEditor) {
        // ★옵트아웃: ag-grid 내장 select(자동 오픈 없음·더블클릭성 UX)가 필요한 컬럼만 명시 사용.
        cellEditor = "agSelectCellEditor";
        const valuesGetter = col.cellEditorValuesGetter;
        cellEditorParams = valuesGetter
          ? (params: { data?: unknown }) => ({
              values: valuesGetter((params.data ?? {}) as Record<string, unknown>),
            })
          : { values: col.cellEditorValues ?? [] };
      } else {
        // ★기본(2026-07-28): 정적 옵션 select 도 전용 SelectCellEditor 로 통일 — 단일 클릭 즉시
        //   드롭다운 오픈 + 선택 즉시 commit(v33 onValueChange). (내장 agSelectCellEditor 는 포커스만
        //   가고 한 번 더 클릭해야 열려, 같은 그리드 안에서 동적옵션 콤보와 UX 가 갈리던 문제 해소.)
        //   라벨 = cellEditorValueLabels(키→라벨) 적용, 없으면 키 그대로.
        cellEditor = SelectCellEditor;
        const valuesGetter = col.cellEditorValuesGetter;
        const labels = col.cellEditorValueLabels;
        cellEditorParams = (params: { data?: unknown }) => {
          const values = valuesGetter
            ? valuesGetter((params.data ?? {}) as Record<string, unknown>)
            : (col.cellEditorValues ?? []);
          return { options: values.map((v) => ({ value: v, label: labels?.[v] ?? v })) };
        };
      }
    } else if (col.cellEditor === "datetime") cellEditor = DateTimeCellEditor;
    else cellEditor = "agTextCellEditor";
  }
  // columnSizing 우선 — 명시 시 autoSizeColumns/sizeToFit 무시.
  let widthProp: number | undefined;
  let flexProp: number | undefined;
  const explicitWidth = toColumnWidth(col.width);
  if (opts.columnSizing === "fixed") {
    widthProp = explicitWidth ?? Math.max(col.minWidth ?? 0, DEFAULT_FIXED_COLUMN_WIDTH);
    flexProp = undefined;
  } else if (opts.columnSizing === "fit") {
    // col.width 가 있으면 그 값을 flex 가중치로, 없으면 flex=1.
    // minWidth 는 아래 line 의 col.minWidth ?? col.width 로 보장됨 — 컬럼 합 > 그리드 시
    // 각 컬럼이 col.width 이하로 줄지 않고 좌우 스크롤 발생.
    widthProp = undefined;
    flexProp = explicitWidth ?? 1;
  } else {
    // auto
    widthProp = opts.shouldAutoSizeColumns
      ? undefined
      : (explicitWidth ?? Math.max(col.minWidth ?? 0, DEFAULT_FIXED_COLUMN_WIDTH));
    flexProp = undefined;
  }
  // cellClass — 문자열/배열/함수 모두 ag-grid 가 받음. 함수형은 params.data 만 사용해 row 단위 평가.
  const cellClassProp: ColDef["cellClass"] =
    typeof col.cellClass === "function"
      ? (params) =>
          (col.cellClass as (row: Record<string, unknown>) => string | string[] | undefined)(
            (params.data ?? {}) as Record<string, unknown>
          )
      : (col.cellClass as string | string[] | undefined);
  // cellClassRules — { 클래스명: (row) => boolean } 형태를 ag-grid 시그니처 (params) => boolean 로 래핑.
  const cellClassRulesProp: ColDef["cellClassRules"] | undefined = col.cellClassRules
    ? Object.fromEntries(
        Object.entries(col.cellClassRules).map(([cls, fn]) => [
          cls,
          (params: { data?: unknown }) => fn((params.data ?? {}) as Record<string, unknown>),
        ])
      )
    : undefined;
  // 칸 검증 표시 — cellIssue 가 있을 때만 규칙·툴팁을 더한다(없으면 예전 열 정의 그대로).
  const cellIssue = opts.cellIssue;
  const issueOf = cellIssue
    ? (params: { node?: { id?: string | null } | null; value?: unknown }) => {
        const id = params.node?.id;
        return id == null ? null : cellIssue(id, col.key, params.value);
      }
    : null;
  const issueClassRules: ColDef["cellClassRules"] | undefined = issueOf
    ? { ...(cellClassRulesProp ?? {}), [MDM_INVALID_CELL_CLASS]: (params) => !!issueOf(params) }
    : cellClassRulesProp;
  const issueTooltip = issueOf
    ? {
        tooltipValueGetter: (params: { node?: { id?: string | null } | null; value?: unknown }) =>
          issueOf(params) ?? (col.tooltip === false || params.value == null ? "" : String(params.value)),
      }
    : null;
  const headerName = columnCaption(col, opts.mdm);
  // MDM 머리글 툴팁 — 메타가 있고 화면이 headerTooltip·headerComponent 를 직접 주지 않았을 때만. 메타가 없는 열은 아래 기본 머리글 툴팁(표시 이름)이다.
  // HTML 설명 카드 열은 ag-grid 머리글 툴팁 대신 기본 머리글의 안쪽 라벨(MdmHeaderLabel)이 포털 카드를 띄운다(화면이 innerHeaderComponent 를
  // 이미 줬으면 손대지 않고 글자 머리글 툴팁). 셀 툴팁(MdmGridTooltip 셀 분기)은 어느 쪽이든 같다.
  const mdmInfo = opts.mdm?.infoByKey.get(col.key);
  const mdmCol = mdmInfo?.column && col.headerTooltip == null && col.headerComponent == null ? mdmInfo.column : null;
  const tooltipParams = mdmCol ? ({ mdmColumn: mdmCol, mdmDomain: mdmInfo?.domain ?? null } satisfies MdmGridTooltipParams) : null;
  // 표시 이름이 빈 열(header: "")은 라벨 글자가 비어 마우스를 올릴 곳이 없다 — 예전 글자 머리글 카드(칸 전체, 물리명 툴팁)로 둔다.
  const htmlLabel =
    mdmCol &&
    headerName.trim() !== "" &&
    mdmCardHasHtml(mdmCol) &&
    col.headerComponentParams?.innerHeaderComponent == null
      ? {
          headerComponentParams: {
            ...(col.headerComponentParams ?? {}),
            innerHeaderComponent: MdmHeaderLabel,
            innerHeaderComponentParams: tooltipParams satisfies MdmHeaderLabelParams | null,
          },
        }
      : null;
  const mdmTooltip = tooltipParams ? { tooltipComponent: MdmGridTooltip, tooltipComponentParams: tooltipParams } : null;
  // 머리글 툴팁 글자(ag-grid 는 빈 문자열이면 띄우지 않는다). 화면이 준 값이 이긴다(""면 끈다). HTML 카드 열은 라벨이 카드를 띄우므로 없고,
  // 글자 카드 열은 이름(빈 이름이면 물리명)으로 MdmGridTooltip 을 띄운다. 메타가 없는 열은 표시 이름을 기본으로 띄운다(말줄임된 머리글 확인,
  // 2026-10-05) — 빈 이름 열과 화면이 headerComponent 를 준 열은 두지 않는다.
  const headerTooltip =
    col.headerTooltip ??
    (htmlLabel
      ? undefined
      : tooltipParams
        ? headerName || tooltipParams.mdmColumn.physName
        : col.headerComponent == null && headerName.trim() !== ""
          ? headerName
          : undefined);
  return {
    field: col.key,
    headerName,
    headerComponent: col.headerComponent,
    headerComponentParams: col.headerComponentParams,
    hide: col.hide,
    pinned: col.pinned,
    width: widthProp,
    flex: flexProp,
    // fit 모드: minWidth = col.minWidth ?? col.width ?? 50 — 컬럼 합 > 그리드 시 col.width 보장 + 좌우 스크롤.
    // fixed/auto 모드: 기존과 동일 (col.minWidth || 50).
    minWidth:
      opts.columnSizing === "fit"
        ? (col.minWidth ?? explicitWidth ?? 50)
        : col.minWidth || 50,
    sortable: sortableOn && col.sortable !== false,
    resizable: true,
    editable: editableProp,
    cellEditor,
    cellEditorParams,
    // 숫자 편집기 칸은 숫자형으로 못박는다 — 추론에 맡기면 첫 행 값이 ""(새 행)일 때 문자열형이 되어
    // 편집기가 돌려준 숫자를 ag-grid 가 #135(형 불일치)로 버린다.
    cellDataType: cellEditor === "agNumberCellEditor" ? "number" : undefined,
    // refData(키→라벨) — agSelectCellEditor 드롭다운·셀 표시를 "명칭(코드)"로, 저장값은 키.
    refData: col.cellEditorValueLabels,
    cellStyle: { textAlign: col.align || "left" },
    cellClass: cellClassProp,
    cellClassRules: issueClassRules,
    headerClass: col.headerAlign ? `header-${col.headerAlign}` : "header-center",
    headerTooltip,
    headerStyle: col.headerStyle,
    rowDrag,
    ...(mdmTooltip ?? {}),
    ...(htmlLabel ?? {}),
    ...(col.tooltip === false ? { tooltipValueGetter: () => "" } : {}),
    ...(issueTooltip ?? {}),
    cellRenderer: col.render
      ? (params: { value: unknown; data: Record<string, unknown> }) =>
          col.render!(params.value, params.data)
      : undefined,
    valueFormatter: !col.render
      ? (params: { value: unknown }) => {
          const value = params.value;
          if (value == null) return "";
          const label = col.cellEditorValueLabels?.[String(value)];
          if (label != null) return label;
          switch (col.type) {
            case "number":
              return typeof value === "number" ? value.toLocaleString() : String(value);
            case "boolean":
              return value ? "Y" : "N";
            default:
              return String(value);
          }
        }
      : undefined,
  };
}

/**
 * GridColumn 트리 → ag-grid 열 정의. `children` 이 있으면 ColGroupDef(groupId = key)로, 잎만 ColDef 로 바꾼다(여러 줄 머리).
 * 순수 함수라 단위 테스트가 ag-grid 렌더 없이 확인한다.
 *
 * `lockGroups` 면 열 그룹에 `marryChildren: true`, 그룹 아래 잎에 `lockPinned: true` 를 준다(AgDataGrid 는 늘 켠다 — 이유는 호출부 주석).
 * 머리글 끌기로 잎이 그룹 밖으로 나가거나 남의 열이 그룹 사이에 끼거나(설치본 doesMovePassMarryChildren), 잎 하나만 고정 구역으로
 * 끌려 그룹 머리가 갈라진 채 저장되는 것(attemptToPinColumns 는 lockPinned 만 거른다)을 막는다. 정의에 적은 `pinned` 는 그대로 적용된다.
 */
export function buildColumnDefs(columns: GridColumn[], opts: BuildColumnDefsOptions, inGroup = false): (ColDef | ColGroupDef)[] {
  return columns.map((col) => {
    if (col.children && col.children.length > 0) {
      const group: ColGroupDef = {
        groupId: col.key,
        ...(opts.lockGroups ? { marryChildren: true } : {}),
        headerName: col.header ?? col.key,
        headerGroupComponent: col.headerComponent,
        headerGroupComponentParams: col.headerComponentParams,
        headerTooltip: col.headerTooltip,
        headerClass: col.headerAlign ? `header-${col.headerAlign}` : "header-center",
        headerStyle: col.headerStyle as ColGroupDef["headerStyle"],
        children: buildColumnDefs(col.children, opts, true),
      };
      return group;
    }
    const leaf = leafColDef(col, opts);
    return inGroup && opts.lockGroups ? { ...leaf, lockPinned: true } : leaf;
  });
}

/** MDM 메타를 찾을 잎 열(열 그룹 안까지). 이름 = 열 key. */
function mdmLeafEntries(columns: GridColumn[], out: Array<{ name: string; meta?: string | false }> = []) {
  for (const c of columns) {
    if (c.children && c.children.length > 0) mdmLeafEntries(c.children, out);
    else out.push({ name: c.key, meta: c.meta });
  }
  return out;
}

/**
 * 두 칸 메타 Map 이 그리드가 읽는 값까지 같은가 — 키 목록과 칸마다 column·domain(참조). `loading` 은 보지 않는다(그리드는 쓰지 않는다).
 */
export function sameGridMdmValues(a: Map<string, MdmColumnInfo>, b: Map<string, MdmColumnInfo>): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const [key, next] of b) {
    const prev = a.get(key);
    if (!prev || prev.column !== next.column || prev.domain !== next.domain) return false;
  }
  return true;
}

/**
 * 그리드 안에서 쓰는 MDM 옵션. 공급자 밖이면 undefined — 열 정의가 예전과 같다.
 * 값은 그리드가 읽는 메타(칸마다 column·domain)가 바뀔 때만 새로 낸다. 메타가 없는 칸(404·꺼진 모듈·사전에 없음)도 새 열 목록마다
 * 처음엔 `loading` 이었다가 응답 뒤 없음으로 바뀐다 — 그것만으로 값을 새로 내면 내용이 같은 열 정의가 ag-grid 에 다시 들어가고,
 * 머리 그룹 칸이 처음 붙는 커밋과 겹치면 React 개발 모드 효과 재실행이 파기된 머리 그룹 ctrl 을 다시 붙이다 죽는다
 * (getProvidedColumnGroup of null — mdm ruleEdit 첫 열 적용, 2026-10-03).
 */
function useGridMdm(columns: GridColumn[]): BuildColumnDefsOptions["mdm"] {
  const scope = useMdmMetaScope();
  const entries = useMemo(() => (scope ? mdmLeafEntries(columns) : []), [scope, columns]);
  const infoByKey = useMdmColumns(entries);
  const priority = useMdmCaptionPriority();
  const prevRef = useRef<BuildColumnDefsOptions["mdm"]>(undefined);
  return useMemo(() => {
    if (!scope) return (prevRef.current = undefined);
    const prev = prevRef.current;
    if (prev && prev.priority === priority && sameGridMdmValues(prev.infoByKey, infoByKey)) return prev;
    return (prevRef.current = { infoByKey, priority });
  }, [scope, infoByKey, priority]);
}

function resolveColumnHeaders(columns: GridColumn[], mdm: BuildColumnDefsOptions["mdm"]): GridColumn[] {
  return columns.map((c) =>
    c.children && c.children.length > 0
      ? { ...c, header: c.header ?? c.key, children: resolveColumnHeaders(c.children, mdm) }
      : { ...c, header: columnCaption(c, mdm) }
  );
}

/**
 * 그리드에 보이는 머리글로 header 를 채운 열 목록 — 화면이 엑셀 내보내기·열 선택처럼 `header` 를 직접 읽을 때 쓴다(열 그룹 안까지).
 * 공급자 안이면 AgDataGrid 와 같은 MDM 캡션, 밖이면 적은 header(없으면 key).
 */
export function useResolvedGridColumns(columns: GridColumn[]): GridColumn[] {
  const mdm = useGridMdm(columns);
  return useMemo(() => resolveColumnHeaders(columns, mdm), [columns, mdm]);
}

/** 편집 가능한 잎 열이 하나라도 있는가(열 그룹 안까지 본다). 없으면 셀 포커스를 끈다. */
export function hasEditableColumn(columns: GridColumn[]): boolean {
  return columns.some((c) => (c.children && c.children.length > 0 ? hasEditableColumn(c.children) : !!c.editable));
}

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

  const onGridReady = useCallback((_params: GridReadyEvent) => {
    setGridReady(true);
  }, []);

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

  const selectExcludeColumnsRef = useRef(selectExcludeColumns);
  selectExcludeColumnsRef.current = selectExcludeColumns;

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

  const handleRowClicked = useCallback(
    (event: RowClickedEvent) => {
      // 행 클릭 시 컨테이너로 focus 이동 → 이후 ArrowUp/Down 키보드 네비게이션이 동작.
      // preventScroll: focus 호출이 페이지 스크롤을 유발하지 않도록.
      // 단, cellEditor 가 활성 상태(편집 중)면 input focus 를 빼앗지 않도록 skip.
      const editingCells = gridRef.current?.api?.getEditingCells?.();
      if (!editingCells || editingCells.length === 0) {
        containerRef.current?.focus({ preventScroll: true });
      }

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
    [onRowClick, rowKey, enableRowClickSelect, rowClickCheck, selectable, cursorControlled]
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
