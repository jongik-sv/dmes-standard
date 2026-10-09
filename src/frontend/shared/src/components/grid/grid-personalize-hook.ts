"use client";

/**
 * AgDataGrid 컬럼 개인화 — 복원·자동 저장·열 정의 재주입 뒤 재적용·키 충돌 등록부(C2).
 *
 * - 저장·병합 규칙은 `grid-personalize.ts`(순수 유틸)가 정한다. 여기는 그리드 API·React 수명과 잇는다.
 * - 저장 키: 확인된 사용자 ID(공유 저장소를 읽기만 한다 — `/api/auth/me` 를 부르지 않는다) · 화면(`useTabPage().pageId`, 없으면
 *   `location.pathname`) · gridId(없으면 "main"). 사용자 ID 가 비었으면 읽지도 쓰지도 않는다.
 * - 너비: 사용자가 머리글 경계를 끌어 바꾼 컬럼만 저장한다. 그 컬럼만 자동 너비·여백 분배에서 빠지고 나머지는 예전처럼 자동이다.
 * - `personalize` 는 마운트 뒤에 바뀔 수 있다(숨은 탭 패널은 false, 활성 탭만 켬). 켜진 구간마다 등록부에 올리고, 사용자 확인 뒤
 *   한 번 복원한다. 꺼지면 대기 중인 저장을 흘려 보내고 등록부에서 빠진다. 컬럼 상태는 되돌리지 않는다.
 * - 등록부: 같은 탭 안에서 같은 저장 키의 그리드가 이미 켜져 있으면 나중 그리드는 개인화를 끄고(개발 모드 경고) 기다린다.
 *   소유자가 빠지면 기다리던 그리드가 이어받는다(등록부 구독).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MutableRefObject } from "react";
import type { ColDef, ColGroupDef, Column, ColumnState, GridApi } from "ag-grid-community";

import { useTabPage } from "../../portal-shell/tab-page-context";
import { peekCurrentUser, subscribeCurrentUser } from "../../portal-shell/current-user";
import type { GridColumn } from "./grid-types";
import {
  DEFAULT_GRID_ID,
  GRID_SELECTION_COL_ID,
  clearGridPrefs,
  hideLockedColIds,
  loadGridAutoSave,
  loadGridPrefs,
  mergeColumnState,
  resolveGridScreenKey,
  resolvePersonalize,
  saveGridAutoSave,
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
  /** columnResized 에서 사용자가 끈 컬럼(events.d.ts ColumnEvent.columns). 이 컬럼만 너비를 저장한다. */
  columns?: ReadonlyArray<{ getColId(): string }> | null;
}

/** 이 이벤트가 사용자 변경이라 저장할 것인가. 크기 바꾸기·이동은 끌기를 마친 마지막 이벤트(finished)만 본다. */
export function isPersonalizeSaveEvent(e: GridPersonalizeEvent, sortEnabled: boolean): boolean {
  if (!e.source || !GRID_PERSONALIZE_UI_SOURCES.has(e.source)) return false;
  if (e.finished === false) return false;
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
  const walk = (list: ReadonlyArray<ColDef | ColGroupDef>, path: readonly string[]) => {
    for (const d of list) {
      if ("children" in d && Array.isArray(d.children)) {
        const gid = d.groupId;
        walk(d.children, gid ? [...path, gid] : path);
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
      if (path.length > 0) col.groupPath = path;
      out.push(col);
    }
  };
  walk(defs, []);
  return out;
}

// ── 열 그룹 경로 ────────────────────────────────────────────────────────────────

/** 잎 컬럼 → 열 그룹 경로(바깥 → 안쪽). `getOriginalParent`(정의 트리의 부모)를 따라 오르며 패딩 그룹은 건너뛴다. */
function groupPathOf(col: Column): GridPersonalizeGroup[] {
  const path: GridPersonalizeGroup[] = [];
  let g = col.getOriginalParent();
  while (g) {
    if (!g.isPadding()) {
      const id = g.getGroupId();
      const name = g.getColGroupDef()?.headerName;
      path.unshift({ id, header: typeof name === "string" && name !== "" ? name : id });
    }
    g = g.getOriginalParent();
  }
  return path;
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
  /** 자동 저장 스위치. false 면 변경을 저장하지 않고 화면에만 둔다(`saveNow` 로 직접 저장). */
  autoSave: boolean;
  defaults: GridDefaultColumn[];
  /** 숨김 잠금 colId. */
  locked: ReadonlySet<string>;
}

export interface GridPersonalizeControllerOptions {
  getApi: () => GridPersonalizeApi | null | undefined;
  getContext: () => GridPersonalizeContext;
  /**
   * 저장 너비가 있는 colId 집합이 바뀔 때 — 자동 너비 맞춤은 이 컬럼만 건드리지 않는다(나머지는 예전처럼 자동).
   * 빈 집합이면 자동 너비 흐름이 개인화 전과 같다.
   */
  setSizedColumns: (colIds: ReadonlySet<string>) => void;
  /** 저장값을 적용한 뒤(저장 너비가 있을 때) — 나머지 컬럼의 자동 너비·여백 분배를 다시 맞춘다. */
  onRestored?: () => void;
  /** 기본값 복원 뒤 자동 너비 맞춤 흐름을 다시 살린다. */
  onReset?: () => void;
  debounceMs?: number;
  storage?: Storage | null;
}

export interface GridPersonalizeController {
  /** 저장값을 읽어 적용한다(켜진 구간마다 한 번). 적용했으면 true. 저장값이 없으면 저장 너비 집합을 비운다. */
  restore(): boolean;
  /** 열 정의가 다시 들어온 뒤(newColumnsLoaded) 지금 개인 상태를 다시 적용한다. 개인 상태가 없으면 아무것도 하지 않는다. */
  reapply(): boolean;
  /**
   * 그리드 이벤트 — 사용자 변경이면 지금 상태를 잡아 두고 debounce 뒤 저장한다.
   * 자동 저장이 꺼져 있으면 잡아만 두고(재주입 때 유지) 저장하지 않는다.
   */
  handleEvent(e: GridPersonalizeEvent): void;
  /** 대기 중인 저장을 바로 쓴다. 그리드 API 없이도 된다(잡아 둔 값을 쓴다). */
  flush(): void;
  /**
   * 상태를 적용하고 바로 저장한다(설정 창 확인). 잠긴 컬럼의 hide 는 무시한다. `width` 를 준 컬럼만 너비를 저장한다.
   * 자동 저장이 꺼져 있으면 적용만 하고 저장하지 않는다.
   */
  apply(state: ColumnState[]): void;
  /** 지금 그리드 상태를 바로 저장한다(자동 저장이 꺼진 그리드의 수동 저장). 대기 중인 저장·저장 안 한 변경 표시를 비운다. */
  saveNow(): void;
  /**
   * 자동 저장 스위치가 `next` 로 바뀌었음을 알린다(바뀌기 전 값은 `getContext().autoSave`).
   * 켬 → 끔: 켜져 있던 동안의 대기 저장을 먼저 쓴다. 끔 → 켬: 저장 안 한 변경이 있으면 지금 모습을 저장한다.
   */
  setAutoSave(next: boolean): void;
  /** 저장값을 지우고 정의 기준 상태로 되돌린 뒤 자동 너비 맞춤을 다시 살린다. 자동 저장 스위치 값은 건드리지 않는다. */
  reset(): void;
  /** 지금 적용 중인 개인 상태(없으면 null). */
  current(): GridPrefs | null;
}

const EMPTY_IDS: ReadonlySet<string> = new Set();

/** 저장값에서 너비가 있는 colId. */
function sizedIdsOf(prefs: GridPrefs | null): Set<string> {
  return new Set((prefs?.cols ?? []).filter((c) => c.width != null).map((c) => c.colId));
}

export function createGridPersonalizeController(opts: GridPersonalizeControllerOptions): GridPersonalizeController {
  const debounceMs = opts.debounceMs ?? GRID_PERSONALIZE_SAVE_DEBOUNCE_MS;
  const store = (): Storage | null | undefined => opts.storage;
  /** 지금 개인 상태 — 복원한 값, 그 뒤 사용자 변경마다 갱신. 재주입 때 이것을 다시 적용한다. */
  let current: GridPrefs | null = null;
  let pending: { prefs: GridPrefs; userId: string; screenKey: string; gridId: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 자동 저장이 꺼진 동안 저장하지 않고 둔 변경이 있는 저장 키(`userId\0screenKey\0gridId`). 없으면 null. */
  let dirtyKey: string | null = null;
  const keyOf = (c: { userId: string; screenKey: string; gridId: string }) => `${c.userId}\u0000${c.screenKey}\u0000${c.gridId}`;
  const isDirty = () => dirtyKey !== null && dirtyKey === keyOf(opts.getContext());

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
  /** 저장 너비 집합을 지금 컬럼에 있는 것으로 알린다. */
  const publishSized = (ids: ReadonlySet<string>) => {
    const known = new Set(opts.getContext().defaults.map((d) => d.colId));
    const out = new Set([...ids].filter((id) => known.has(id)));
    opts.setSizedColumns(out.size > 0 ? out : EMPTY_IDS);
    return out.size > 0;
  };
  const applyCurrent = (): boolean => {
    const api = liveApi();
    const ctx = opts.getContext();
    if (!api || !current) return false;
    const ids = new Set(ctx.defaults.map((d) => d.colId));
    // 저장값에 지금 컬럼이 하나도 없으면(열 정의 전·모든 컬럼 이름이 바뀜) 적용하지 않는다 — 다음 재주입 때 다시 본다.
    if (!current.cols.some((c) => ids.has(c.colId))) return false;
    // 저장 너비가 없는 컬럼의 너비는 건드리지 않는다(기본 컬럼 너비를 빼고 병합) — 자동 너비·여백 분배 결과를 지킨다.
    const defaults = ctx.defaults.map(({ width: _w, ...rest }) => rest);
    const state = mergeColumnState(defaults, current, { locked: ctx.locked, sort: ctx.sort });
    publishSized(sizedIdsOf(current));
    api.applyColumnState({ state, applyOrder: true });
    return true;
  };
  /**
   * 지금 상태를 저장값으로 잡는다. 너비는 `sized`(이미 저장된 너비 + 이번에 사용자가 끌어 바꾼 컬럼)만 담는다 — 정렬·이동·숨김·고정만으로
   * 다른 컬럼 너비가 굳지 않게.
   */
  const capture = (resized: readonly string[]): GridPrefs | null => {
    const api = liveApi();
    const ctx = opts.getContext();
    if (!api || !ctx.active || !ctx.userId || !ctx.screenKey) return null;
    const sized = sizedIdsOf(current);
    for (const id of resized) sized.add(id);
    const prefs = toGridPrefs(api.getColumnState(), { sort: ctx.sort });
    prefs.cols = prefs.cols.map((c) => {
      if (sized.has(c.colId) || c.width == null) return c;
      const { width: _w, ...rest } = c;
      return rest;
    });
    current = prefs;
    publishSized(sizedIdsOf(prefs));
    return prefs;
  };

  /** 지금 그리드 상태를 잡아 바로 저장한다. 너비는 이미 저장된 너비와 이번 세션에 사용자가 끌어 바꾼 컬럼만 담긴다(`capture` 규칙). */
  const saveNow = () => {
    const ctx = opts.getContext();
    const prefs = capture([]);
    if (!prefs) return;
    if (timer != null) clearTimeout(timer);
    timer = null;
    pending = null;
    dirtyKey = null;
    save(ctx.userId, ctx.screenKey, ctx.gridId, prefs);
  };

  return {
    restore() {
      const ctx = opts.getContext();
      if (!ctx.active || !ctx.userId || !ctx.screenKey) return false;
      const s = store();
      // 자동 저장을 끈 채 바꾼 저장 안 한 상태가 있으면(숨은 탭이 꺼졌다 켜질 때) 저장값으로 되돌리지 않고 그 상태를 다시 적용한다.
      const keepUnsaved = isDirty() && current;
      // 저장값을 읽는 갈래에서는 다른 키의 저장 안 한 표시를 비운다 — `current` 가 이 키의 저장값으로 덮이므로 그 표시를 남기면 나중에 되돌아왔을 때 남의 상태를 저장한다.
      if (!keepUnsaved) dirtyKey = null;
      const prefs = keepUnsaved
        ? current
        : s === undefined
          ? loadGridPrefs(ctx.userId, ctx.screenKey, ctx.gridId)
          : loadGridPrefs(ctx.userId, ctx.screenKey, ctx.gridId, s);
      current = prefs;
      if (!prefs) {
        // 끈 동안 다른 그리드가 기본값 복원을 했을 수 있다 — 저장값 기준으로 다시 계산한다.
        opts.setSizedColumns(EMPTY_IDS);
        return false;
      }
      const ok = applyCurrent();
      if (ok && sizedIdsOf(prefs).size > 0) opts.onRestored?.();
      return ok;
    },
    reapply() {
      return applyCurrent();
    },
    handleEvent(e) {
      const ctx = opts.getContext();
      if (!isPersonalizeSaveEvent(e, ctx.sort)) return;
      const resized = e.type === "columnResized" ? (e.columns ?? []).map((c) => c.getColId()) : [];
      const prefs = capture(resized);
      if (!prefs) return;
      if (!ctx.autoSave) {
        dirtyKey = keyOf(ctx);
        return;
      }
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
      const prefs = capture(state.filter((s) => s.width != null).map((s) => s.colId));
      if (!prefs) return;
      if (timer != null) clearTimeout(timer);
      timer = null;
      pending = null;
      if (!ctx.autoSave) {
        dirtyKey = keyOf(ctx);
        return;
      }
      save(ctx.userId, ctx.screenKey, ctx.gridId, prefs);
    },
    saveNow,
    setAutoSave(next) {
      if (opts.getContext().autoSave === next) return;
      if (!next) flush();
      else if (isDirty()) saveNow();
    },
    reset() {
      const ctx = opts.getContext();
      if (timer != null) clearTimeout(timer);
      timer = null;
      pending = null;
      dirtyKey = null;
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
      opts.setSizedColumns(EMPTY_IDS);
      opts.onReset?.();
    },
    current: () => current,
  };
}

// ── 훅 ─────────────────────────────────────────────────────────────────────────

/** 열 그룹 하나 — 설정 창 제목 줄에 쓴다. */
export interface GridPersonalizeGroup {
  /** 그룹 id(GridColumn.key). */
  id: string;
  /** 그룹 머리글 이름(없으면 id). */
  header: string;
}

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
  /**
   * 이 잎을 품은 가장 가까운 열 그룹(ag-grid 원래 부모 그룹 — 패딩 그룹은 건너뜀). 그룹이 없으면 생략.
   * 설정 창은 순서 이동을 같은 그룹 안으로만 허용한다.
   */
  group?: GridPersonalizeGroup;
  /** 그룹 경로(바깥 → 안쪽, 마지막이 `group`). 중첩 그룹의 제목 줄을 그린다. 그룹이 없으면 생략. */
  groupPath?: GridPersonalizeGroup[];
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
  /** 저장값을 지우고 정의 기준 상태로 되돌린 뒤 자동 너비 맞춤을 다시 살린다. 자동 저장 스위치 값은 그대로 둔다. */
  reset(): void;
  /**
   * 자동 저장 스위치 — 사용자가 정한 값(없으면 `personalize.autoSave`, 그것도 없으면 켬). false 면 순서·너비·표시·고정·정렬을 화면에만
   * 적용하고 저장하지 않는다(새로 고치면 마지막 저장 상태로 돌아간다). 개인화가 동작 중이 아니면 의미가 없다.
   */
  autoSave: boolean;
  /**
   * 스위치를 바꾼다. 값은 옆 키(`dmes:grid-opts:v1:…`)에 저장한다. 켬 → 끔이면 대기 중인 저장을 먼저 쓰고,
   * 끔 → 켬이면 저장 안 한 변경이 있을 때 지금 모습을 저장한다. 개인화가 동작 중이 아니면 아무것도 하지 않는다.
   */
  setAutoSave(next: boolean): void;
  /** 지금 그리드 상태를 바로 저장한다(자동 저장이 꺼진 그리드의 수동 저장). 개인화가 동작 중이 아니면 아무것도 하지 않는다. */
  saveNow(): void;
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
  /** AgDataGrid 의 자동 너비 맞춤 가드 — 저장 너비가 있는 colId. 비면 자동 너비 흐름이 개인화 전과 같다. */
  sizedColumnsRef: MutableRefObject<ReadonlySet<string>>;
  /** 저장 너비를 적용한 뒤 나머지 컬럼의 자동 너비·여백 분배를 다시 돌린다. */
  onRestored: () => void;
  /** 기본값 복원 뒤 자동 너비 맞춤 흐름을 다시 돌린다. */
  onReset: () => void;
}

const noopUnsubscribe = () => {};
const emptyUserId = () => "";

/**
 * 확인된 사용자 ID 를 읽기만 한다 — `/api/auth/me` 를 부르지 않는다. 포털 부팅이 사용자 확인을 하므로 값은 구독 알림으로 온다.
 * 개인화가 꺼져 있으면 구독도 하지 않는다(useSyncExternalStore 는 조건부로 부를 수 없어 subscribe 가 아무것도 하지 않는다).
 */
export function useConfirmedUserId(enabled: boolean): string {
  const subscribe = useCallback(
    (onChange: () => void) => (enabled ? subscribeCurrentUser(() => onChange()) : noopUnsubscribe),
    [enabled],
  );
  const getSnapshot = useCallback(() => (enabled ? (peekCurrentUser()?.id ?? "") : ""), [enabled]);
  return useSyncExternalStore(subscribe, getSnapshot, emptyUserId);
}

// 번들러가 `process.env.NODE_ENV` 글자 그대로를 바꿔 넣으므로 이 모양을 지킨다(error-boundary.tsx 와 같다).
const isDev = () => process.env.NODE_ENV !== "production";

const NO_DEFAULT_COLUMNS: GridDefaultColumn[] = [];
const NO_LOCKED_COLUMNS: ReadonlySet<string> = new Set<string>();

export function useGridPersonalize(opts: UseGridPersonalizeOptions): GridPersonalizeHandle {
  const { gridReady, gridId, personalize, columns, columnDefs, selectable, rowKey, rowDragField } = opts;
  const resolved = resolvePersonalize(personalize);
  const enabled = resolved.enabled;
  const userId = useConfirmedUserId(enabled);
  const { pageId, tabId } = useTabPage();
  const screenKey = resolveGridScreenKey(pageId);
  const gid = gridId || DEFAULT_GRID_ID;
  const regKey = gridPersonalizeRegistryKey(tabId, screenKey, gid);

  // 개인화를 쓰지 않는 그리드(대부분)는 열 정의를 훑는 계산을 건너뛴다 — 꺼진 동안은 이 값을 읽는 경로가 없다(저장·복원·창 열기 모두 enabled 가 먼저 막는다).
  const defaults = useMemo(() => (enabled ? defaultColumnsFromDefs(columnDefs, selectable) : NO_DEFAULT_COLUMNS), [enabled, columnDefs, selectable]);
  const locked = useMemo(() => (enabled ? hideLockedColIds(columns, { rowKey, rowDragField }) : NO_LOCKED_COLUMNS), [enabled, columns, rowKey, rowDragField]);

  /**
   * 등록부를 차지했는가. 차지 결과는 ref 에 둔다 — 마운트 직후 바로 차지하면 다시 렌더하지 않는다(효과들은 같은 커밋에서 이 ref 를 읽는다).
   * 상태(waiting)는 차지에 실패해 기다리는 동안과, 기다리다 이어받을 때만 바꾼다.
   */
  const claimedRef = useRef(false);
  const [waiting, setWaitingState] = useState(false);
  /**
   * 그리드가 이미 준비된 뒤에 차지했을 때(꺼짐 → 켬·기다리다 이어받음) 한 번 올려 다시 렌더한다 — 그래야 handle.enabled 가 true 로 그려진다.
   * 마운트 때는 그리드가 아직 준비 전이라 올리지 않는다(준비되며 setGridReady 가 다시 렌더한다 — 렌더 횟수를 늘리지 않는다).
   */
  const [, setClaimTick] = useState(0);
  const gridReadyRef = useRef(gridReady);
  gridReadyRef.current = gridReady;
  const waitingRef = useRef(false);
  const setWaiting = (v: boolean) => {
    if (waitingRef.current === v) return;
    waitingRef.current = v;
    setWaitingState(v);
  };

  // 자동 저장 스위치 — 저장값(옆 키)은 렌더 중에 읽는다. 효과로 읽어 setState 하면 사용자 ID 가 들어올 때마다 렌더가 하나 늘고, 첫 복원 직후의
  // 사용자 변경이 옛 값으로 처리된다. 사용자가 이번 마운트에서 토글한 값만 상태에 두고, 저장 키가 바뀌면 그 값은 버린다.
  // `waiting` 이 deps 에 있는 것은 등록부를 이어받을 때(대기 → 차지) 먼저 있던 그리드가 바꾼 값을 다시 읽기 위해서다(그 전환이 이미 렌더를 일으킨다).
  const savedAutoSave = useMemo(
    () => (enabled ? loadGridAutoSave(userId, screenKey, gid) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, userId, screenKey, gid, waiting],
  );
  const optsKey = `${userId}\u0000${screenKey}\u0000${gid}`;
  const [toggled, setToggled] = useState<{ key: string; value: boolean } | null>(null);
  const autoSave = toggled && toggled.key === optsKey ? toggled.value : (savedAutoSave ?? resolved.autoSave);

  const ctxRef = useRef({ enabled, userId, screenKey, gridId: gid, sort: resolved.sort, autoSave, defaults, locked });
  ctxRef.current = { enabled, userId, screenKey, gridId: gid, sort: resolved.sort, autoSave, defaults, locked };
  const getApiRef = useRef(opts.getApi);
  getApiRef.current = opts.getApi;
  const onResetRef = useRef(opts.onReset);
  onResetRef.current = opts.onReset;
  const onRestoredRef = useRef(opts.onRestored);
  onRestoredRef.current = opts.onRestored;
  const sizedColumnsRef = opts.sizedColumnsRef;

  const controllerRef = useRef<GridPersonalizeController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createGridPersonalizeController({
      getApi: () => getApiRef.current(),
      getContext: () => ({ ...ctxRef.current, active: ctxRef.current.enabled && claimedRef.current }),
      setSizedColumns: (ids) => {
        sizedColumnsRef.current = ids;
      },
      onRestored: () => onRestoredRef.current(),
      onReset: () => onResetRef.current(),
    });
  }
  const controller = controllerRef.current;

  // 등록부 — 켜진 동안 키를 차지한다. 이미 주인이 있으면 끄고(개발 모드 경고) 기다렸다가 주인이 빠지면 이어받는다.
  // 꺼지거나 언마운트되면 대기 중인 저장을 흘려 보낸 뒤 키를 놓는다(이어받는 그리드가 최신 값을 읽게).
  const tokenRef = useRef<object>({});
  useEffect(() => {
    if (!enabled) return;
    const token = tokenRef.current;
    let warned = false;
    let unsubscribe = noopUnsubscribe;
    const tryClaim = (initial: boolean) => {
      if (claimedRef.current) return;
      if (claimGridPersonalizeKey(regKey, token)) {
        claimedRef.current = true;
        unsubscribe();
        unsubscribe = noopUnsubscribe;
        if (waitingRef.current) setWaiting(false);
        else if (gridReadyRef.current) setClaimTick((t) => t + 1);
        return;
      }
      setWaiting(true);
      if (!warned && isDev()) {
        warned = true;
        console.warn(
          `[AgDataGrid] 같은 탭에 개인화 저장 키가 같은 그리드가 이미 있어 이 그리드의 컬럼 개인화를 끕니다 (gridId="${gid}"). ` +
            "한 화면에 그리드가 여럿이면 그리드마다 다른 gridId 를 주세요.",
        );
      }
    };
    tryClaim(true);
    if (!claimedRef.current) unsubscribe = subscribeGridPersonalizeRegistry(() => tryClaim(false));
    return () => {
      unsubscribe();
      if (claimedRef.current) {
        claimedRef.current = false;
        controller.flush();
        releaseGridPersonalizeKey(regKey, token);
      }
    };
  }, [enabled, regKey, gid, controller]);

  // 복원 — 켜진 구간마다(등록부를 차지한 구간마다) 사용자 확인 뒤 한 번. 등록부 효과보다 뒤에 둬야 같은 커밋에서 차지 결과를 읽는다.
  const restoredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !claimedRef.current) {
      restoredKeyRef.current = null;
      return;
    }
    if (!gridReady || !userId || !screenKey || restoredKeyRef.current === regKey) return;
    restoredKeyRef.current = regKey;
    controller.restore();
  }, [enabled, waiting, regKey, gridReady, userId, screenKey, controller]);

  // 저장 이벤트·열 정의 재주입 — 켜져 있고 등록부를 차지한 동안만 듣는다.
  useEffect(() => {
    if (!gridReady || !enabled || !claimedRef.current) return;
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
  }, [gridReady, enabled, waiting, regKey, controller]);

  // 언마운트 — 대기 중인 저장을 흘려 보낸다(등록부 정리에서도 하지만 꺼진 그리드에도 남은 것이 없게).
  useEffect(() => () => controller.flush(), [controller]);

  const active = enabled && claimedRef.current && !waiting;
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
          const groupPath = groupPathOf(col);
          if (groupPath.length > 0) {
            state.group = groupPath[groupPath.length - 1];
            state.groupPath = groupPath;
          }
          const w = col.getActualWidth();
          if (w > 0) state.width = w;
          return state;
        });
      },
      apply(state) {
        if (!ctxRef.current.enabled || !claimedRef.current) return;
        controller.apply(state);
      },
      reset() {
        if (!ctxRef.current.enabled || !claimedRef.current) return;
        controller.reset();
      },
      autoSave,
      setAutoSave(next) {
        const c = ctxRef.current;
        if (!c.enabled || !claimedRef.current || !c.userId || !c.screenKey || c.autoSave === next) return;
        saveGridAutoSave(c.userId, c.screenKey, c.gridId, next);
        controller.setAutoSave(next);
        // 다음 렌더 전에 오는 이벤트도 새 값을 보게 한다(렌더가 ctxRef 를 같은 값으로 다시 채운다).
        ctxRef.current = { ...c, autoSave: next };
        setToggled({ key: `${c.userId}\u0000${c.screenKey}\u0000${c.gridId}`, value: next });
      },
      saveNow() {
        if (!ctxRef.current.enabled || !claimedRef.current) return;
        controller.saveNow();
      },
    }),
    [handleEnabled, locked, controller, autoSave],
  );
}
