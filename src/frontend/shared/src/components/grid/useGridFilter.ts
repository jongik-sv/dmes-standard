"use client";

/**
 * 그리드 걸러 보기(빠른 검색 + 칸별 입력 줄)의 상태와 명령 — AgDataGrid 가 쓴다.
 *
 * 세 상태(AgDataGrid `filter`)
 * - `true`(always): 빠른 검색 칸이 처음부터 늘 보이고, 「칸별 필터 보기」 는 입력 줄만 펴고 접는다. 끄면 칸별 조건만 지운다(검색어는 그대로).
 * - 생략(optional): GridPanel 안(대화 상자 밖)이거나 스스로 머리줄을 그리는(AgDataGrid `header`, 대화 상자 밖) 그리드 중 설정 메뉴가 있는 것만 대상이다. 빠른 검색 칸은 기본으로 늘 보이고(`quickVisible`),
 *   「칸별 필터 보기」 는 칸별 입력 줄만 펴고 접는다(처음에는 접힘). 끄면 칸별 조건만 지우고 검색어는 그대로다. `header={false}` GridPanel 밖·대화 상자 안이면 아무것도 생기지 않는다(host 가 정해진 뒤에 판정).
 *   스스로 머리줄을 그리는 그리드는 host 를 panel 로, 걸러 보기 대상을 자기 자신으로 본다(AgDataGrid 가 넘긴다) — 그래서 GridPanel 안 그리드와 같은 규칙이 된다.
 *   한 GridPanel 에 그리드가 여럿이면 GridPanel 이 정한 「걸러 보기 대상」(filter={true} 그리드 우선, 없으면 메뉴 대상)만 켜질 수 있다 — 그 밖의 생략 그리드는
 *   저장된 켜짐을 무시하고 꺼진 채 시작한다(끌 메뉴 항목이 그 그리드를 가리키지 않으므로).
 *   예외 — 서버 페이징 GridPanel(`serverPaged`): 지금 쪽 안에서만 걸러져 오해를 주므로 검색 칸이 기본으로 없고, 「필터 창 보기」 를 켜면 검색 칸과 입력 줄이 함께 나타난다.
 *   끄면 둘 다 사라지고 칸별 조건과 검색어를 모두 지운다.
 * - 입력 줄이 펼침에서 접힘으로 바뀌는 모든 경로(메뉴 토글·저장 키 변경·저장값 읽기·대상 상실)에서 칸별 조건을 지운다(서버 페이징 optional 은 검색어도). 효과 하나가 맡는다.
 * - 검색 칸이 보임에서 사라짐으로 바뀌는 경로(optional 의 대상 상실·자리 변경)에서는 검색어를 지운다 — 칸은 없는데 행만 숨은 채 남지 않게. 효과 하나가 맡는다.
 * - `false`(off): 메뉴 항목·검색 칸·필터 열 정의가 모두 없다.
 *
 * 꺼진 동안의 비용 — 결정: 열 정의에 필터 속성을 「처음 켤 때」 더한다(지연). 그때 칸 상태(너비·순서)는 직접 이어 준다
 * - 모든 GridPanel 그리드가 대상이라, 꺼진 그리드마다 필터 열 정의(칸별 필터 컴포넌트·입력 줄 DOM)를 미리 달면 화면 전체가 느려진다. 그래서 optional 그리드는
 *   한 번도 켜지 않은 동안 열 정의·AgGridReact prop·DOM(입력 줄 행, `cm-grid-filter-row-closed` 클래스)이 필터가 없던 때와 똑같다
 *   (`filterColumns` 가 false → buildColumnDefs 에 filter 를 넘기지 않는다).
 * - 실측(grid-filter.unit.test, 실제 ag-grid 33): 열 정의가 새 객체로 다시 들어오면 ag-grid 가 정의의 `width` 를 다시 적용하고 정의 순서로 되돌린다(사용자가 끌어 바꾼 너비·순서가
 *   정의값으로 돌아간다). 숨김·고정·정렬은 정의에 없어 그대로다. 그래서 `filterColumns` 가 바뀌는 모든 경로(메뉴 토글·저장된 켜짐이 늦게 들어옴·대상 변경)에서
 *   바뀐 커밋의 레이아웃 효과로 `api.getColumnState()` 를 잡아 둔다 — AgGridReact 는 prop 변경을 자기 passive 효과(준비 전이면 더 늦게)에서 적용하므로 부모의 레이아웃 효과가 먼저 돌아 옛 상태를 읽는다.
 *   새 정의가 들어가 `newColumnsLoaded` 가 오면(개인화 훅과 같은 시점) `applyColumnState({ applyOrder: true })` 로 한 번 돌려놓고 듣기를 끝낸다. 개인화 그리드의 재주입 재적용과 겹쳐도 같은 상태다.
 * - 빠른 검색만 쓰는 동안(입력 줄을 켜지 않음)에도 열 정의는 필터가 없던 때와 같다 — 빠른 검색은 열 정의의 filter 속성과 무관하게 모든 칸을 찾는다(시험 grid-quick-search).
 *   검색 칸이 보이는 동안 AgGridReact 에는 quickFilterText·onFilterChanged·onModelUpdated 만 더 넘긴다(거른 건수·숨은 행 선택 풀기에 필요).
 * - 한 번 켠 뒤에는 열 정의를 다시 바꾸지 않는다(`everOn` 은 되돌아가지 않는다). 끄고 켜기는 `floatingFiltersHeight`(0 ↔ 머리글 높이)로만 한다.
 *   입력 줄에 깔때기 단추가 있는 동안 ag-grid 는 머리글 깔때기를 그리지 않아(설치본 isHeaderFilterButtonEnabled), 접힌 머리글은 필터가 없는 그리드와 같아 보인다.
 * - 접힌 동안 입력 칸이 Tab 으로 잡히지 않게 그리드 칸에 `cm-grid-filter-row-closed` 를 단다(grid.css 가 입력 줄을 감춘다).
 * - 늘 달아 두는 방식을 고르지 않은 이유: 꺼진 동안에도 칸 수만큼 입력 줄 칸·필터 컴포넌트가 생기고 DOM 클래스가 달라진다. 수치는 시험 grid-filter.unit.test 「꺼진 동안의 DOM」 에 남겼다.
 *
 * 켜짐 기억
 * - 사용자가 켠 상태(「칸별 필터 보기」 — 서버 페이징은 「필터 창 보기」)를 그 그리드에 기억한다 — 조건값·검색어는 기억하지 않는다. 다시 열면 켜진 채로 시작한다.
 * - 이 값의 뜻은 「입력 줄 펼침」 이다(예전에는 optional 에서 걸러 보기 전체 켜짐). 저장 키는 그대로라 예전에 켜 둔 사용자는 입력 줄이 펼쳐진 채로 시작한다.
 * - 개인화가 켜진 그리드는 자동 설정 저장 스위치 값과 같은 객체(`gridOptsKey`)의 `filterOpen`, 아닌 그리드는 별도 키(`gridFilterKey`)에 적는다. 개인화 여부는 저장 위치를 고를 뿐
 *   기억의 키(memoryKey)에는 넣지 않는다 — 숨은 탭처럼 `personalize` 만 오가도 켜 둔 조건·검색어가 사라지지 않는다.
 *   자동 설정 저장 스위치가 꺼져 있어도 적는다(스위치와 같은 성격의 옵션). 사용자 ID·화면 키가 비면 기억하지 않고, 저장소 예외는 모두 삼킨다.
 *
 * 걸린 조건(칩)
 * - `getFilterChips`/`clearFilterChip` — 빠른 검색어와 칸별 필터 모델을 칩 목록으로 내주고(grid-filter-chips.ts), 칩 하나의 조건만 지운다. 건수와 같은 때(필터 변경·모델 갱신)에 다시 만들고,
 *   건수가 같아도 조건이 달라졌으면 구독자에게 알린다(검색어 KR02 → KR03). 내용이 같으면 같은 배열을 돌려준다.
 *
 * 그 밖에
 * - 빠른 검색어는 React 상태로 두지 않고 그리드 API 에 바로 넣는다 — 글자마다 그리드 전체를 다시 그리지 않게.
 * - 명령 객체(controls)는 모드가 같은 동안 같은 객체다. 값은 ref 로 읽는다.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { AgGridReact } from "ag-grid-react";
import type { ColumnState, IRowNode } from "ag-grid-community";

import { useTabPage } from "../../portal-shell/tab-page-context";
import type { GridFilterChip, GridFilterCount, GridPanelGridControls } from "./grid-panel-context";
import { buildFilterChips, COLUMN_CHIP_PREFIX, NO_FILTER_CHIPS, QUICK_CHIP_ID, sameChips } from "./grid-filter-chips";
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
  | "getQuickFilterText"
  | "getFilterRowOpen"
  | "setFilterRowOpen"
  | "getFilterCount"
  | "subscribeFilter"
  | "getQuickFilterVisible"
  | "isFilterEditable"
  | "getFilterChips"
  | "clearFilterChip"
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
  /** 머리글 줄 설정 아이콘(overlay, `header={false}` 인 GridPanel 밖 그리드)에 보일 명령 — always 만 채운다(optional 은 머리줄이 있는 그리드 전용). */
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
  /** GridPanel 이 정한 걸러 보기 대상인가(`filter` 생략 그리드는 이것일 때만 켜진다). GridPanel 밖이면 쓰이지 않는다. */
  isFilterTarget: boolean;
  gridRef: RefObject<AgGridReact | null>;
  gridId?: string;
  personalize?: GridPersonalize;
  /** 편집 칸이 있는 그리드인가 — 검색 안내 글에 쓴다. */
  editable: boolean;
  /** GridPanel 이 서버 페이징인가(optional 의 검색 칸을 기본으로 두지 않고 「필터 창 보기」 와 함께 켠다). */
  serverPaged?: boolean;
}

export function resolveGridFilterMode(filter: boolean | undefined, settingsMenu: boolean, inPanel: boolean): GridFilterMode {
  if (filter === true) return "always";
  if (filter === undefined && settingsMenu && inPanel) return "optional";
  return "off";
}

export function useGridFilter(opts: UseGridFilterOptions): GridFilterState {
  const { filter, settingsMenu, inPanel, host, isFilterTarget, gridRef, editable } = opts;
  const serverPaged = opts.serverPaged ?? false;
  const mode = resolveGridFilterMode(filter, settingsMenu, inPanel);
  // 설정 메뉴가 없으면 입력 줄을 펴고 접을 수 없다. optional 은 host 가 panel 로 정해진 뒤에야 켜진다.
  const withRowToggle = settingsMenu && mode !== "off";
  const live = mode === "always" || (mode === "optional" && host === "panel" && isFilterTarget);

  // 켜짐 기억 — 사용자가 이번 마운트에서 바꾼 값만 상태에 두고, 저장 키가 바뀌면 그 값은 버린다(자동 설정 저장 스위치와 같은 방식).
  const userId = useConfirmedUserId(withRowToggle);
  const { pageId } = useTabPage();
  const screenKey = resolveGridScreenKey(pageId);
  const gid = opts.gridId || DEFAULT_GRID_ID;
  const withPersonalize = resolvePersonalize(opts.personalize).enabled;
  // 개인화 여부(withPersonalize)는 저장 위치를 고르는 데만 쓴다 — 키에 넣으면 prop 이 오갈 때마다 이번 마운트의 선택이 버려져 조건·검색어가 남은 채 입력 칸만 사라진다.
  const memoryKey = `${userId}\u0000${screenKey}\u0000${gid}`;
  // 저장값은 키가 정해질 때(사용자 확인 뒤·화면/그리드 바뀜) 한 번 읽는다. 개인화 여부가 오가도 다시 읽지 않는다 — 저장 위치만 바뀔 뿐 켜 둔 상태는 그대로다.
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
  // 빠른 검색 칸을 보일 것인가 — always 는 늘, optional 은 걸러 보기 대상이면 기본으로 보인다. 서버 페이징 optional 만 입력 줄을 켠 동안에 한한다.
  const searchTiedToRow = mode === "optional" && serverPaged;
  const quickVisible = mode === "always" || (live && (!searchTiedToRow || chosen));
  const quickVisibleRef = useRef(quickVisible);
  quickVisibleRef.current = quickVisible;
  const memoryRef = useRef({ userId, screenKey, gid, withPersonalize, memoryKey, withRowToggle });
  memoryRef.current = { userId, screenKey, gid, withPersonalize, memoryKey, withRowToggle };

  // optional 은 한 번이라도 켠 뒤부터 열 정의에 필터를 단다 — 되돌리지 않는다(위 「꺼진 동안의 비용」). 걸러 보기 대상을 잃어 접혀도 정의는 그대로다(입력 줄 높이만 0).
  const everOnRef = useRef(false);
  if (mode === "optional" && rowOpen) everOnRef.current = true;
  const filterColumns = mode === "always" || (mode === "optional" && everOnRef.current);

  // 열 정의에 필터를 더하거나 걷는 모든 경로(메뉴 토글·저장된 켜짐이 늦게 들어옴·걸러 보기 대상 변경)에서 칸 상태(순서·너비)를 이어 준다.
  // 부모의 레이아웃 효과는 AgGridReact 의 prop 적용(passive 효과, 준비 전이면 그 뒤)보다 먼저 돌아 새 정의가 들어가기 전의 상태를 읽는다.
  // 적용은 개인화 훅처럼 `newColumnsLoaded` 에서 한 번 — prop 적용이 미뤄져도 새 정의가 들어온 뒤에야 돌려놓는다. 그 뒤 듣기를 끝내 남의 이벤트에 옛 상태를 덮어쓰지 않는다.
  const prevFilterColumnsRef = useRef(filterColumns);
  const carryOffRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    if (prevFilterColumnsRef.current === filterColumns) return;
    prevFilterColumnsRef.current = filterColumns;
    const api = gridRef.current?.api;
    if (!api || api.isDestroyed()) return;
    const state = api.getColumnState();
    if (state.length === 0) return;
    carryOffRef.current?.();
    const onNewColumns = (e: { source?: string }) => {
      if (e.source === "gridInitializing") return;
      off();
      if (!api.isDestroyed()) api.applyColumnState({ state, applyOrder: true });
    };
    const off = () => {
      if (!api.isDestroyed()) api.removeEventListener("newColumnsLoaded", onNewColumns);
      if (carryOffRef.current === off) carryOffRef.current = null;
    };
    api.addEventListener("newColumnsLoaded", onNewColumns);
    carryOffRef.current = off;
  }, [filterColumns, gridRef]);
  useEffect(() => () => carryOffRef.current?.(), []);

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
  }, [rowOpen, quickVisible, notify]);

  // 걸린 조건(칩) — 검색어와 칸별 필터 모델에서 만든다. 같은 내용이면 객체를 바꾸지 않는다. 바뀌었는지만 돌려주고 알림은 부른 쪽이 한다.
  const chipsRef = useRef<readonly GridFilterChip[]>(NO_FILTER_CHIPS);
  const computeChips = useCallback((): boolean => {
    const api = gridRef.current?.api;
    const live = api && !api.isDestroyed() ? api : null;
    const quick = quickRef.current;
    const next = quick === "" && (!live || !live.isAnyFilterPresent()) ? NO_FILTER_CHIPS : buildFilterChips(live, quick);
    if (sameChips(chipsRef.current, next)) return false;
    chipsRef.current = next;
    return true;
  }, [gridRef]);

  // 거른 건수 — 필터·검색어가 걸려 있을 때만. 같은 값이면 객체를 바꾸지 않고 알리지도 않는다. 걸린 조건 칩도 같은 때에 다시 만든다
  // (건수가 같아도 조건이 바뀔 수 있다 — 검색어 KR02 → KR03).
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
    const countChanged = !(prev === next || (prev && next && prev.shown === next.shown && prev.total === next.total));
    if (countChanged) countRef.current = next;
    const chipsChanged = computeChips();
    if (countChanged || chipsChanged) notify();
  }, [gridRef, notify, computeChips]);

  // 검색어를 지운다. 지울 것이 없으면 아무 일도 하지 않는다(같은 값을 다시 넣어 필터 이벤트를 일으키지 않게).
  const clearQuick = useCallback(() => {
    if (quickRef.current === "") return;
    quickRef.current = "";
    const api = gridRef.current?.api;
    if (api && !api.isDestroyed()) api.setGridOption("quickFilterText", "");
    if (computeChips()) notify();
  }, [gridRef, computeChips, notify]);
  // 칸별 조건을 지운다. 서버 페이징 optional 은 검색 칸도 함께 사라지므로 검색어도 지운다 — 그 밖에는 검색 칸이 남으니 검색어를 그대로 둔다.
  // 지울 것이 없으면 아무 일도 하지 않는다(같은 값을 다시 넣어 필터 이벤트를 일으키지 않게).
  const clearConditions = useCallback(() => {
    const api = gridRef.current?.api;
    const target = api && !api.isDestroyed() ? api : null;
    if (target && Object.keys(target.getFilterModel()).length > 0) target.setFilterModel(null);
    if (searchTiedToRow) clearQuick();
  }, [gridRef, searchTiedToRow, clearQuick]);

  // 입력 줄이 펼침에서 접힘으로 바뀌는 모든 경로(메뉴 토글·저장 키 변경·저장값 읽기·대상 상실)에서 조건을 지운다 — 보이지 않는 조건 때문에 행이 빠진 채 남지 않게.
  // 마운트 때의 값으로 시작해 처음 그릴 때는 지우지 않는다.
  const prevRowOpenRef = useRef(rowOpen);
  useEffect(() => {
    const was = prevRowOpenRef.current;
    prevRowOpenRef.current = rowOpen;
    if (was && !rowOpen) clearConditions();
  }, [rowOpen, clearConditions]);

  // 검색 칸이 보임에서 사라짐으로 바뀌면(걸러 보기 대상 상실·자리 변경) 검색어를 지운다 — 칸은 없는데 행만 숨은 채 남지 않게.
  const prevQuickVisibleRef = useRef(quickVisible);
  useEffect(() => {
    const was = prevQuickVisibleRef.current;
    prevQuickVisibleRef.current = quickVisible;
    if (was && !quickVisible) clearQuick();
  }, [quickVisible, clearQuick]);

  // 걸러져 숨은 행의 선택을 푼다 — 머리글 전체 선택은 보이는 행만 고르지만(selectAll "filtered") 먼저 골라 둔 행이 걸러져 사라지면 보이지 않는 선택이 남기 때문이다.
  // 푼 선택은 selectionChanged 로 화면 onRowSelect·화면 문맥(useGridScreenContext)에 그대로 알려진다.
  const dropHiddenSelection = useCallback(() => {
    const api = gridRef.current?.api;
    if (!api || api.isDestroyed()) return;
    const selected = api.getSelectedNodes();
    if (selected.length === 0) return;
    const shown = new Set<IRowNode>();
    api.forEachNodeAfterFilter((node) => {
      shown.add(node);
    });
    const hidden = selected.filter((node) => !shown.has(node));
    if (hidden.length > 0) api.setNodesSelected({ nodes: hidden, newValue: false, source: "api" });
  }, [gridRef]);
  const handleFilterChanged = useCallback(() => {
    dropHiddenSelection();
    refreshCount();
  }, [dropHiddenSelection, refreshCount]);

  const controls = useMemo<FilterControls>(() => {
    if (mode === "off") return {};
    return {
      setQuickFilter: (text: string) => {
        quickRef.current = text;
        const api = gridRef.current?.api;
        if (api && !api.isDestroyed()) api.setGridOption("quickFilterText", text);
        if (computeChips()) notify();
      },
      getQuickFilterText: () => quickRef.current,
      getFilterCount: () => countRef.current,
      subscribeFilter: (listener: () => void) => {
        listenersRef.current.add(listener);
        return () => {
          listenersRef.current.delete(listener);
        };
      },
      isFilterEditable: () => editableRef.current,
      getFilterChips: () => chipsRef.current,
      clearFilterChip: (id: string) => {
        if (id === QUICK_CHIP_ID) {
          clearQuick();
          return;
        }
        if (!id.startsWith(COLUMN_CHIP_PREFIX)) return;
        const api = gridRef.current?.api;
        if (!api || api.isDestroyed()) return;
        // 그 칸의 필터 모델만 비운다. 모델을 바꾼 뒤 onFilterChanged 로 행·건수·칩을 다시 센다.
        void api.setColumnFilterModel(id.slice(COLUMN_CHIP_PREFIX.length), null).then(() => {
          if (!api.isDestroyed()) api.onFilterChanged();
        });
      },
      ...(mode === "optional" ? { getQuickFilterVisible: () => quickVisibleRef.current } : {}),
      ...(withRowToggle
        ? {
            getFilterRowOpen: () => rowOpenRef.current,
            setFilterRowOpen: (open: boolean) => {
              if (open === rowOpenRef.current) return;
              // 접으면 조건을 바로 지운다(렌더를 기다리지 않게). 다른 경로로 접히는 경우는 위 효과가 지운다.
              if (!open) clearConditions();
              rowOpenRef.current = open;
              const m = memoryRef.current;
              saveGridFilterOpen(m.userId, m.screenKey, m.gid, open, m.withPersonalize);
              setToggled({ key: m.memoryKey, value: open });
              notify();
            },
          }
        : {}),
    };
  }, [mode, withRowToggle, gridRef, notify, clearConditions, clearQuick, computeChips]);

  const overlayControls = useMemo<FilterControls>(() => (mode === "always" ? controls : {}), [mode, controls]);

  const gridProps = useMemo<GridFilterState["gridProps"]>(() => {
    // 검색 칸이 없는 동안에는 검색어도 없다 — 사라지는 렌더에 옛 검색어가 prop 으로 실려 미뤄진 적용이 지운 뒤에 되살리지 않게.
    const quickFilterText = quickVisible ? quickRef.current : "";
    if (filterColumns) {
      return {
        quickFilterText,
        floatingFiltersHeight: rowOpen ? GRID_FILTER_ROW_HEIGHT : 0,
        onFilterChanged: handleFilterChanged,
        onModelUpdated: refreshCount,
      };
    }
    // 입력 줄을 켠 적이 없어도 검색 칸이 보이는 동안은 거른 건수·숨은 행 선택 풀기가 필요하다. 열 정의는 건드리지 않는다.
    return quickVisible ? { quickFilterText, onFilterChanged: handleFilterChanged, onModelUpdated: refreshCount } : {};
  }, [quickVisible, filterColumns, rowOpen, handleFilterChanged, refreshCount]);

  return { mode, filterColumns, controls, overlayControls, rowOpen: filterColumns && rowOpen, gridProps };
}
