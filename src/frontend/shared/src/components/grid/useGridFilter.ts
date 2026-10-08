"use client";

/**
 * 그리드 `filter`(빠른 검색 + 칸별 입력 줄)의 상태와 명령 — AgDataGrid 가 쓴다.
 *
 * - 칸별 필터·입력 줄은 열 정의(column-defs `filterColDef`)가 늘 달고 있고, 입력 줄을 펴고 접는 것은 `floatingFiltersHeight`(0 ↔ 머리글 높이)로 한다.
 *   열 정의를 다시 넣지 않으므로 사용자가 바꾼 너비·순서·개인화 상태가 그대로다. 입력 줄에 깔때기 단추가 있는 동안 ag-grid 는 머리글 깔때기를
 *   그리지 않아(설치본 isHeaderFilterButtonEnabled), 접힌 머리글은 필터가 없는 그리드와 같아 보인다.
 * - 접힌 동안 입력 칸이 Tab 으로 잡히지 않게 그리드 칸에 `cm-grid-filter-row-closed` 를 단다(grid.css 가 입력 줄을 감춘다).
 * - 빠른 검색어는 React 상태로 두지 않고 그리드 API 에 바로 넣는다 — 글자마다 그리드 전체를 다시 그리지 않게.
 * - 명령 객체(controls)는 켜짐 상태가 같은 동안 같은 객체다. 값은 ref 로 읽는다.
 */
import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";

import type { GridFilterCount, GridPanelGridControls } from "./grid-panel-context";

/** 입력 줄을 폈을 때 높이 — AgDataGrid 머리글 높이(headerHeight)와 같다. */
export const GRID_FILTER_ROW_HEIGHT = 28;
/** 입력 줄이 접힌 그리드 칸의 클래스. */
export const GRID_FILTER_ROW_CLOSED_CLASS = "cm-grid-filter-row-closed";

/**
 * 필터 창·입력 줄의 한국어 문구(ag-grid localeText). 필터를 켠 그리드만 넘긴다 — 없는 키는 ag-grid 기본(영어)으로 나온다.
 * 키 이름은 설치본 ag-grid-community 33 의 기본 locale(LOCALE_TEXT) 키다.
 */
export const GRID_FILTER_LOCALE_TEXT: Record<string, string> = {
  filterOoo: "찾을 값…",
  applyFilter: "적용",
  resetFilter: "초기화",
  clearFilter: "지우기",
  cancelFilter: "취소",
  equals: "같음",
  notEqual: "같지 않음",
  contains: "포함",
  notContains: "포함 안 함",
  startsWith: "시작",
  endsWith: "끝",
  blank: "빈 값",
  notBlank: "값 있음",
  lessThan: "작다",
  greaterThan: "크다",
  lessThanOrEqual: "작거나 같다",
  greaterThanOrEqual: "크거나 같다",
  inRange: "범위",
  inRangeStart: "부터",
  inRangeEnd: "까지",
  andCondition: "그리고",
  orCondition: "또는",
  ariaFilterInput: "필터 입력",
  ariaFilterValue: "필터 값",
  ariaFilteringOperator: "조건",
  ariaFilterColumn: "필터할 칸",
  ariaFilterFromValue: "시작 값",
  ariaFilterToValue: "끝 값",
  ariaFilterMenuOpen: "필터 창 열기",
};

type FilterControls = Pick<
  GridPanelGridControls,
  "setQuickFilter" | "getFilterRowOpen" | "setFilterRowOpen" | "getFilterCount" | "subscribeFilter"
>;

export interface GridFilterState {
  /** GridPanel·설정 메뉴에 올릴 명령. 필터를 끈 그리드는 빈 객체. */
  controls: FilterControls;
  /** 입력 줄이 펼쳐져 있는가. */
  rowOpen: boolean;
  /** AgGridReact 에 넘길 값. 필터를 끈 그리드는 모두 undefined(예전과 같은 prop). */
  gridProps: {
    quickFilterText?: string;
    floatingFiltersHeight?: number;
    onFilterChanged?: () => void;
    onModelUpdated?: () => void;
  };
}

/**
 * @param enabled 그리드 `filter` prop.
 * @param withRowToggle 입력 줄 펴기·접기 명령을 내줄지(설정 메뉴가 있는 그리드만).
 */
export function useGridFilter(
  enabled: boolean,
  withRowToggle: boolean,
  gridRef: RefObject<AgGridReact | null>,
): GridFilterState {
  const [rowOpen, setRowOpen] = useState(false);
  const rowOpenRef = useRef(rowOpen);
  rowOpenRef.current = rowOpen;
  const quickRef = useRef("");
  const countRef = useRef<GridFilterCount | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const notify = useCallback(() => {
    for (const fn of [...listenersRef.current]) fn();
  }, []);

  // 거른 건수 — 필터·검색어가 걸려 있을 때만. 같은 값이면 객체를 바꾸지 않고 알리지도 않는다.
  const refreshCount = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api || api.isDestroyed()) return;
    let next: GridFilterCount | null = null;
    if (api.isAnyFilterPresent()) {
      let total = 0;
      api.forEachNode(() => {
        total += 1;
      });
      next = { shown: api.getDisplayedRowCount(), total };
    }
    const prev = countRef.current;
    if (prev === next || (prev && next && prev.shown === next.shown && prev.total === next.total)) return;
    countRef.current = next;
    notify();
  }, [gridRef, notify]);

  const controls = useMemo<FilterControls>(() => {
    if (!enabled) return {};
    return {
      setQuickFilter: (text: string) => {
        quickRef.current = text;
        const api = gridRef.current?.api;
        if (api && !api.isDestroyed()) api.setGridOption("quickFilterText", text);
      },
      getFilterCount: () => countRef.current,
      subscribeFilter: (listener: () => void) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      ...(withRowToggle
        ? {
            getFilterRowOpen: () => rowOpenRef.current,
            setFilterRowOpen: (open: boolean) => {
              if (open === rowOpenRef.current) return;
              // 접으면 칸별 조건을 지운다 — 보이지 않는 조건 때문에 행이 빠진 채 남지 않게. 검색어는 그대로 둔다.
              const api = gridRef.current?.api;
              if (!open && api && !api.isDestroyed()) api.setFilterModel(null);
              rowOpenRef.current = open;
              setRowOpen(open);
              notify();
            },
          }
        : {}),
    };
  }, [enabled, withRowToggle, gridRef, notify]);

  const gridProps = useMemo<GridFilterState["gridProps"]>(
    () =>
      enabled
        ? {
            quickFilterText: quickRef.current,
            floatingFiltersHeight: rowOpen ? GRID_FILTER_ROW_HEIGHT : 0,
            onFilterChanged: refreshCount,
            onModelUpdated: refreshCount,
          }
        : {},
    [enabled, rowOpen, refreshCount],
  );

  return { controls, rowOpen: enabled && rowOpen, gridProps };
}
