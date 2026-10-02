"use client";

import "./grid.css";
import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from "react";
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
} from "ag-grid-community";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import {
  MdmMetaCard,
  resolveCaption,
  useMdmCaptionPriority,
  useMdmColumns,
  useMdmMetaScope,
  type MdmCaptionPriority,
  type MdmColumnInfo,
  type MdmDomainMeta,
  type MdmScreenColumn,
} from "../../mdm-meta";
import { GRID_SIZE_CHANGE_SETTLE_MS, resolveGridSizeChangeAction } from "./grid-size-change";

/** `rowNumber` 로 넣는 행번호 열의 colId — 테스트·화면이 이 칸을 집을 때 쓴다. */
export const ROW_NUMBER_COL_ID = "__rowNo";

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * datetime-local 인라인 셀 편집기.
 * 표시값("YYYY-MM-DD HH:mm")을 받아 datetime-local 위젯으로 편집한 뒤
 * ISO 초단위("YYYY-MM-DDTHH:mm:00") 문자열로 반환한다(미입력 시 빈 문자열).
 */
const DateTimeCellEditor = function DateTimeCellEditor(
  // ★ag-grid v33 계약: 값 전달 = onValueChange(레거시 forwardRef getValue() 는 v33이 읽지 않음).
  props: { value?: unknown; onValueChange?: (value: unknown) => void }
) {
  const initial =
    typeof props.value === "string" && props.value
      ? props.value.slice(0, 16).replace(" ", "T")
      : "";
  const [value, setValue] = useState(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    // 초기값도 v33 계약으로 밀어둔다(미변경 종료 시 undefined 커밋 방지).
    props.onValueChange?.(initial ? `${initial}:00` : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <input
      ref={inputRef}
      type="datetime-local"
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        props.onValueChange?.(e.target.value ? `${e.target.value}:00` : "");
      }}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        padding: "0 8px",
        boxSizing: "border-box",
        font: "inherit",
      }}
    />
  );
};

/**
 * 행별 라벨 select 인라인 셀 편집기 — `cellEditorOptionsGetter` 전용.
 *
 * ★배경: ag-grid 기본 agSelectCellEditor 의 라벨 경로(refData)는 **컬럼 단위 전역 맵**이라,
 *   같은 키가 행마다 다른 라벨을 가지는 경우(예: 렉번호 R01 이 창고마다 다른 렉명) 라벨이 충돌한다.
 *   이 편집기는 편집 시작 시점의 행(row)으로 {value,label} 옵션을 계산해 행별 라벨을 정확히 표시한다.
 *   선택 즉시 편집을 종료(commit)해 agSelectCellEditor 와 동일한 UX 를 유지한다.
 */
const SelectCellEditor = function SelectCellEditor(props: {
  value?: unknown;
  options?: { value: string; label: string }[];
  // ★ag-grid v33 커스텀 에디터 계약: 값 전달 = onValueChange(레거시 forwardRef getValue() 는 v33이 읽지 않음
  //   → 선택해도 undefined 커밋 = 빈칸 버그의 원인). stopEditing 도 props 로 직접 온다.
  onValueChange?: (value: unknown) => void;
  stopEditing?: (suppressNavigateAfterEdit?: boolean) => void;
  api?: { stopEditing?: (cancel?: boolean) => void };
}) {
  const valueRef = useRef(String(props.value ?? ""));
  const [value, setValue] = useState(valueRef.current);
  const selRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const el = selRef.current;
    if (!el) return;
    el.focus();
    // ★단일 클릭에 드롭다운이 바로 열리도록 — 편집 진입(클릭 제스처) 직후 네이티브 피커를 연다.
    //   showPicker 미지원/사용자활성화 제약 시엔 조용히 무시(포커스만 유지).
    try {
      (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
    } catch {
      /* noop */
    }
  }, []);
  const options = props.options ?? [];
  // 현재 값이 후보에 없으면(옵션 미로드 등) 임시 항목으로 유지해 값 소실을 방지.
  const hasCurrent = options.some((o) => o.value === valueRef.current);
  return (
    <select
      ref={selRef}
      value={value}
      onChange={(e) => {
        valueRef.current = e.target.value;
        setValue(e.target.value);
        props.onValueChange?.(e.target.value); // ★v33: 그리드에 값 커밋
        (props.stopEditing ?? props.api?.stopEditing)?.();
      }}
      style={{
        width: "100%",
        height: "100%",
        border: "none",
        outline: "none",
        padding: "0 6px",
        boxSizing: "border-box",
        font: "inherit",
        background: "inherit",
      }}
    >
      {!hasCurrent ? <option value={valueRef.current}>{valueRef.current}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
};

const DEFAULT_FIXED_COLUMN_WIDTH = 120;

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

export interface GridColumn {
  key: string;
  /**
   * 머리글. 비우면(undefined) MDM 공급자 안에서는 컬럼 사전 캡션(labelShort → labelMid → labelLong → columnName), 그 밖에는 `key`.
   * `""` 는 일부러 비운 머리글로 그대로 둔다. 공급자가 `captionPriority="mdm"` 이면 MDM 캡션이 적은 값을 이긴다(spec B1·B2).
   */
  header?: string;
  /**
   * MDM 컬럼 사전 연결 키. 비우면 `key` 를 물리명으로 바꿔(`codeNm` → `CODE_NM`) 찾고, 물리명 문자열을 주면 그것으로, `false` 면 연결하지 않는다
   * (spec B6). 공급자(포털 탭) 밖에서는 쓰지 않는다.
   */
  meta?: string | false;
  /** 커스텀 헤더 컴포넌트 (ag-grid ColDef.headerComponent 패스스루). */
  headerComponent?: ColDef["headerComponent"];
  /** 커스텀 헤더 컴포넌트 파라미터 (ag-grid ColDef.headerComponentParams 패스스루). */
  headerComponentParams?: ColDef["headerComponentParams"];
  width?: number | string;
  minWidth?: number;
  align?: "left" | "center" | "right";
  headerAlign?: "left" | "center" | "right";
  type?: "string" | "number" | "boolean";
  sortable?: boolean;
  /** false 면 이 칸의 마우스오버 툴팁(셀 값)을 끈다 — 값이 화면 표시용이 아닌 render 전용 칸에 쓴다. */
  tooltip?: boolean;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
  /** 인라인 편집 허용 여부.
   * true → 모든 행 편집 가능, false → 모든 행 편집 불가, 함수 → 행별 동적 판단. */
  editable?: boolean | ((row: Record<string, unknown>) => boolean);
  /** 인라인 편집기 종류. 기본 "text".
   *  - "text"     → 기본 input
   *  - "number"   → 숫자만
   *  - "select"   → cellEditorParams.values 로 옵션 지정
   *  - "datetime" → datetime-local 위젯(날짜+시간). 값은 ISO 초단위 문자열로 반환 */
  cellEditor?: "text" | "number" | "select" | "datetime";
  /** select 편집기일 때 옵션. */
  cellEditorValues?: string[];
  /**
   * select 편집기 옵션을 **행별로 동적** 지정. 지정 시 `cellEditorValues`(정적)보다 우선한다.
   * (예: 창고→렉 캐스케이드처럼 같은 컬럼이라도 행마다 후보 목록이 다른 경우.)
   * 라벨은 `cellEditorValueLabels`(컬럼 단위 refData, 전체 키 상위집합) 로 표시된다.
   */
  cellEditorValuesGetter?: (row: Record<string, unknown>) => string[];
  /**
   * select 편집기 옵션을 **행별 {value,label} 목록**으로 동적 지정 — 라벨까지 행별로 정확해야 할 때 사용.
   * 지정 시 `cellEditorValuesGetter`/`cellEditorValues`/`cellEditorValueLabels`(전역 refData)보다 우선하며,
   * 전용 SelectCellEditor 가 드롭다운을 라벨로 표시하고 셀에는 키를 저장한다.
   * (예: 렉번호는 창고 내에서만 고유 — 같은 R01 이 창고마다 다른 렉명을 가지므로 전역 라벨맵이 불가.)
   * 셀 표시도 동일 라벨로 하려면 `render` 를 함께 지정한다.
   */
  cellEditorOptionsGetter?: (row: Record<string, unknown>) => { value: string; label: string }[];
  /**
   * select 편집기 옵션의 표시 라벨 맵 { 값(키): 표시문구 }. 지정 시 드롭다운은 라벨로 보이되 셀에는 키가 저장된다.
   * (예: { "KR022": "부품창고(KR022)" } → 명칭 표시·키 저장.) 셀 표시도 동일 라벨로 하려면 `render` 를 함께 지정.
   */
  cellEditorValueLabels?: Record<string, string>;
  /**
   * select 편집기를 ag-grid 내장(agSelectCellEditor)으로 강제(옵트아웃).
   * 기본(미지정)은 전용 SelectCellEditor — 단일 클릭 즉시 드롭다운 오픈·선택 즉시 commit.
   */
  selectNativeEditor?: boolean;
  /** 컬럼 숨김 (ag-grid 표준 ColDef.hide 패스스루). */
  hide?: boolean;
  /** 틀고정(좌/우 pinned) — ag-grid ColDef.pinned 패스스루. 가로 스크롤 시 해당 컬럼 고정. */
  pinned?: "left" | "right";
  /** 셀에 상시 부여할 CSS 클래스 (문자열 또는 행 단위 동적 함수). */
  cellClass?: string | string[] | ((row: Record<string, unknown>) => string | string[] | undefined);
  /** 조건부 셀 클래스 규칙 — { 클래스명: (row) => boolean } 형태. ag-grid 의 cellClassRules 패스스루. */
  cellClassRules?: Record<string, (row: Record<string, unknown>) => boolean>;
  /**
   * 행 드래그 손잡이를 이 컬럼에 둔다(ag-grid ColDef.rowDrag, community managed row drag).
   * 그리드에 `onRowOrderChange` 가 있을 때만 의미가 있다(TSK-05-02 D6).
   */
  rowDrag?: boolean;
  /** 머리 툴팁 (ag-grid ColDef/ColGroupDef.headerTooltip 패스스루). */
  headerTooltip?: string;
  /** 머리 칸 인라인 스타일 (ag-grid ColDef/ColGroupDef.headerStyle 패스스루). 색은 의미 토큰(var(--color-*))만 쓴다. */
  headerStyle?: ColDef["headerStyle"];
  /**
   * 하위 열 — 있으면 이 항목은 열 그룹(ColGroupDef, groupId = key)이 되고 잎만 데이터 열이다. 여러 줄 머리를 만든다.
   * 그룹 항목의 `headerComponent`·`headerComponentParams` 는 그룹 머리 컴포넌트(headerGroupComponent)로 쓴다.
   */
  children?: GridColumn[];
}

export interface AgDataGridProps {
  columns?: GridColumn[];
  data?: Record<string, unknown>[];
  rowKey?: string;
  /**
   * 그리드 높이. 기본 "100%"(부모 높이를 채우고 행은 안에서 스크롤).
   * `"auto"` 는 행 수만큼 높이가 늘어난다(ag domLayout="autoHeight") — 카드·패널 안의 몇 행짜리 작은 목록용.
   * 행이 많아질 수 있는 목록에는 쓰지 않는다(가상 스크롤이 꺼져 모든 행을 그린다).
   */
  height?: string | number;
  selectable?: boolean;
  multiSelect?: boolean;
  /** 편집이 완료된 행을 자동 선택한다. 일괄 처리 대상의 인라인 입력 화면에서 사용한다. */
  checkRowOnEdit?: boolean;
  isRowSelectable?: (row: Record<string, unknown>) => boolean;
  /**
   * ★제어형 선택(2026-07-28 구현): 제공 시 그리드 체크 상태를 이 키 목록과 동기화한다.
   * 페이지가 선택을 프로그램으로 교체(예: 헤더 전체선택 → 필요수량 맞춤 자동선택)할 수 있게 하는 옵션.
   * undefined = 비제어(기존 동작). (기존에 선언만 있고 미구현이던 prop 을 실제 배선.)
   */
  selectedRows?: (string | number)[];
  onRowSelect?: (
    selectedIds: (string | number)[],
    selectedData: Record<string, unknown> | Record<string, unknown>[]
  ) => void;
  onRowClick?: (row: Record<string, unknown>, event: Event) => void;
  onRowDoubleClick?: (row: Record<string, unknown>, event: Event) => void;
  /**
   * 칸 포커스가 옮겨 간 행(편집 그리드에서 ↑/↓·Tab·클릭으로 포커스 칸이 바뀔 때). 편집 컬럼이 있으면 ag-grid 가 화살표를
   * 먼저 처리해 컨테이너 ↑/↓(onRowClick) 가 돌지 않으므로, 커서 행을 따라가야 하는 화면이 이것으로 받는다. 같은 행이어도 부를 수 있다.
   */
  onFocusedRowChange?: (row: Record<string, unknown>) => void;
  /**
   * 글자 입력 칸을 편집하는 중 ↑/↓ 로 같은 열의 이전·다음 행으로 옮겨 편집을 이어 연다(엑셀식). 옮기기 전 칸은 편집을 마쳐 값을 반영한다.
   * 선택 목록 편집기처럼 ↑/↓ 를 스스로 쓰는 편집기는 건드리지 않는다. 기본 false.
   */
  editArrowNavigation?: boolean;
  sortable?: boolean;
  emptyMessage?: string;
  /** 데이터 없음 안내 문구에 붙일 data-testid(화면·E2E 가 빈 상태를 확인할 때). */
  emptyTestId?: string;
  className?: string;
  /**
   * 맨 앞에 행번호(No) 열을 둔다 — 목록에서 "이게 몇 번째 행인지" 를 바로 읽게 한다(ERP 목록 표준).
   *
   * <p>`true` 면 머리는 "No", 폭 56px. `{ header, width }` 로 바꿀 수 있다. 정렬하면 값이 다시 매겨진다
   * (저장 값이 아니라 ag-grid 의 표시 순서다).
   */
  rowNumber?: boolean | { header?: string; width?: number };
  /**
   * ★행 커서(`.ag-row-highlighted`) 위치 — **값을 넘기면 controlled**, 안 넘기면 그리드가 자체 관리한다.
   *
   * - controlled: 화면이 커서를 소유한다. `null` 로 주면 커서를 지운다(옛 계약 그대로).
   * - 자체 관리(기본값): 클릭한 행에 커서가 붙고 ↑/↓ 로 이전·다음 행으로 옮겨 간다(2026-09-30 기본 기능).
   *   목록이 있으면 어느 화면이든 "지금 어느 행이지" 가 보인다 — 화면마다 `onRowClick` + `highlightedRowKey` 를
   *   붙여야 했던 반복을 없앤다.
   * - 값을 넘기다가 `undefined` 로 바꾸면(`selectedId ?? undefined` 처럼) 커서를 지우고 자체 관리로 돌아간다.
   */
  highlightedRowKey?: string | number | null;
  scrollToRow?: string | number | null;
  loading?: boolean;
  loadingMessage?: string;
  autoSizeColumns?: boolean;
  /** @deprecated columnSizing="fit" 또는 명시 컬럼 폭을 사용한다. 이 prop 단독으로는 컨텐츠 기반 자동 폭을 켜지 않는다. */
  sizeToFit?: boolean;
  /**
   * 컬럼 합계가 화면보다 넓은 업무 그리드에서 가로 스크롤 영역을 항상 표시한다.
   * AG Grid `alwaysShowHorizontalScroll` 패스스루.
   */
  alwaysShowHorizontalScroll?: boolean;
  /**
   * columnSizing="auto" 일 때 데이터 변경마다 컨텐츠 기반 열폭을 다시 계산할지 여부.
   * 기본 true: 재조회 시 기존 셀보다 큰 데이터가 들어오면 컬럼을 자동 확장한다.
   * (50ms 디바운스 + userResizedRef 가드로 반복 측정/수동 폭은 보호됨)
   */
  autoSizeOnDataUpdate?: boolean;
  ariaLabel?: string;
  /**
   * 행 단위 높이 산출 (ag-grid getRowHeight 패스스루). 미지정/undefined 반환 시 기본 26px.
   * 한 셀에 여러 줄(개행)이 들어가는 그리드에서 사용한다 —
   * 예: SampleErp ManagedGrid 의 `row.Height = CountRow * 20` 재현.
   */
  getRowHeight?: (row: Record<string, unknown>) => number | undefined;
  /** 로우 클릭 시 선택 토글 (enableClickSelection 대신 직접 제어) */
  enableRowClickSelect?: boolean;
  /** 클릭 시 선택을 하지 않을 컬럼 key 목록 */
  selectExcludeColumns?: string[];
  /**
   * 행 아무 곳이나 클릭 시 그 행의 체크박스를 토글한다(기본 false). `selectable` 과 함께 사용.
   * 단 클릭 대상이 입력요소(input/select/textarea/button/a·contentEditable)·편집 중 셀·행 선택 체크박스면
   * 토글하지 않는다(이벤트 타깃 검사). `selectExcludeColumns` 도 함께 적용된다.
   * ★편집 가능 컬럼이 있는 그리드에는 사용하지 말 것 — 대신 `checkRowOnEdit` 을 쓴다.
   */
  rowClickCheck?: boolean;
  /** 셀 편집(인라인) 값 변경 콜백 — 컬럼의 editable 이 true 일 때만 발화. */
  onCellValueChanged?: (params: {
    rowKey: string | number;
    field: string;
    newValue: unknown;
    oldValue: unknown;
    row: Record<string, unknown>;
  }) => void;
  /** 한 번 클릭으로 편집 시작 (기본 false — 더블클릭으로 진입). */
  singleClickEdit?: boolean;
  /**
   * 셀이 포커스를 잃을 때 편집 모드를 자동 종료할지 (기본 true).
   * `false` 설정 시 행추가 직후 React re-render 로 cell 이 잠시 unmount/focus 이동되어도 편집 유지.
   * cma 4 화면 (Master Code 관리 등) 처럼 행추가 후 즉시 입력 시작이 필요한 경우 사용.
   */
  stopEditingWhenCellsLoseFocus?: boolean;
  /**
   * 컬럼 폭 모드 (기본 "fixed").
   *  - "auto" : autoSizeColumns 옵션 기반. 컨텐츠 폭을 DOM 측정하므로 필요한 화면에서만 명시 사용.
   *  - "fixed": col.width 픽셀 그대로. 합계가 그리드 폭 초과 시 좌우 스크롤. 데이터 변경에도 폭 유지.
   *  - "fit"  : col.width 를 비율(flex 가중치) 로 환산해 그리드 폭 100% 꽉 차게. 좌우 스크롤 없음.
   *
   * 예) col.width=[100, 200, 300] + columnSizing="fit" → 16.7% / 33.3% / 50% 분배.
   *     col.width 미지정 컬럼은 flex=1 로 동등 분배.
   */
  columnSizing?: "auto" | "fixed" | "fit";
  /** 행 단위 추가 클래스 (예: row 상태에 따른 색상 시각화). 내부 ag-row-* 와 병합됨. */
  getRowClassExtra?: (row: Record<string, unknown>) => string | string[] | undefined;
  /**
   * 동적인 `getRowClassExtra` 조건이 바뀌었음을 알리는 토큰.
   * 값이 바뀌면 AG Grid 행을 다시 그려 이전 행에 남은 클래스를 제거한다.
   * 드래그 오버처럼 rowData 자체는 그대로이고 행 분류만 빠르게 바뀌는 화면에서 사용한다.
   */
  rowClassRefreshToken?: unknown;
  /**
   * 트리(계층) 그리드에서 ←/→ 키로 현재 포커스(highlightedRowKey) 행을 펼침/접힘 할 때 호출.
   * expand=true(→ 펼침), false(← 접힘). 이 콜백이 있을 때만 ←/→ 를 가로채며, 없으면 ag-grid 기본 동작을 유지한다.
   * 트리 평탄화·펼침 상태 자체는 호출자가 관리한다(이 컴포넌트는 트리 구조를 모른다).
   */
  onRowExpandCollapse?: (rowKey: string | number, expand: boolean) => void;
  /**
   * 헤더 텍스트가 컬럼 폭보다 길면 줄바꿈(여러 줄) 표시. 좁은 고정폭 컬럼에서 헤더가 잘리는 것을 방지.
   * autoHeaderHeight 와 함께 쓰면 줄바꿈된 헤더 높이에 맞춰 헤더 행이 자동으로 커진다.
   */
  wrapHeaderText?: boolean;
  /** 헤더 높이를 헤더 내용(줄바꿈 포함)에 맞춰 자동 계산. wrapHeaderText 와 함께 사용. */
  autoHeaderHeight?: boolean;
  /**
   * 행 드래그 손잡이를 둘 열의 key — `GridColumn.rowDrag` 대신 그리드에서 지정한다. 지정하면 정렬(sortable)을 끈다
   * (ag-grid managed row drag 는 정렬 중 동작하지 않는다). `onRowOrderChange` 와 함께 쓴다.
   */
  rowDragField?: string;
  /** 행마다 드래그 가능 여부(rowDragField 와 함께). */
  isRowDraggable?: (row: Record<string, unknown>) => boolean;
  /**
   * 행을 끌어 순서를 바꾸면 끝난 뒤 새 순서의 행 키(rowKey 값, 임시 ID 칸이 있으면 그 값) 목록으로 호출한다(TSK-05-02 D6).
   * 이 prop 이 있을 때만 ag-grid managed row drag(rowDragManaged·onRowDragEnd)를 켜고 정렬을 끈다
   * (managed drag 는 정렬 중 동작하지 않는다). 손잡이는 `GridColumn.rowDrag` 또는 `rowDragField` 로 둔다. 없으면 기존 동작 그대로다.
   * 순서 상태의 주인은 호출자다 — 콜백에서 data 를 새 순서로 바꿔 넘긴다.
   */
  onRowOrderChange?: (orderedKeys: (string | number)[]) => void;
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
}

/** 머리글 툴팁 컴포넌트에 넘기는 값(ColDef.tooltipComponentParams). */
export interface MdmGridTooltipParams {
  mdmColumn: MdmScreenColumn;
  mdmDomain: MdmDomainMeta | null;
}

/**
 * MDM 메타가 있는 열의 ag-grid 사용자 툴팁(tooltipComponent). ag-grid 는 열의 tooltipComponent 를 머리글과 셀 툴팁에 함께 쓰므로,
 * 머리글(`location: "header"`)이면 MdmMetaCard 를, 셀이면 기본 툴팁과 같은 값 글자를 그린다.
 */
export function MdmGridTooltip(props: ITooltipParams & Partial<MdmGridTooltipParams>) {
  if (props.location === "header" && props.mdmColumn) {
    return (
      <div className="ag-tooltip mdm-meta-tooltip">
        <MdmMetaCard column={props.mdmColumn} domain={props.mdmDomain ?? null} />
      </div>
    );
  }
  const value = props.valueFormatted ?? props.value;
  return <div className="ag-tooltip">{value == null ? "" : String(value)}</div>;
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
  const headerName = columnCaption(col, opts.mdm);
  // MDM 머리글 툴팁 — 메타가 있고 화면이 headerTooltip·headerComponent 를 직접 주지 않았을 때만. 그 밖에는 키를 더하지 않는다(예전 열 정의 그대로).
  const mdmInfo = opts.mdm?.infoByKey.get(col.key);
  const mdmTooltip =
    mdmInfo?.column && col.headerTooltip == null && col.headerComponent == null
      ? {
          headerTooltip: headerName || mdmInfo.column.physName,
          tooltipComponent: MdmGridTooltip,
          tooltipComponentParams: { mdmColumn: mdmInfo.column, mdmDomain: mdmInfo.domain } satisfies MdmGridTooltipParams,
        }
      : null;
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
    cellClassRules: cellClassRulesProp,
    headerClass: col.headerAlign ? `header-${col.headerAlign}` : "header-center",
    headerTooltip: col.headerTooltip,
    headerStyle: col.headerStyle,
    rowDrag,
    ...(mdmTooltip ?? {}),
    ...(col.tooltip === false ? { tooltipValueGetter: () => "" } : {}),
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
 */
export function buildColumnDefs(columns: GridColumn[], opts: BuildColumnDefsOptions): (ColDef | ColGroupDef)[] {
  return columns.map((col) => {
    if (col.children && col.children.length > 0) {
      const group: ColGroupDef = {
        groupId: col.key,
        headerName: col.header ?? col.key,
        headerGroupComponent: col.headerComponent,
        headerGroupComponentParams: col.headerComponentParams,
        headerTooltip: col.headerTooltip,
        headerClass: col.headerAlign ? `header-${col.headerAlign}` : "header-center",
        headerStyle: col.headerStyle as ColGroupDef["headerStyle"],
        children: buildColumnDefs(col.children, opts),
      };
      return group;
    }
    return leafColDef(col, opts);
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

/** 그리드 안에서 쓰는 MDM 옵션. 공급자 밖이면 undefined — 열 정의가 예전과 같다. */
function useGridMdm(columns: GridColumn[]): BuildColumnDefsOptions["mdm"] {
  const scope = useMdmMetaScope();
  const entries = useMemo(() => (scope ? mdmLeafEntries(columns) : []), [scope, columns]);
  const infoByKey = useMdmColumns(entries);
  const priority = useMdmCaptionPriority();
  return useMemo(() => (scope ? { infoByKey, priority } : undefined), [scope, infoByKey, priority]);
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
  rowDragField,
  isRowDraggable,
  onRowOrderChange,
}: AgDataGridProps) {
  const gridRef = useRef<AgGridReact>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [gridReady, setGridReady] = useState(false);
  const userResizedRef = useRef(false);
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
  const columnDefs = useMemo<(ColDef | ColGroupDef)[]>(() => {
    const defs = buildColumnDefs(columns, {
      sortable: effectiveSortable,
      columnSizing: resolvedColumnSizing,
      shouldAutoSizeColumns,
      rowDragField,
      isRowDraggable: stableIsRowDraggable,
      ...(mdm ? { mdm } : {}),
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
  }, [columns, effectiveSortable, shouldAutoSizeColumns, resolvedColumnSizing, rowDragField, stableIsRowDraggable, rowNumber, mdm]);

  // 셀 텍스트가 컬럼 폭 초과로 잘려서 ... 으로 표시될 때 마우스오버 시 전체 값을 tooltip 으로 표시.
  // tooltipValueGetter 는 ag-grid 의 browser-native title 속성 사용 (별도 라이브러리 불필요).
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
      onCellValueChanged?.({
        rowKey: rk,
        field,
        newValue: event.newValue,
        oldValue: event.oldValue,
        row: data,
      });
    },
    [checkRowOnEdit, onCellValueChanged, rowKey, selectable]
  );

  const getRowId = useCallback(
    (params: GetRowIdParams) => {
      const tempId = params.data[GRID_TEMP_ID_FIELD];
      if (typeof tempId === "string" && tempId) return tempId;
      return String(params.data[rowKey] || params.data.id || params.data._rowIndex || "0");
    },
    [rowKey]
  );

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
        api.sizeColumnsToFit({
          defaultMinWidth: 1,
          columnLimits: cols.map((c) => ({
            key: c.getColId(),
            minWidth: c.getActualWidth(),
          })),
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
      gridRef.current.api.autoSizeAllColumns(false);
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

  // ★그리드 준비 직후 1회 폭 정리 — 데이터가 0건이면 ag-grid 가 firstDataRendered / rowDataUpdated 를
  //   내보내지 않아 아래 핸들러들이 한 번도 호출되지 않는다. 그 결과 "조회 결과가 없습니다" 상태에서
  //   컬럼 폭 합이 그리드보다 좁아도 우측이 빈 채로 남았다(2026-08-07 CR 이력 화면에서 실측: 그리드 976px
  //   vs 컬럼합 694px). 데이터 유무와 무관하게 마운트 후 한 번은 반드시 맞춘다.
  //   deps 는 길이만 본다 — 배열을 인라인으로 만드는 페이지에서 매 렌더 재실행되는 것을 피한다.
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
    if (!gridReady || !gridRef.current?.api) return;
    const api = gridRef.current.api;
    if (loading) {
      api.showLoadingOverlay();
      return;
    }
    // hideOverlay 는 "데이터 없음" 안내까지 숨긴다 — 조회가 끝났는데 행이 없으면 안내를 다시 띄운다.
    api.hideOverlay();
    if (api.getDisplayedRowCount() === 0) api.showNoRowsOverlay();
  }, [loading, gridReady]);

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

  const isAutoHeight = height === "auto";

  return (
    <div
      ref={containerRef}
      className={`cm-data-grid ag-theme-alpine${isAutoHeight ? " cm-data-grid-auto-height" : ""}${isAutoHeight && sortedData.length === 0 ? " cm-data-grid-empty" : ""} ${className}`.trim()}
      style={{ height: isAutoHeight ? "auto" : height || "100%", width: "100%" }}
      aria-label={ariaLabel || "데이터 목록"}
      aria-busy={loading}
      tabIndex={-1}
      onKeyDown={handleContainerKeyDown}
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
        alwaysShowHorizontalScroll={alwaysShowHorizontalScroll}
        domLayout={isAutoHeight ? "autoHeight" : "normal"}
        {...rowDrag.gridProps}
      />
    </div>
  );
}

export const AgDataGrid = memo(AgDataGridComponent);
export { AgDataGrid as DataGrid };
