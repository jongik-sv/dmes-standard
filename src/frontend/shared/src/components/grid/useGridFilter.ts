"use client";

/**
 * 그리드 걸러 보기(빠른 검색 + 칸별 입력 줄)의 상태와 명령 — AgDataGrid 가 쓴다.
 *
 * 세 상태(AgDataGrid `filter`)
 * - `true`(always): 빠른 검색 칸이 처음부터 늘 보이고, 「필터 창 보기」 는 입력 줄만 펴고 접는다. 끄면 칸별 조건만 지운다(검색어는 그대로).
 * - 생략(optional): GridPanel 안(대화 상자 밖)이고 설정 메뉴가 있는 그리드만 대상이다. 꺼짐이 기본이고, 「필터 창 보기」 를 켜면 검색 칸과 입력 줄이 함께
 *   나타난다. 끄면 둘 다 사라지고 칸별 조건과 검색어를 모두 지운다. GridPanel 밖·대화 상자 안이면 아무것도 생기지 않는다(host 가 정해진 뒤에 판정).
 * - `false`(off): 메뉴 항목·검색 칸·필터 열 정의가 모두 없다.
 *
 * 꺼진 동안의 비용 — 결정: 열 정의에 필터 속성을 「처음 켤 때」 더한다(지연). 그때 칸 상태(너비·순서)는 직접 이어 준다
 * - 모든 GridPanel 그리드가 대상이라, 꺼진 그리드마다 필터 열 정의(칸별 필터 컴포넌트·입력 줄 DOM)를 미리 달면 화면 전체가 느려진다. 그래서 optional 그리드는
 *   한 번도 켜지 않은 동안 열 정의·AgGridReact prop·DOM(입력 줄 행, `cm-grid-filter-row-closed` 클래스)이 필터가 없던 때와 똑같다
 *   (`filterColumns` 가 false → buildColumnDefs 에 filter 를 넘기지 않는다).
 * - 실측(grid-filter.unit.test, 실제 ag-grid 33): 열 정의가 새 객체로 다시 들어오면 ag-grid 가 정의의 `width` 를 다시 적용하고 정의 순서로 되돌린다(사용자가 끌어 바꾼 너비·순서가
 *   정의값으로 돌아간다). 숨김·고정·정렬은 정의에 없어 그대로다. 그래서 처음 켜는 순간에만 `api.getColumnState()` 를 잡아 두고, 새 정의가 들어간 뒤(같은 커밋의 효과 —
 *   AgGridReact 가 prop 변경을 자기 효과에서 적용한 직후) `applyColumnState({ applyOrder: true })` 로 돌려놓는다. 개인화 그리드의 재주입 재적용(newColumnsLoaded)과 겹쳐도 같은 상태다.
 * - 한 번 켠 뒤에는 열 정의를 다시 바꾸지 않는다(`everOn` 은 되돌아가지 않는다). 끄고 켜기는 `floatingFiltersHeight`(0 ↔ 머리글 높이)로만 한다.
 *   입력 줄에 깔때기 단추가 있는 동안 ag-grid 는 머리글 깔때기를 그리지 않아(설치본 isHeaderFilterButtonEnabled), 접힌 머리글은 필터가 없는 그리드와 같아 보인다.
 * - 접힌 동안 입력 칸이 Tab 으로 잡히지 않게 그리드 칸에 `cm-grid-filter-row-closed` 를 단다(grid.css 가 입력 줄을 감춘다).
 * - 늘 달아 두는 방식을 고르지 않은 이유: 꺼진 동안에도 칸 수만큼 입력 줄 칸·필터 컴포넌트가 생기고 DOM 클래스가 달라진다. 수치는 시험 grid-filter.unit.test 「꺼진 동안의 DOM」 에 남겼다.
 *
 * 켜짐 기억
 * - 사용자가 켠 상태(「필터 창 보기」)를 그 그리드에 기억한다 — 조건값·검색어는 기억하지 않는다. 다시 열면 켜진 채로 시작한다.
 * - 개인화가 켜진 그리드는 자동 설정 저장 스위치 값과 같은 객체(`gridOptsKey`)의 `filterOpen`, 아닌 그리드는 별도 키(`gridFilterKey`)에 적는다.
 *   자동 설정 저장 스위치가 꺼져 있어도 적는다(스위치와 같은 성격의 옵션). 사용자 ID·화면 키가 비면 기억하지 않고, 저장소 예외는 모두 삼킨다.
 *
 * 그 밖에
 * - 빠른 검색어는 React 상태로 두지 않고 그리드 API 에 바로 넣는다 — 글자마다 그리드 전체를 다시 그리지 않게.
 * - 명령 객체(controls)는 모드가 같은 동안 같은 객체다. 값은 ref 로 읽는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { ColumnState } from "ag-grid-community";

import { useTabPage } from "../../portal-shell/tab-page-context";
import type { GridFilterCount, GridPanelGridControls } from "./grid-panel-context";
import { loadGridFilterOpen, resolveGridScreenKey, resolvePersonalize, saveGridFilterOpen, DEFAULT_GRID_ID } from "./grid-personalize";
import { useConfirmedUserId } from "./grid-personalize-hook";
import type { GridPersonalize } from "./grid-personalize";

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
  | "setQuickFilter"
  | "getFilterRowOpen"
  | "setFilterRowOpen"
  | "getFilterCount"
  | "subscribeFilter"
  | "getQuickFilterVisible"
  | "isFilterEditable"
>;

/** `always`: `filter={true}`, `optional`: `filter` 생략 + GridPanel 안 + 설정 메뉴, `off`: 그 밖. */
export type GridFilterMode = "always" | "optional" | "off";

/** 이 그리드가 놓인 자리(AgDataGrid 가 DOM 으로 정한다). 정해지기 전에는 null. */
export type GridFilterHost = "panel" | "dialog" | "standalone" | null;

export interface GridFilterState {
  mode: GridFilterMode;
  /** 열 정의에 필터 속성(칸별 필터·입력 줄)을 달 것인가. optional 은 처음 켤 때부터 켜진다. */
  filterColumns: boolean;
  /** GridPanel 에 올릴 명령. 필터가 없는 그리드는 빈 객체. */
  controls: FilterControls;
  /** GridPanel 밖 설정 아이콘(overlay)에 보일 명령 — always 만 채운다(optional 은 GridPanel 머리줄 전용). */
  overlayControls: FilterControls;
  /** 입력 줄이 펼쳐져 있는가. */
  rowOpen: boolean;
  /** AgGridReact 에 넘길 값. 열 정의에 필터가 없는 그리드는 모두 undefined(예전과 같은 prop). */
  gridProps: {
    quickFilterText?: string;
    floatingFiltersHeight?: number;
    onFilterChanged?: () => void;
    onModelUpdated?: () => void;
  };
}

export interface UseGridFilterOptions {
  /** 그리드 `filter` prop(세 상태). */
  filter: boolean | undefined;
  /** 설정 메뉴가 있는 그리드인가(입력 줄 펴기·접기 명령과 optional 모드의 조건). */
  settingsMenu: boolean;
  /** GridPanel 안에서 그려지는가(등록부 context 가 있는가). */
  inPanel: boolean;
  host: GridFilterHost;
  gridRef: RefObject<AgGridReact | null>;
  gridId?: string;
  personalize?: GridPersonalize;
  /** 편집 칸이 있는 그리드인가 — 검색 안내 글에 쓴다. */
  editable: boolean;
}

export function resolveGridFilterMode(filter: boolean | undefined, settingsMenu: boolean, inPanel: boolean): GridFilterMode {
  if (filter === true) return "always";
  if (filter === undefined && settingsMenu && inPanel) return "optional";
  return "off";
}

export function useGridFilter(opts: UseGridFilterOptions): GridFilterState {
  const { filter, settingsMenu, inPanel, host, gridRef, editable } = opts;
  const mode = resolveGridFilterMode(filter, settingsMenu, inPanel);
  // 설정 메뉴가 없으면 입력 줄을 펴고 접을 수 없다. optional 은 host 가 panel 로 정해진 뒤에야 켜진다.
  const withRowToggle = settingsMenu && mode !== "off";
  const live = mode === "always" || (mode === "optional" && host === "panel");

  // 켜짐 기억 — 사용자가 이번 마운트에서 바꾼 값만 상태에 두고, 저장 키가 바뀌면 그 값은 버린다(자동 설정 저장 스위치와 같은 방식).
  const userId = useConfirmedUserId(withRowToggle);
  const { pageId } = useTabPage();
  const screenKey = resolveGridScreenKey(pageId);
  const gid = opts.gridId || DEFAULT_GRID_ID;
  const withPersonalize = resolvePersonalize(opts.personalize).enabled;
  const memoryKey = `${userId}\u0000${screenKey}\u0000${gid}\u0000${withPersonalize ? 1 : 0}`;
  const saved = useMemo(
    () => (withRowToggle ? loadGridFilterOpen(userId, screenKey, gid, withPersonalize) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [withRowToggle, memoryKey],
  );
  const [toggled, setToggled] = useState<{ key: string; value: boolean } | null>(null);
  const chosen = toggled && toggled.key === memoryKey ? toggled.value : (saved ?? false);
  const rowOpen = withRowToggle && live && chosen;
  const rowOpenRef = useRef(rowOpen);
  rowOpenRef.current = rowOpen;
  const memoryRef = useRef({ userId, screenKey, gid, withPersonalize, memoryKey, withRowToggle });
  memoryRef.current = { userId, screenKey, gid, withPersonalize, memoryKey, withRowToggle };

  // optional 은 한 번이라도 켠 뒤부터 열 정의에 필터를 단다 — 되돌리지 않는다(위 「꺼진 동안의 비용」).
  const everOnRef = useRef(false);
  if (mode === "optional" && rowOpen) everOnRef.current = true;
  const filterColumns = mode === "always" || (mode === "optional" && live && everOnRef.current);

  // 처음 켤 때 잡아 둔 칸 상태 — 새 열 정의가 들어간 뒤 돌려놓는다(위 「꺼진 동안의 비용」).
  const carryStateRef = useRef<ColumnState[] | null>(null);
  useEffect(() => {
    const state = carryStateRef.current;
    if (!state || !filterColumns) return;
    carryStateRef.current = null;
    const api = gridRef.current?.api;
    if (api && !api.isDestroyed()) api.applyColumnState({ state, applyOrder: true });
  }, [filterColumns, gridRef]);
  const filterColumnsRef = useRef(filterColumns);
  filterColumnsRef.current = filterColumns;

  const editableRef = useRef(editable);
  editableRef.current = editable;
  const quickRef = useRef("");
  const countRef = useRef<GridFilterCount | null>(null);
  const listenersRef = useRef(new Set<() => void>());
  const notify = useCallback(() => {
    for (const fn of [...listenersRef.current]) fn();
  }, []);
  // 저장값이 늦게 들어와(사용자 확인 뒤) 켜짐이 바뀌어도 구독자(설정 메뉴·검색 칸)가 알도록 — 토글은 직접 알리므로 같은 값이면 무해하다.
  useEffect(() => {
    notify();
  }, [rowOpen, notify]);

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
    if (mode === "off") return {};
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
      isFilterEditable: () => editableRef.current,
      ...(mode === "optional" ? { getQuickFilterVisible: () => rowOpenRef.current } : {}),
      ...(withRowToggle
        ? {
            getFilterRowOpen: () => rowOpenRef.current,
            setFilterRowOpen: (open: boolean) => {
              if (open === rowOpenRef.current) return;
              const api = gridRef.current?.api;
              if (!open && api && !api.isDestroyed()) {
                // 접으면 칸별 조건을 지운다 — 보이지 않는 조건 때문에 행이 빠진 채 남지 않게.
                api.setFilterModel(null);
                // optional 은 검색 칸도 함께 사라지므로 검색어도 지운다. always 는 검색 칸이 남으니 검색어를 그대로 둔다.
                if (mode === "optional") {
                  quickRef.current = "";
                  api.setGridOption("quickFilterText", "");
                }
              }
              // 처음 켜서 열 정의에 필터가 더해질 참이면 지금 칸 상태를 잡아 둔다(사용자가 바꾼 너비·순서가 정의값으로 돌아가지 않게).
              if (open && mode === "optional" && !filterColumnsRef.current && api && !api.isDestroyed()) {
                carryStateRef.current = api.getColumnState();
              }
              rowOpenRef.current = open;
              const m = memoryRef.current;
              saveGridFilterOpen(m.userId, m.screenKey, m.gid, open, m.withPersonalize);
              setToggled({ key: m.memoryKey, value: open });
              notify();
            },
          }
        : {}),
    };
  }, [mode, withRowToggle, gridRef, notify]);

  const overlayControls = useMemo<FilterControls>(() => (mode === "always" ? controls : {}), [mode, controls]);

  const gridProps = useMemo<GridFilterState["gridProps"]>(
    () =>
      filterColumns
        ? {
            quickFilterText: quickRef.current,
            floatingFiltersHeight: rowOpen ? GRID_FILTER_ROW_HEIGHT : 0,
            onFilterChanged: refreshCount,
            onModelUpdated: refreshCount,
          }
        : {},
    [filterColumns, rowOpen, refreshCount],
  );

  return { mode, filterColumns, controls, overlayControls, rowOpen: filterColumns && rowOpen, gridProps };
}
