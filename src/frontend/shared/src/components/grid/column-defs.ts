import type { ColDef, ColGroupDef, EditableCallbackParams, RowDragEndEvent } from "ag-grid-community";
import { mdmCardHasHtml, type MdmCaptionPriority, type MdmColumnInfo } from "../../mdm-meta";
import { MdmHeaderLabel, type MdmHeaderLabelParams } from "./MdmHeaderLabel";
import { DateTimeCellEditor, SelectCellEditor } from "./cell-editors";
import { columnCaption, MdmGridTooltip, MDM_INVALID_CELL_CLASS, type MdmGridTooltipParams } from "./grid-mdm";
import type { GridColumn } from "./grid-types";

const DEFAULT_FIXED_COLUMN_WIDTH = 120;

function toColumnWidth(width: number | string | undefined): number | undefined {
  if (width == null || width === "") return undefined;
  const parsed = typeof width === "number" ? width : parseInt(String(width), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
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
  /**
   * 열 정의에 걸러 보기 속성을 달 것인가(AgDataGrid 가 `filter={true}` 이거나, `filter` 를 생략한 그리드를 처음 켠 뒤부터 넘긴다). 켜면 잎 열마다 칸별 필터와 입력 줄(floatingFilter)을 단다 —
   * 입력 줄을 펴고 접는 것은 그리드가 `floatingFiltersHeight` 로 한다. 없으면 열 정의는 걸러 보기가 없던 때와 같다.
   */
  filter?: boolean;
}

/** 셀에 보이는 글자 — 글자 필터·빠른 검색이 화면에 보이는 값(라벨·Y/N)으로 찾게 한다. 숫자는 천 단위 쉼표 없이 둔다. */
function filterText(col: GridColumn, value: unknown): string | null {
  if (value == null || value === "") return null;
  const label = col.cellEditorValueLabels?.[String(value)];
  if (label != null) return label;
  if (col.type === "boolean") return value ? "Y" : "N";
  return String(value);
}

/** 숫자 필터가 비교할 값 — 서버가 문자열("1,234")로 준 숫자도 숫자로 바꾼다. 숫자가 아니면 null(조건에 걸리지 않는다). */
function filterNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** 그리드 `filter` 를 켰을 때 잎 열에 더하는 필터 속성. `GridColumn.filter: false` 칸은 필터·빠른 검색에서 뺀다. */
function filterColDef(col: GridColumn): Partial<ColDef> {
  if (col.filter === false) return { filter: false, floatingFilter: false, getQuickFilterText: () => "" };
  const kind = col.filter ?? (col.type === "number" ? "number" : "text");
  const quick = col.cellEditorValueLabels
    ? // 라벨 칸은 코드와 라벨 어느 쪽으로도 찾게 둘 다 넣는다.
      { getQuickFilterText: (params: { value: unknown }) => [params.value ?? "", filterText(col, params.value) ?? ""].join(" ") }
    : col.type === "boolean"
      ? { getQuickFilterText: (params: { value: unknown }) => filterText(col, params.value) ?? "" }
      : {};
  if (kind === "number") {
    return {
      filter: "agNumberColumnFilter",
      floatingFilter: true,
      filterValueGetter: (params: { data?: Record<string, unknown> }) => filterNumber(params.data?.[col.key]),
      ...quick,
    };
  }
  return {
    filter: "agTextColumnFilter",
    floatingFilter: true,
    filterValueGetter: (params: { data?: Record<string, unknown> }) => filterText(col, params.data?.[col.key]),
    ...quick,
  };
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
    ...(opts.filter ? filterColDef(col) : {}),
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

/** 편집 가능한 잎 열이 하나라도 있는가(열 그룹 안까지 본다). 없으면 셀 포커스를 끈다. */
export function hasEditableColumn(columns: GridColumn[]): boolean {
  return columns.some((c) => (c.children && c.children.length > 0 ? hasEditableColumn(c.children) : !!c.editable));
}
