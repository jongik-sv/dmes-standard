/**
 * AgDataGrid 컬럼 개인화 저장·병합 (순수 유틸).
 *
 * - 저장: localStorage `dmes:grid:v1:{userId}:{screenKey}:{gridId}` = GridPrefs.
 *   `cols` 배열 순서가 컬럼 순서다. 컬럼 구성 해시는 키에 넣지 않고, 적용할 때 병합한다
 *   (아는 colId 는 저장값, 새 컬럼은 기본 위치, 없어진 컬럼은 버림).
 * - 자동 저장 스위치 값: 옆 키 `dmes:grid-opts:v1:{userId}:{screenKey}:{gridId}` = `{"autoSave": boolean}`. 없으면 개발자 기본값.
 * - userId 가 "" 이면 읽지도 쓰지도 않는다(사용자 확인 전).
 * - 모든 저장소 접근은 try/catch. 용량 초과면 같은 사용자의 오래된 그리드 키부터 지우고 다시 시도하고,
 *   그래도 안 되면 조용히 포기한다(개인화가 안 될 뿐 그리드는 동작).
 * - 숨김 잠금: 선택 체크박스·행번호·rowKey·행 드래그 컬럼은 늘 잠금, 편집 가능한 컬럼은 `hideable: true` 가 아니면 잠금.
 *   잠긴 컬럼도 순서 이동은 된다.
 */
import type { ColumnState } from "ag-grid-community";

import type { GridColumn } from "./grid-types";

/** AgDataGrid `personalize` 객체형 — 일부 항목만 끈다. */
export interface GridPersonalizeOptions {
  /** false 면 정렬 상태를 저장·복원하지 않는다(서버 페이징 그리드). 기본 true. */
  sort?: boolean;
  /**
   * 사용자가 자동 저장 스위치를 아직 정하지 않은 그리드의 기본값(개발자 기본값). 기본 true.
   * 사용자가 스위치를 한 번 바꾸면 그 값(옆 키 `dmes:grid-opts:v1:…`)이 이 값을 이긴다.
   */
  autoSave?: boolean;
}

/** AgDataGrid `personalize` prop. 생략·true = 켬, false = 끔, 객체 = 켜고 일부 항목만 조정. */
export type GridPersonalize = boolean | GridPersonalizeOptions;

export interface ResolvedGridPersonalize {
  enabled: boolean;
  sort: boolean;
  /** 개발자 기본값 — 사용자가 정한 값이 없을 때 쓴다. */
  autoSave: boolean;
}

export function resolvePersonalize(personalize: GridPersonalize | undefined): ResolvedGridPersonalize {
  if (personalize === false) return { enabled: false, sort: false, autoSave: false };
  if (personalize === true || personalize == null) return { enabled: true, sort: true, autoSave: true };
  return { enabled: true, sort: personalize.sort !== false, autoSave: personalize.autoSave !== false };
}

export const GRID_PREF_KEY_PREFIX = "dmes:grid:v1:";
/**
 * 그리드별 옵션(자동 저장 스위치 값)의 키 접두어. 컬럼 저장값(`dmes:grid:v1:`)과 접두어를 달리해 둔다 — 「초기화」가 컬럼 저장값을 지워도
 * 스위치 값이 남고, 용량 초과 정리(`oldestUserGridKeys`)가 이 키를 지우지 않는다.
 */
export const GRID_OPTS_KEY_PREFIX = "dmes:grid-opts:v1:";
/** `gridId` 를 주지 않은 그리드의 이름. */
export const DEFAULT_GRID_ID = "main";
/** ag-grid 33 이 `rowSelection` 체크박스로 만드는 컬럼의 colId. */
export const GRID_SELECTION_COL_ID = "ag-Grid-SelectionColumn";
/** AgDataGrid `rowNumber` 컬럼의 colId(AgDataGrid.ROW_NUMBER_COL_ID 와 같다 — 순환 import 를 피하려고 값을 둔다). */
const ROW_NUMBER_COL_ID = "__rowNo";

/** 저장 키의 화면 부분 — 포털 탭의 pageId, 없으면 `location.pathname`. 개인화와 걸러 보기 켜짐 기억이 같은 규칙을 쓴다. */
export function resolveGridScreenKey(pageId: string | undefined): string {
  return pageId || (typeof window !== "undefined" ? window.location.pathname : "");
}

export function gridPrefKey(userId: string, screenKey: string, gridId: string = DEFAULT_GRID_ID): string {
  return `${GRID_PREF_KEY_PREFIX}${userId}:${screenKey}:${gridId || DEFAULT_GRID_ID}`;
}

export function gridOptsKey(userId: string, screenKey: string, gridId: string = DEFAULT_GRID_ID): string {
  return `${GRID_OPTS_KEY_PREFIX}${userId}:${screenKey}:${gridId || DEFAULT_GRID_ID}`;
}

export type GridPinned = "left" | "right" | null;

export interface GridPrefColumn {
  colId: string;
  width?: number;
  hide?: boolean;
  pinned?: GridPinned;
}

export interface GridPrefSort {
  colId: string;
  sort: "asc" | "desc";
}

export interface GridPrefs {
  v: 1;
  savedAt: number;
  /** 배열 순서 = 컬럼 순서. */
  cols: GridPrefColumn[];
  /** 정렬 순서대로(첫 항목이 1순위). 정렬 저장을 끈 그리드는 없다. */
  sort?: GridPrefSort[];
}

/** 저장소에서 읽은 값을 검사·정리한다. 모양이 틀리면 null. */
export function parseGridPrefs(raw: unknown): GridPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || !Array.isArray(r.cols)) return null;
  const seen = new Set<string>();
  const cols: GridPrefColumn[] = [];
  for (const item of r.cols) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.colId !== "string" || c.colId === "" || seen.has(c.colId)) continue;
    seen.add(c.colId);
    const col: GridPrefColumn = { colId: c.colId };
    if (typeof c.width === "number" && Number.isFinite(c.width) && c.width > 0) col.width = Math.round(c.width);
    if (typeof c.hide === "boolean") col.hide = c.hide;
    if ("pinned" in c) col.pinned = c.pinned === "left" || c.pinned === "right" ? c.pinned : null;
    cols.push(col);
  }
  const prefs: GridPrefs = {
    v: 1,
    savedAt: typeof r.savedAt === "number" && Number.isFinite(r.savedAt) ? r.savedAt : 0,
    cols,
  };
  if (Array.isArray(r.sort)) {
    const sortSeen = new Set<string>();
    const sort: GridPrefSort[] = [];
    for (const item of r.sort) {
      const s = item as Record<string, unknown> | null;
      if (!s || typeof s.colId !== "string" || s.colId === "" || sortSeen.has(s.colId)) continue;
      if (s.sort !== "asc" && s.sort !== "desc") continue;
      sortSeen.add(s.colId);
      sort.push({ colId: s.colId, sort: s.sort });
    }
    prefs.sort = sort;
  }
  return prefs;
}

function defaultStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadGridPrefs(
  userId: string,
  screenKey: string,
  gridId: string = DEFAULT_GRID_ID,
  store: Storage | null = defaultStorage(),
): GridPrefs | null {
  if (!userId || !screenKey || !store) return null;
  try {
    const raw = store.getItem(gridPrefKey(userId, screenKey, gridId));
    return raw ? parseGridPrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** 사용자가 정한 자동 저장 스위치 값. 없거나(옛 저장값 포함) 깨졌으면 null — 호출자가 개발자 기본값을 쓴다. */
export function loadGridAutoSave(
  userId: string,
  screenKey: string,
  gridId: string = DEFAULT_GRID_ID,
  store: Storage | null = defaultStorage(),
): boolean | null {
  if (!userId || !screenKey || !store) return null;
  try {
    const raw = store.getItem(gridOptsKey(userId, screenKey, gridId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const v = (parsed as Record<string, unknown>).autoSave;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

/** 옆 키(`dmes:grid-opts:v1:`)의 저장 객체를 읽는다. 없거나 깨졌으면 빈 객체 — 다른 옵션을 지우지 않고 한 값만 바꾸려고 쓴다. */
function readOpts(store: Storage, key: string): Record<string, unknown> {
  try {
    const raw = store.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? { ...(parsed as Record<string, unknown>) } : {};
  } catch {
    return {};
  }
}

/** 자동 저장 스위치 값을 저장한다(같은 객체의 다른 옵션 — `filterOpen` — 은 그대로 둔다). 성공하면 true. 용량 초과여도 다른 키를 지우지 않는다(값 하나라 조용히 포기). */
export function saveGridAutoSave(
  userId: string,
  screenKey: string,
  gridId: string,
  autoSave: boolean,
  store: Storage | null = defaultStorage(),
): boolean {
  if (!userId || !screenKey || !store) return false;
  const key = gridOptsKey(userId, screenKey, gridId);
  return trySet(store, key, JSON.stringify({ ...readOpts(store, key), autoSave })) === null;
}

/**
 * 그리드 걸러 보기(「필터 창 보기」)를 켠 채로 두었는가를 적는 키 접두어 — 개인화가 없는 그리드용. 컬럼 저장값(`dmes:grid:v1:`)과 옆 키(`dmes:grid-opts:v1:`)와
 * 접두어를 달리해, 용량 초과 정리(`oldestUserGridKeys`)가 지우지 않고 컬럼 「초기화」도 건드리지 않는다.
 */
export const GRID_FILTER_KEY_PREFIX = "dmes:grid-filter:v1:";

export function gridFilterKey(userId: string, screenKey: string, gridId: string = DEFAULT_GRID_ID): string {
  return `${GRID_FILTER_KEY_PREFIX}${userId}:${screenKey}:${gridId || DEFAULT_GRID_ID}`;
}

/**
 * 사용자가 켜 둔 걸러 보기 상태. 없거나 깨졌으면 null(꺼짐으로 본다). 조건값·검색어는 기억하지 않고 켜짐만 기억한다.
 * - 개인화가 켜진 그리드(`withPersonalize`)는 옆 키 객체의 `filterOpen`, 아닌 그리드는 `gridFilterKey` 의 `{ filterOpen }` 이다.
 * - 저장소가 막혀 있거나(읽기 예외) 사용자·화면 키가 비면 null.
 */
export function loadGridFilterOpen(
  userId: string,
  screenKey: string,
  gridId: string = DEFAULT_GRID_ID,
  withPersonalize = false,
  store: Storage | null = defaultStorage(),
): boolean | null {
  if (!userId || !screenKey || !store) return null;
  try {
    const raw = store.getItem(withPersonalize ? gridOptsKey(userId, screenKey, gridId) : gridFilterKey(userId, screenKey, gridId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const v = (parsed as Record<string, unknown>).filterOpen;
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

/**
 * 걸러 보기 켜짐을 적는다. 성공하면 true. 개인화가 켜진 그리드는 자동 설정 저장 스위치가 꺼져 있어도 적는다(스위치 값과 같은 성격의 옵션이라 늘 저장).
 * 값 하나라 용량 초과면 조용히 포기한다(다른 키를 지우지 않는다).
 */
export function saveGridFilterOpen(
  userId: string,
  screenKey: string,
  gridId: string,
  open: boolean,
  withPersonalize = false,
  store: Storage | null = defaultStorage(),
): boolean {
  if (!userId || !screenKey || !store) return false;
  const key = withPersonalize ? gridOptsKey(userId, screenKey, gridId) : gridFilterKey(userId, screenKey, gridId);
  return trySet(store, key, JSON.stringify({ ...(withPersonalize ? readOpts(store, key) : {}), filterOpen: open })) === null;
}

/**
 * 저장한다. 성공하면 true. 용량 초과(또는 다른 쓰기 실패)면 같은 사용자의 다른 그리드 키를 savedAt 이 오래된 순서로
 * 하나씩 지우며 다시 시도한다. `dmes:grid:v1:{userId}:` 밖의 키(분할 크기 등)는 건드리지 않는다.
 */
export function saveGridPrefs(
  userId: string,
  screenKey: string,
  gridId: string,
  prefs: GridPrefs,
  store: Storage | null = defaultStorage(),
): boolean {
  if (!userId || !screenKey || !store) return false;
  const key = gridPrefKey(userId, screenKey, gridId);
  let value: string;
  try {
    value = JSON.stringify(prefs);
  } catch {
    return false;
  }
  let err = trySet(store, key, value);
  if (err === null) return true;
  // 용량 초과일 때만 다른 키를 지운다 — 저장소가 막힌 경우(보안 오류 등)에 사용자 설정을 지우면 안 된다.
  if (!isQuotaError(err)) return false;
  for (const victim of oldestUserGridKeys(store, userId, key)) {
    try {
      store.removeItem(victim);
    } catch {
      return false;
    }
    err = trySet(store, key, value);
    if (err === null) return true;
    if (!isQuotaError(err)) return false;
  }
  return false;
}

/** 브라우저마다 다른 용량 초과 예외(이름 QuotaExceededError·NS_ERROR_DOM_QUOTA_REACHED, code 22·1014). */
function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: unknown; code?: unknown };
  return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014;
}

export function clearGridPrefs(
  userId: string,
  screenKey: string,
  gridId: string = DEFAULT_GRID_ID,
  store: Storage | null = defaultStorage(),
): void {
  if (!userId || !screenKey || !store) return;
  try {
    store.removeItem(gridPrefKey(userId, screenKey, gridId));
  } catch {
    // 지우지 못해도 그리드는 동작한다
  }
}

/** 쓰고 성공하면 null, 실패하면 던진 예외. */
function trySet(store: Storage, key: string, value: string): unknown {
  try {
    store.setItem(key, value);
    return null;
  } catch (e) {
    return e ?? new Error("setItem failed");
  }
}

/** 같은 사용자의 그리드 키(지금 쓰려는 키 제외)를 savedAt 오름차순으로. 읽지 못하는 값은 가장 오래된 것으로 본다. */
function oldestUserGridKeys(store: Storage, userId: string, exceptKey: string): string[] {
  const prefix = `${GRID_PREF_KEY_PREFIX}${userId}:`;
  const found: Array<{ key: string; savedAt: number }> = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (!k || !k.startsWith(prefix) || k === exceptKey) continue;
      let savedAt = 0;
      try {
        savedAt = parseGridPrefs(JSON.parse(store.getItem(k) ?? ""))?.savedAt ?? 0;
      } catch {
        savedAt = 0;
      }
      found.push({ key: k, savedAt });
    }
  } catch {
    return [];
  }
  return found.sort((a, b) => a.savedAt - b.savedAt).map((f) => f.key);
}

/** 숨김 잠금 판정에 쓰는 그리드 값. */
export interface GridHideLockContext {
  /** 그리드의 `rowKey`(AgDataGrid 기본 "id"). 빠뜨리면 rowKey 컬럼이 잠기지 않으므로 필수다. */
  rowKey: string;
  rowDragField?: string;
}

/** 잎 컬럼 하나가 숨김 잠금인가. 편집 가능(함수형 editable 포함)이면 `hideable: true` 일 때만 풀린다. */
export function isColumnHideLocked(col: GridColumn, ctx: GridHideLockContext): boolean {
  if (col.key === ctx.rowKey || col.key === ctx.rowDragField || col.rowDrag) return true;
  if (col.editable) return col.hideable !== true;
  return col.hideable === false;
}

/** 숨길 수 없는 colId 집합 — 선택 체크박스·행번호 컬럼과 잠긴 잎 컬럼(열 그룹 안까지). */
export function hideLockedColIds(columns: readonly GridColumn[], ctx: GridHideLockContext): Set<string> {
  const out = new Set<string>([GRID_SELECTION_COL_ID, ROW_NUMBER_COL_ID]);
  const walk = (list: readonly GridColumn[]) => {
    for (const c of list) {
      if (c.children && c.children.length > 0) walk(c.children);
      else if (isColumnHideLocked(c, ctx)) out.add(c.key);
    }
  };
  walk(columns);
  return out;
}

/** 병합의 기준이 되는 기본 컬럼(컬럼 정의 순서·값). */
export interface GridDefaultColumn {
  colId: string;
  width?: number;
  hide?: boolean;
  pinned?: GridPinned;
  /** 이 잎을 품은 열 그룹 id 경로(바깥 → 안쪽). 그룹이 없으면 생략. 병합이 그룹의 잎을 한데 모으는 데 쓴다. */
  groupPath?: readonly string[];
}

/**
 * 순서(colId 배열)에서 열 그룹의 잎이 갈라져 있으면 각 그룹의 잎을 그 그룹의 첫 잎 자리로 모은다. 그룹 안 순서는 입력 순서를 지킨다.
 * 중첩 그룹은 바깥부터 안쪽으로 차례로 모은다. 그룹이 없거나 이미 붙어 있으면 입력과 같은 순서를 돌려준다.
 * ag-grid 는 marryChildren 그룹을 가르는 applyOrder 를 받으면 경고(#39)만 내고 순서 전체를 버리므로(설치본 sortColsLikeKeys),
 * 병합 단계에서 미리 붙여야 저장 순서의 나머지도 살아난다.
 */
export function gatherGroupedColumns(order: readonly string[], groupPathOf: (colId: string) => readonly string[] | undefined): string[] {
  const arrange = (ids: readonly string[], depth: number): string[] => {
    const out: string[] = [];
    const done = new Set<string>();
    for (const id of ids) {
      const g = groupPathOf(id)?.[depth];
      if (g === undefined) {
        out.push(id);
        continue;
      }
      if (done.has(g)) continue;
      done.add(g);
      out.push(...arrange(ids.filter((x) => groupPathOf(x)?.[depth] === g), depth + 1));
    }
    return out;
  };
  return arrange(order, 0);
}

export interface MergeColumnStateOptions {
  /** 숨김 잠금 colId — 저장값의 hide 를 쓰지 않고 기본값을 쓴다. */
  locked?: ReadonlySet<string>;
  /** true 면 정렬 상태도 넣는다(저장값에 sort 가 없으면 정렬은 건드리지 않는다). */
  sort?: boolean;
}

/**
 * 기본 컬럼 + 저장값 → `applyColumnState({ state, applyOrder: true })` 에 넘길 전체 상태.
 * - 순서: 저장값에 있는 컬럼은 저장 순서, 새 컬럼은 기본 순서에서 바로 앞 컬럼의 뒤(앞 컬럼이 없으면 맨 앞).
 * - 열 그룹의 잎이 저장 순서에서 갈라져 있으면 그룹의 첫 잎 자리로 모은다(`gatherGroupedColumns`, 그룹 안 순서는 저장 순서).
 * - 없어진 컬럼(저장값에만 있는 colId)은 버린다.
 * - 화면 정의에서 `hide: true` 인 내부 컬럼과 잠긴 컬럼은 저장된 hide 를 무시하고 기본값을 쓴다.
 * ag-grid 는 applyOrder 때 state 에 없는 컬럼을 뒤로 보내므로 결과는 늘 기본 컬럼 전부를 담는다.
 */
export function mergeColumnState(
  defaults: readonly GridDefaultColumn[],
  prefs: GridPrefs,
  options: MergeColumnStateOptions = {},
): ColumnState[] {
  const locked = options.locked ?? new Set<string>();
  const byId = new Map(defaults.map((d) => [d.colId, d]));
  const saved = new Map<string, GridPrefColumn>();
  const order: string[] = [];
  for (const c of prefs.cols) {
    if (!byId.has(c.colId) || saved.has(c.colId)) continue;
    saved.set(c.colId, c);
    order.push(c.colId);
  }
  defaults.forEach((d, i) => {
    if (saved.has(d.colId)) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const pos = order.indexOf(defaults[j].colId);
      if (pos >= 0) {
        at = pos + 1;
        break;
      }
    }
    order.splice(at, 0, d.colId);
  });
  // 그룹 머리글이 있는 그리드 — 저장 순서(예전 저장값·화면이 그룹 구조를 바꾼 경우)가 그룹을 가르면 잎을 모은다.
  if (defaults.some((d) => d.groupPath && d.groupPath.length > 0)) {
    const gathered = gatherGroupedColumns(order, (id) => byId.get(id)?.groupPath);
    order.splice(0, order.length, ...gathered);
  }

  const sortRank = new Map<string, { sort: "asc" | "desc"; index: number }>();
  const applySort = options.sort === true && prefs.sort != null;
  if (applySort) {
    let index = 0;
    for (const s of prefs.sort ?? []) {
      if (byId.has(s.colId) && !sortRank.has(s.colId)) sortRank.set(s.colId, { sort: s.sort, index: index++ });
    }
  }

  return order.map((colId) => {
    const d = byId.get(colId)!;
    const s = saved.get(colId);
    const keepDefaultHide = locked.has(colId) || d.hide === true;
    const state: ColumnState = {
      colId,
      hide: keepDefaultHide || s?.hide == null ? (d.hide ?? false) : s.hide,
      pinned: s && s.pinned !== undefined ? s.pinned : (d.pinned ?? null),
    };
    const width = s?.width ?? d.width;
    if (width != null) state.width = width;
    // 저장 너비가 있으면 flex 를 끈다 — flex 가 남아 있으면 ag-grid 가 width 를 무시한다(columnSizing="fit").
    // 저장 너비가 없는 컬럼(fit 그리드에서 사용자가 너비를 바꾸지 않은 컬럼)은 정의의 flex 를 그대로 둔다.
    if (s?.width != null) state.flex = null;
    if (applySort) {
      const rank = sortRank.get(colId);
      state.sort = rank ? rank.sort : null;
      state.sortIndex = rank ? rank.index : null;
    }
    return state;
  });
}

/**
 * `api.getColumnState()` 결과 → 저장값. `sort` 가 false 면 정렬은 담지 않는다.
 * flex 컬럼(`flex > 0`)은 너비를 담지 않는다 — 너비는 그리드 폭에 따라 정해지는 값이라서다. ag-grid 는 사용자가 flex 컬럼의 너비를
 * 끌어 바꾸면 그 컬럼의 flex 를 끄므로, fit 그리드에서는 사용자가 직접 맞춘 컬럼만 너비가 저장된다.
 */
export function toGridPrefs(state: readonly ColumnState[], options: { sort: boolean; now?: number }): GridPrefs {
  const cols: GridPrefColumn[] = state.map((s) => {
    const col: GridPrefColumn = { colId: s.colId, hide: !!s.hide, pinned: s.pinned === "left" || s.pinned === "right" ? s.pinned : null };
    const flexed = typeof s.flex === "number" && s.flex > 0;
    if (!flexed && typeof s.width === "number" && Number.isFinite(s.width) && s.width > 0) col.width = Math.round(s.width);
    return col;
  });
  const prefs: GridPrefs = { v: 1, savedAt: options.now ?? Date.now(), cols };
  if (options.sort) {
    prefs.sort = state
      .filter((s): s is ColumnState & { sort: "asc" | "desc" } => s.sort === "asc" || s.sort === "desc")
      .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
      .map((s) => ({ colId: s.colId, sort: s.sort }));
  }
  return prefs;
}
