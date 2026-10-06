"use client";

/**
 * AgDataGrid 컬럼 개인화 — 복원·자동 저장·열 정의 재주입 뒤 재적용·키 충돌 등록부(C2).
 *
 * - 저장·병합 규칙은 `grid-personalize.ts`(순수 유틸)가 정한다. 여기는 그리드 API·React 수명과 잇는다.
 * - 저장 키: `useCurrentUserId()` · 화면(`useTabPage().pageId`, 없으면 `location.pathname`) · gridId(없으면 "main").
 *   사용자 ID 가 비었으면 읽지도 쓰지도 않는다.
 * - `personalize` 는 마운트 뒤에 바뀔 수 있다(숨은 탭 패널은 false, 활성 탭만 켬). 켜진 구간마다 등록부에 올리고, 사용자 확인 뒤
 *   한 번 복원한다. 꺼지면 대기 중인 저장을 흘려 보내고 등록부에서 빠진다. 컬럼 상태는 되돌리지 않는다.
 * - 등록부: 같은 탭 안에서 같은 저장 키의 그리드가 이미 켜져 있으면 나중 그리드는 개인화를 끄고(개발 모드 경고) 기다린다.
 *   소유자가 빠지면 기다리던 그리드가 이어받는다(등록부 구독).
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { ColDef, ColGroupDef, ColumnState, GridApi } from "ag-grid-community";

import { useTabPage } from "../../portal-shell/tab-page-context";
import { useCurrentUserId } from "../../portal-shell/use-current-user-id";
import type { GridColumn } from "./AgDataGrid";
import {
  DEFAULT_GRID_ID,
  GRID_SELECTION_COL_ID,
  clearGridPrefs,
  hideLockedColIds,
  loadGridPrefs,
  mergeColumnState,
  resolvePersonalize,
  saveGridPrefs,
  toGridPrefs,
  type GridDefaultColumn,
  type GridPersonalize,
  type GridPinned,
  type GridPrefs,
} from "./grid-personalize";

/** 자동 저장 대기 시간(ms). */
export const GRID_PERSONALIZE_SAVE_DEBOUNCE_MS = 300;

/**
 * 저장하는 이벤트 source — 사용자가 머리글·메뉴·도구 패널로 바꾼 것만(설치본 events.d.ts `ColumnEventType`).
 * 헤더 클릭 정렬은 `uiColumnSorted`(sortService.progressSort). `api`·`autosizeColumns`·`sizeColumnsToFit`·`flex`·
 * `gridOptionsChanged`(열 정의 재주입) 는 저장하지 않는다.
 */
export const GRID_PERSONALIZE_UI_SOURCES: ReadonlySet<string> = new Set([
  "uiColumnMoved",
  "uiColumnResized",
  "uiColumnDragged",
  "uiColumnSorted",
  "columnMenu",
  "contextMenu",
  "toolPanelUi",
  "toolPanelDragAndDrop",
]);

/** 저장 대상 그리드 이벤트. */
export const GRID_PERSONALIZE_SAVE_EVENTS = ["columnMoved", "columnResized", "columnVisible", "columnPinned", "sortChanged"] as const;

/** 저장을 판정할 이벤트의 모양(ag-grid 이벤트의 일부). */
export interface GridPersonalizeEvent {
  type: string;
  source?: string;
  finished?: boolean;
}

/** 이 이벤트가 사용자 변경이라 저장할 것인가. 크기 바꾸기는 끌기를 마친 마지막 이벤트(finished)만 본다. */
export function isPersonalizeSaveEvent(e: GridPersonalizeEvent, sortEnabled: boolean): boolean {
  if (!e.source || !GRID_PERSONALIZE_UI_SOURCES.has(e.source)) return false;
  if (e.type === "columnResized" && e.finished === false) return false;
  if (e.type === "sortChanged" && !sortEnabled) return false;
  return true;
}

// ── 키 충돌 등록부 ──────────────────────────────────────────────────────────────

const REGISTRY_KEY = "__dkOasisGridPersonalizeRegistry__";

interface GridPersonalizeRegistry {
  owners: Map<string, object>;
  listeners: Set<() => void>;
}

/** tsup 여러 entry 에서 둘로 갈리지 않게 globalThis 에 둔다(tab-page-context.ts 와 같은 방식). */
function registry(): GridPersonalizeRegistry {
  const g = globalThis as unknown as Record<string, GridPersonalizeRegistry | undefined>;
  return (g[REGISTRY_KEY] ??= { owners: new Map(), listeners: new Set() });
}

/** 등록부 키 — 탭이 다르면 같은 저장 키라도 충돌로 보지 않는다(포털은 같은 화면 탭을 둘 열 수 있다). */
export function gridPersonalizeRegistryKey(tabId: string | undefined, screenKey: string, gridId: string): string {
  return `${tabId ?? ""}\u0000${screenKey}\u0000${gridId || DEFAULT_GRID_ID}`;
}

/** 키를 차지한다. 비었거나 이미 내 것이면 true. */
export function claimGridPersonalizeKey(key: string, token: object): boolean {
  const r = registry();
  const owner = r.owners.get(key);
  if (owner && owner !== token) return false;
  r.owners.set(key, token);
  return true;
}

/** 내가 가진 키를 놓고, 기다리던 그리드에 알린다. */
export function releaseGridPersonalizeKey(key: string, token: object): void {
  const r = registry();
  if (r.owners.get(key) !== token) return;
  r.owners.delete(key);
  for (const fn of [...r.listeners]) fn();
}

function subscribeGridPersonalizeRegistry(fn: () => void): () => void {
  const r = registry();
  r.listeners.add(fn);
  return () => {
    r.listeners.delete(fn);
  };
}

// ── 기본 컬럼(정의 기준) ────────────────────────────────────────────────────────

function toPinned(p: ColDef["pinned"]): GridPinned | undefined {
  if (p === undefined) return undefined;
  if (p === "left" || p === true) return "left";
  if (p === "right") return "right";
  return null;
}

/**
 * 열 정의(AgDataGrid 가 만든 columnDefs) → 병합 기준 기본 컬럼. 순서는 정의 순서(열 그룹은 잎만, 깊이 우선)이고, 선택 체크박스가 있으면
 * 맨 앞(ag-grid resetColumnState 와 같은 자리)이다. width·hide·pinned 는 정의값이다 — 지금 그리드 상태가 아니다.
 * (`api.getColumns()` 는 선택 컬럼을 빼고, `api.getColumnDefs()` 는 지금 순서로 돌려주므로 쓰지 않는다.)
 */
export function defaultColumnsFromDefs(
  defs: ReadonlyArray<ColDef | ColGroupDef>,
  selectable: boolean,
): GridDefaultColumn[] {
  const out: GridDefaultColumn[] = selectable ? [{ colId: GRID_SELECTION_COL_ID }] : [];
  const walk = (list: ReadonlyArray<ColDef | ColGroupDef>) => {
    for (const d of list) {
      if ("children" in d && Array.isArray(d.children)) {
        walk(d.children);
        continue;
      }
      const c = d as ColDef;
      const colId = c.colId ?? c.field;
      if (!colId) continue;
      const col: GridDefaultColumn = { colId };
      if (typeof c.width === "number") col.width = c.width;
      if (c.hide != null) col.hide = !!c.hide;
      const pinned = toPinned(c.pinned);
      if (pinned !== undefined) col.pinned = pinned;
      out.push(col);
    }
  };
  walk(defs);
  return out;
}

// ── 제어기(그리드 API 와 저장소를 잇는다 — React 없이 시험한다) ─────────────────

/** 제어기가 쓰는 그리드 API. */
export type GridPersonalizeApi = Pick<GridApi, "getColumnState" | "applyColumnState" | "resetColumnState" | "isDestroyed">;

export interface GridPersonalizeContext {
  /** 켜져 있고 등록부를 차지했는가. false 면 이벤트를 저장하지 않는다. */
  active: boolean;
  userId: string;
  screenKey: string;
  gridId: string;
  sort: boolean;
  defaults: GridDefaultColumn[];
  locked: ReadonlySet<string>;
}

export interface GridPersonalizeControllerOptions {
  getApi: () => GridPersonalizeApi | null | undefined;
  getContext: () => GridPersonalizeContext;
  /** 저장값을 적용했거나 사용자가 바꿨으면 true — 자동 너비 맞춤이 저장 너비를 덮지 않게 한다. */
  setWidthLocked: (locked: boolean) => void;
  /** 기본값 복원 뒤 자동 너비 맞춤 흐름을 다시 살린다. */
  onReset?: () => void;
  debounceMs?: number;
  storage?: Storage | null;
}

export interface GridPersonalizeController {
  /** 저장값을 읽어 적용한다. 적용했으면 true. */
  restore(): boolean;
  /** 열 정의가 다시 들어온 뒤(newColumnsLoaded) 지금 개인 상태를 다시 적용한다. 개인 상태가 없으면 아무것도 하지 않는다. */
  reapply(): boolean;
  /** 그리드 이벤트 — 사용자 변경이면 지금 상태를 잡아 두고 debounce 뒤 저장한다. */
  handleEvent(e: GridPersonalizeEvent): void;
  /** 대기 중인 저장을 바로 쓴다. 그리드 API 없이도 된다(잡아 둔 값을 쓴다). */
  flush(): void;
  /** 상태를 적용하고 바로 저장한다(설정 창 확인). 잠긴 컬럼의 hide 는 무시한다. */
  apply(state: ColumnState[]): void;
  /** 저장값을 지우고 정의 기준 상태로 되돌린 뒤 자동 너비 맞춤을 다시 살린다. */
  reset(): void;
  /** 지금 적용 중인 개인 상태(없으면 null). */
  current(): GridPrefs | null;
}

export function createGridPersonalizeController(opts: GridPersonalizeControllerOptions): GridPersonalizeController {
  const debounceMs = opts.debounceMs ?? GRID_PERSONALIZE_SAVE_DEBOUNCE_MS;
  const store = (): Storage | null | undefined => opts.storage;
  /** 지금 개인 상태 — 복원한 값, 그 뒤 사용자 변경마다 갱신. 재주입 때 이것을 다시 적용한다. */
  let current: GridPrefs | null = null;
  let pending: { prefs: GridPrefs; userId: string; screenKey: string; gridId: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const liveApi = () => {
    const api = opts.getApi();
    return api && !api.isDestroyed() ? api : null;
  };
  const save = (userId: string, screenKey: string, gridId: string, prefs: GridPrefs) => {
    const s = store();
    if (s === undefined) saveGridPrefs(userId, screenKey, gridId, prefs);
    else saveGridPrefs(userId, screenKey, gridId, prefs, s);
  };
  const flush = () => {
    if (timer != null) clearTimeout(timer);
    timer = null;
    const p = pending;
    pending = null;
    if (p) save(p.userId, p.screenKey, p.gridId, p.prefs);
  };
  const applyCurrent = (): boolean => {
    const api = liveApi();
    const ctx = opts.getContext();
    if (!api || !current) return false;
    const ids = new Set(ctx.defaults.map((d) => d.colId));
    // 저장값에 지금 컬럼이 하나도 없으면(열 정의 전·모든 컬럼 이름이 바뀜) 적용하지 않는다 — 다음 재주입 때 다시 본다.
    if (!current.cols.some((c) => ids.has(c.colId))) return false;
    const state = mergeColumnState(ctx.defaults, current, { locked: ctx.locked, sort: ctx.sort });
    opts.setWidthLocked(true);
    api.applyColumnState({ state, applyOrder: true });
    return true;
  };
  const capture = (): GridPrefs | null => {
    const api = liveApi();
    const ctx = opts.getContext();
    if (!api || !ctx.active || !ctx.userId || !ctx.screenKey) return null;
    const prefs = toGridPrefs(api.getColumnState(), { sort: ctx.sort });
    current = prefs;
    opts.setWidthLocked(true);
    return prefs;
  };

  return {
    restore() {
      const ctx = opts.getContext();
      if (!ctx.active || !ctx.userId || !ctx.screenKey) return false;
      const s = store();
      const prefs = s === undefined ? loadGridPrefs(ctx.userId, ctx.screenKey, ctx.gridId) : loadGridPrefs(ctx.userId, ctx.screenKey, ctx.gridId, s);
      if (!prefs) return false;
      current = prefs;
      return applyCurrent();
    },
    reapply() {
      return applyCurrent();
    },
    handleEvent(e) {
      const ctx = opts.getContext();
      if (!isPersonalizeSaveEvent(e, ctx.sort)) return;
      const prefs = capture();
      if (!prefs) return;
      pending = { prefs, userId: ctx.userId, screenKey: ctx.screenKey, gridId: ctx.gridId };
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(flush, debounceMs);
    },
    flush,
    apply(state) {
      const api = liveApi();
      const ctx = opts.getContext();
      if (!api) return;
      const next = state.map((s) => {
        const out: ColumnState = { ...s };
        if (ctx.locked.has(s.colId)) delete out.hide;
        if (out.width != null && out.flex === undefined) out.flex = null;
        return out;
      });
      api.applyColumnState({ state: next, applyOrder: true });
      const prefs = capture();
      if (!prefs) return;
      if (timer != null) clearTimeout(timer);
      timer = null;
      pending = null;
      save(ctx.userId, ctx.screenKey, ctx.gridId, prefs);
    },
    reset() {
      const ctx = opts.getContext();
      if (timer != null) clearTimeout(timer);
      timer = null;
      pending = null;
      current = null;
      if (ctx.userId && ctx.screenKey) {
        const s = store();
        if (s === undefined) clearGridPrefs(ctx.userId, ctx.screenKey, ctx.gridId);
        else clearGridPrefs(ctx.userId, ctx.screenKey, ctx.gridId, s);
      }
      const api = liveApi();
      if (api) {
        // 정렬을 저장하지 않는 그리드(서버 페이징)는 정렬이 조회 조건이라 지금 정렬을 지키고 나머지만 정의 기준으로 되돌린다.
        const keepSort = ctx.sort ? null : api.getColumnState().filter((c) => c.sort != null);
        api.resetColumnState();
        if (keepSort && keepSort.length > 0) {
          api.applyColumnState({ state: keepSort.map((c) => ({ colId: c.colId, sort: c.sort, sortIndex: c.sortIndex })) });
        }
      }
      opts.setWidthLocked(false);
      opts.onReset?.();
    },
    current: () => current,
  };
}

// ── 훅 ─────────────────────────────────────────────────────────────────────────

/** 설정 창(C3)에 보일 컬럼 하나 — 지금 그리드 순서대로. */
export interface GridPersonalizeColumn {
  colId: string;
  /** 머리글 표시 이름(ag-grid getDisplayNameForColumn). */
  header: string;
  hide: boolean;
  pinned: GridPinned;
  width?: number;
  /** 숨길 수 없는 컬럼(선택 체크박스·행번호·rowKey·행 드래그·편집 가능 컬럼 등). 순서 이동은 된다. */
  locked: boolean;
  /** 설정 창에 보이지 않을 컬럼 — 선택 체크박스·행번호, 화면 정의에서 `hide: true` 인 내부 컬럼. */
  internal: boolean;
}

/** `useGridPersonalize` 결과 — C3 설정 창이 GridPanel 에서 부를 명령. */
export interface GridPersonalizeHandle {
  /** 개인화가 동작 중인가(켜짐·등록부 차지·사용자 확인·화면 키 있음). false 면 설정 창을 띄우지 않는다. */
  enabled: boolean;
  /** 숨김 잠금 colId. */
  locked: ReadonlySet<string>;
  /** 지금 컬럼 상태(그리드 순서). 그리드 준비 전이면 빈 배열. */
  getColumns(): GridPersonalizeColumn[];
  /**
   * 상태를 적용하고 바로 저장한다(source 가 api 여도 저장). 잠긴 컬럼의 hide 는 무시한다. 순서는 applyOrder 로 state 순서를 따른다.
   * ★`width` 를 담은 항목은 flex 를 끈다 — `getColumns()` 의 너비를 그대로 돌려보내면 fit 그리드가 고정 너비로 굳는다.
   * 사용자가 너비를 실제로 바꾼 컬럼만 `width` 를 넣는다.
   */
  apply(state: ColumnState[]): void;
  /** 저장값을 지우고 정의 기준 상태로 되돌린 뒤 자동 너비 맞춤을 다시 살린다. */
  reset(): void;
}

export interface UseGridPersonalizeOptions {
  getApi: () => GridApi | null | undefined;
  gridReady: boolean;
  gridId?: string;
  personalize?: GridPersonalize;
  /** 화면 열 정의(숨김 잠금 판정용). */
  columns: GridColumn[];
  /** AgDataGrid 가 만든 ag-grid 열 정의(기본 컬럼 순서·값). */
  columnDefs: ReadonlyArray<ColDef | ColGroupDef>;
  selectable: boolean;
  rowKey: string;
  rowDragField?: string;
  /** AgDataGrid 의 자동 너비 맞춤 가드. */
  widthLockRef: MutableRefObject<boolean>;
  /** 기본값 복원 뒤 자동 너비 맞춤 흐름을 다시 돌린다. */
  onReset: () => void;
}

// 번들러가 `process.env.NODE_ENV` 글자 그대로를 바꿔 넣으므로 이 모양을 지킨다(error-boundary.tsx 와 같다).
const isDev = () => process.env.NODE_ENV !== "production";

export function useGridPersonalize(opts: UseGridPersonalizeOptions): GridPersonalizeHandle {
  const { gridReady, gridId, personalize, columns, columnDefs, selectable, rowKey, rowDragField } = opts;
  const resolved = resolvePersonalize(personalize);
  const enabled = resolved.enabled;
  const userId = useCurrentUserId();
  const { pageId, tabId } = useTabPage();
  const screenKey = pageId || (typeof window !== "undefined" ? window.location.pathname : "");
  const gid = gridId || DEFAULT_GRID_ID;
  const regKey = gridPersonalizeRegistryKey(tabId, screenKey, gid);

  const defaults = useMemo(() => defaultColumnsFromDefs(columnDefs, selectable), [columnDefs, selectable]);
  const locked = useMemo(() => hideLockedColIds(columns, { rowKey, rowDragField }), [columns, rowKey, rowDragField]);

  const [claimed, setClaimed] = useState(false);
  const active = enabled && claimed;

  const ctxRef = useRef<GridPersonalizeContext>(null as unknown as GridPersonalizeContext);
  ctxRef.current = { active, userId, screenKey, gridId: gid, sort: resolved.sort, defaults, locked };
  const getApiRef = useRef(opts.getApi);
  getApiRef.current = opts.getApi;
  const onResetRef = useRef(opts.onReset);
  onResetRef.current = opts.onReset;
  const widthLockRef = opts.widthLockRef;

  const controllerRef = useRef<GridPersonalizeController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createGridPersonalizeController({
      getApi: () => getApiRef.current(),
      getContext: () => ctxRef.current,
      setWidthLocked: (v) => {
        widthLockRef.current = v;
      },
      onReset: () => onResetRef.current(),
    });
  }
  const controller = controllerRef.current;

  // 등록부 — 켜진 동안 키를 차지한다. 이미 주인이 있으면 끄고(개발 모드 경고) 기다렸다가 주인이 빠지면 이어받는다.
  // 꺼지거나 언마운트되면 대기 중인 저장을 흘려 보낸 뒤 키를 놓는다(이어받는 그리드가 최신 값을 읽게).
  const tokenRef = useRef<object>({});
  useEffect(() => {
    if (!enabled) {
      setClaimed(false);
      return;
    }
    const token = tokenRef.current;
    let owned = false;
    let warned = false;
    const tryClaim = () => {
      if (owned) return;
      if (claimGridPersonalizeKey(regKey, token)) {
        owned = true;
        setClaimed(true);
        return;
      }
      setClaimed(false);
      if (!warned && isDev()) {
        warned = true;
        console.warn(
          `[AgDataGrid] 같은 탭에 개인화 저장 키가 같은 그리드가 이미 있어 이 그리드의 컬럼 개인화를 끕니다 (gridId="${gid}"). ` +
            "한 화면에 그리드가 여럿이면 그리드마다 다른 gridId 를 주세요.",
        );
      }
    };
    tryClaim();
    const unsubscribe = owned ? () => {} : subscribeGridPersonalizeRegistry(tryClaim);
    return () => {
      unsubscribe();
      if (owned) {
        controller.flush();
        releaseGridPersonalizeKey(regKey, token);
      }
      setClaimed(false);
    };
  }, [enabled, regKey, gid, controller]);

  // 복원 — 켜진 구간마다(등록부를 차지한 구간마다) 사용자 확인 뒤 한 번.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!active) {
      restoredRef.current = false;
      return;
    }
    if (!gridReady || !userId || !screenKey || restoredRef.current) return;
    restoredRef.current = true;
    controller.restore();
  }, [active, gridReady, userId, screenKey, controller]);

  // 저장 이벤트·열 정의 재주입 — 켜져 있고 등록부를 차지한 동안만 듣는다.
  useEffect(() => {
    if (!gridReady || !active) return;
    const api = getApiRef.current();
    if (!api || api.isDestroyed()) return;
    const onSave = (e: GridPersonalizeEvent) => controller.handleEvent(e);
    // 열 정의가 다시 들어오면 ag-grid 가 colDef 의 width·hide·pinned·flex 와 정의 순서를 다시 적용한다(columnFactoryUtils
    // _updateColumnState, source gridOptionsChanged). 개인 상태가 있으면 그 뒤에 다시 적용한다. applyColumnState 는 newColumnsLoaded 를
    // 내지 않으므로 되먹임이 없다.
    const onNewColumns = (e: { source?: string }) => {
      if (e.source === "gridInitializing") return;
      controller.reapply();
    };
    for (const t of GRID_PERSONALIZE_SAVE_EVENTS) api.addEventListener(t, onSave);
    api.addEventListener("newColumnsLoaded", onNewColumns);
    return () => {
      if (api.isDestroyed()) return;
      for (const t of GRID_PERSONALIZE_SAVE_EVENTS) api.removeEventListener(t, onSave);
      api.removeEventListener("newColumnsLoaded", onNewColumns);
    };
  }, [gridReady, active, controller]);

  // 언마운트 — 대기 중인 저장을 흘려 보낸다(등록부 정리에서도 하지만 꺼진 그리드에도 남은 것이 없게).
  useEffect(() => () => controller.flush(), [controller]);

  const handleEnabled = active && !!userId && !!screenKey;
  return useMemo<GridPersonalizeHandle>(
    () => ({
      enabled: handleEnabled,
      locked,
      getColumns() {
        const api = getApiRef.current();
        if (!api || api.isDestroyed()) return [];
        const defHidden = new Set(ctxRef.current.defaults.filter((d) => d.hide === true).map((d) => d.colId));
        return api.getAllGridColumns().map((col) => {
          const colId = col.getColId();
          const state: GridPersonalizeColumn = {
            colId,
            header: api.getDisplayNameForColumn(col, "header"),
            hide: !col.isVisible(),
            pinned: toPinned(col.getPinned()) ?? null,
            locked: locked.has(colId),
            internal: colId === GRID_SELECTION_COL_ID || colId === "__rowNo" || defHidden.has(colId),
          };
          const w = col.getActualWidth();
          if (w > 0) state.width = w;
          return state;
        });
      },
      apply(state) {
        if (!ctxRef.current.active) return;
        controller.apply(state);
      },
      reset() {
        if (!ctxRef.current.active) return;
        controller.reset();
      },
    }),
    [handleEnabled, locked, controller],
  );
}
