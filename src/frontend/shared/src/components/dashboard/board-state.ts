/**
 * 대시보드 보드(위젯 배치) 상태 — 순수 함수 모음. React·DOM 에 기대지 않아 단위 시험으로 고정한다.
 *
 * 상태 = 행 배열(행마다 위젯 순서·접힘) + 숨긴 위젯 목록. 위젯마다 사용자가 바꾼 넓은 화면 칸 수(span)·높이(height)를 함께 둔다.
 * - 카드는 늘 어떤 행에 속한다. 빈 행은 자동으로 없앤다.
 * - 저장: localStorage `dmes:dash:v3:{userId}:{layoutKey}` = { v: 3, rows: [{ id, collapsed?, items: [{ id, span?, height? }] }], hidden: [id] }.
 *   v2(카드 크기·행 접힘만 있던 격자 모드)는 접두가 달라 읽지 않는다.
 * - 읽을 때 검증하고(sanitizeBoard), 코드의 위젯 목록과 맞춘다(normalizeBoard): 사라진 위젯 id 는 버리고, 새 위젯은
 *   기본 배치의 같은 행(없으면 마지막 행 끝, 칸이 모자라면 새 행)에 붙인다. 기본 배치에 없는 위젯은 처음부터 숨김이다.
 */

export interface DashboardBoardItem {
  /** 위젯 ID. */
  id: string;
  /** 사용자가 바꾼 넓은 화면 칸 수(1~12). 없으면 위젯 기본값. */
  span?: number;
  /** 사용자가 바꾼 카드 높이(px). 없으면 위젯 기본값. */
  height?: number;
}

export interface DashboardBoardRow {
  /** 행 ID(보드 안에서 고유). */
  id: string;
  /** 행이 접혔는지. */
  collapsed?: boolean;
  /** 행 안 위젯(왼쪽부터). */
  items: DashboardBoardItem[];
}

export interface DashboardBoardState {
  rows: DashboardBoardRow[];
  /** 숨긴 위젯 ID(숨긴 순서). */
  hidden: string[];
}

/** 기본 배치의 한 행. */
export interface DashboardBoardDefaultRow {
  /** 행 ID(보드 안에서 고유). */
  id: string;
  /** 행 안 위젯 ID(왼쪽부터). */
  widgets: string[];
}

/** 놓을 자리 — 기존 행의 index 번째(끄는 위젯을 뺀 뒤의 순서) 또는 rowIndex 번째 자리에 새 행. */
export type DashboardDropTarget =
  { kind: "row"; rowId: string; index: number } | { kind: "newRow"; rowIndex: number };

/** 키보드 이동 — 같은 행 안 앞·뒤, 위·아래 행, 위·아래로 새 행 떼어 내기. */
export type DashboardMoveKey = "left" | "right" | "up" | "down" | "newRowAbove" | "newRowBelow";

export const DASHBOARD_BOARD_PREFIX = "dmes:dash:v3:";
const BOARD_VERSION = 3;

/* ── 조회 ── */

/** 위젯이 놓인 자리(없으면 null — 숨겼거나 모르는 위젯). */
export function locateWidget(
  state: DashboardBoardState,
  id: string
): { rowIndex: number; index: number } | null {
  for (let r = 0; r < state.rows.length; r += 1) {
    const i = state.rows[r].items.findIndex((it) => it.id === id);
    if (i >= 0) return { rowIndex: r, index: i };
  }
  return null;
}

/** 보드에 놓인 위젯 ID(행 순서대로). */
export function placedWidgetIds(state: DashboardBoardState): string[] {
  return state.rows.flatMap((r) => r.items.map((it) => it.id));
}

/** 새 행 ID — 보드 안에서 쓰지 않은 `row-{n}`. */
export function nextRowId(state: DashboardBoardState): string {
  const used = new Set(state.rows.map((r) => r.id));
  let n = state.rows.length + 1;
  while (used.has(`row-${n}`)) n += 1;
  return `row-${n}`;
}

/* ── 기본 배치·검증·병합 ── */

function cloneRow(row: DashboardBoardRow): DashboardBoardRow {
  const out: DashboardBoardRow = { id: row.id, items: row.items.map((it) => ({ ...it })) };
  if (row.collapsed) out.collapsed = true;
  return out;
}

/** 빈 행을 없앤다. */
export function dropEmptyRows(state: DashboardBoardState): DashboardBoardState {
  if (state.rows.every((r) => r.items.length > 0)) return state;
  return { ...state, rows: state.rows.filter((r) => r.items.length > 0) };
}

/** 위젯을 마지막 행 끝에 붙인다. 마지막 행 칸 합 + 이 위젯 칸 수가 12를 넘으면(또는 행이 없으면) 새 행을 만든다. 붙인 행은 펼친다. */
function appendItem(
  state: DashboardBoardState,
  item: DashboardBoardItem,
  spanOf: (id: string) => number
): DashboardBoardState {
  const rows = state.rows.map(cloneRow);
  const last = rows[rows.length - 1];
  const used = last ? last.items.reduce((s, it) => s + (it.span ?? spanOf(it.id)), 0) : 0;
  const need = item.span ?? spanOf(item.id);
  if (last && used + need <= 12) {
    last.items.push(item);
    delete last.collapsed;
  } else {
    rows.push({ id: nextRowId({ rows, hidden: state.hidden }), items: [item] });
  }
  return { ...state, rows };
}

/** 기본 배치로 상태를 만든다. 모르는 ID·중복은 버리고, 기본 배치에 없는 위젯은 숨김으로 둔다. */
export function boardFromDefaults(
  defaults: readonly DashboardBoardDefaultRow[],
  widgetIds: readonly string[]
): DashboardBoardState {
  const known = new Set(widgetIds);
  const seen = new Set<string>();
  const rowIds = new Set<string>();
  const rows: DashboardBoardRow[] = [];
  for (const d of defaults) {
    if (rowIds.has(d.id)) continue;
    const items: DashboardBoardItem[] = [];
    for (const id of d.widgets) {
      if (!known.has(id) || seen.has(id)) continue;
      seen.add(id);
      items.push({ id });
    }
    if (items.length === 0) continue;
    rowIds.add(d.id);
    rows.push({ id: d.id, items });
  }
  const hidden = widgetIds.filter((id) => !seen.has(id));
  return { rows, hidden: Array.from(new Set(hidden)) };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;

/** 저장값 구조 검증 — 형식이 다르면(다른 버전 포함) null. 항목 안의 잘못된 값만 버리고 나머지는 남긴다. */
export function sanitizeBoard(raw: unknown): DashboardBoardState | null {
  if (!isObj(raw) || raw.v !== BOARD_VERSION || !Array.isArray(raw.rows)) return null;
  const rows: DashboardBoardRow[] = [];
  for (const r of raw.rows) {
    if (!isObj(r) || !isId(r.id) || !Array.isArray(r.items)) continue;
    const items: DashboardBoardItem[] = [];
    for (const it of r.items) {
      if (!isObj(it) || !isId(it.id)) continue;
      const item: DashboardBoardItem = { id: it.id };
      if (typeof it.span === "number" && Number.isInteger(it.span) && it.span >= 1 && it.span <= 12)
        item.span = it.span;
      if (typeof it.height === "number" && Number.isFinite(it.height) && it.height > 0)
        item.height = Math.round(it.height);
      items.push(item);
    }
    const row: DashboardBoardRow = { id: r.id, items };
    if (r.collapsed === true) row.collapsed = true;
    rows.push(row);
  }
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter(isId) : [];
  return { rows, hidden };
}

/**
 * 상태를 코드의 위젯 목록에 맞춘다.
 * - 모르는 위젯 ID·중복(먼저 나온 것만 남김)·같은 행 ID 를 버리고 빈 행을 없앤다.
 * - 놓이지도 숨겨지지도 않은 위젯(코드에 새로 생긴 위젯)은 기본 배치에 있으면 같은 ID 행 끝(그 행이 없으면 마지막 행 끝,
 *   칸이 모자라면 새 행)에 붙이고, 기본 배치에 없으면 숨김에 넣는다.
 */
export function normalizeBoard(
  state: DashboardBoardState,
  widgetIds: readonly string[],
  defaults: readonly DashboardBoardDefaultRow[],
  spanOf: (id: string) => number
): DashboardBoardState {
  const known = new Set(widgetIds);
  const seen = new Set<string>();
  const rowIds = new Set<string>();
  const rows: DashboardBoardRow[] = [];
  for (const r of state.rows) {
    if (rowIds.has(r.id)) continue;
    const items = r.items.filter((it) => {
      if (!known.has(it.id) || seen.has(it.id)) return false;
      seen.add(it.id);
      return true;
    });
    if (items.length === 0) continue;
    rowIds.add(r.id);
    rows.push({ ...cloneRow(r), items: items.map((it) => ({ ...it })) });
  }
  const hidden: string[] = [];
  for (const id of state.hidden) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    hidden.push(id);
  }
  let next: DashboardBoardState = { rows, hidden };
  const defaultRowOf = new Map<string, string>();
  for (const d of defaults)
    for (const id of d.widgets) if (!defaultRowOf.has(id)) defaultRowOf.set(id, d.id);
  for (const id of widgetIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const rowId = defaultRowOf.get(id);
    if (rowId == null) {
      next = { ...next, hidden: [...next.hidden, id] };
      continue;
    }
    const target = next.rows.findIndex((r) => r.id === rowId);
    if (target >= 0) {
      const rows2 = next.rows.map(cloneRow);
      rows2[target].items.push({ id });
      next = { ...next, rows: rows2 };
    } else {
      next = appendItem(next, { id }, spanOf);
    }
  }
  return next;
}

/** 두 상태가 같은지(행 순서·ID·접힘·위젯 순서·크기, 숨김 집합). */
export function boardsEqual(a: DashboardBoardState, b: DashboardBoardState): boolean {
  if (a.rows.length !== b.rows.length || a.hidden.length !== b.hidden.length) return false;
  const hb = new Set(b.hidden);
  if (!a.hidden.every((id) => hb.has(id))) return false;
  return a.rows.every((ra, i) => {
    const rb = b.rows[i];
    if (ra.id !== rb.id || !!ra.collapsed !== !!rb.collapsed) return false;
    if (ra.items.length !== rb.items.length) return false;
    return ra.items.every((ia, j) => {
      const ib = rb.items[j];
      return ia.id === ib.id && ia.span === ib.span && ia.height === ib.height;
    });
  });
}

/* ── 바꾸기 ── */

/** 위젯을 놓을 자리로 옮긴다. 자리가 맞지 않거나 그대로면 같은 상태를 돌려준다. 빈 행은 없앤다. */
export function moveWidget(
  state: DashboardBoardState,
  id: string,
  target: DashboardDropTarget
): DashboardBoardState {
  const from = locateWidget(state, id);
  if (!from) return state;
  const item = state.rows[from.rowIndex].items[from.index];
  if (target.kind === "row") {
    const toRow = state.rows.findIndex((r) => r.id === target.rowId);
    if (toRow < 0) return state;
    const rows = state.rows.map(cloneRow);
    rows[from.rowIndex].items.splice(from.index, 1);
    const dest = rows[toRow].items;
    const index = Math.max(0, Math.min(dest.length, Math.round(target.index)));
    if (toRow === from.rowIndex && index === from.index) return state;
    dest.splice(index, 0, { ...item });
    return dropEmptyRows({ ...state, rows });
  }
  const at = Math.max(0, Math.min(state.rows.length, Math.round(target.rowIndex)));
  // 혼자 있는 행의 바로 위·아래 자리에 새 행을 만들면 결과가 같다.
  if (
    state.rows[from.rowIndex].items.length === 1 &&
    (at === from.rowIndex || at === from.rowIndex + 1)
  )
    return state;
  const rows = state.rows.map(cloneRow);
  rows[from.rowIndex].items.splice(from.index, 1);
  rows.splice(at, 0, { id: nextRowId(state), items: [{ ...item }] });
  return dropEmptyRows({ ...state, rows });
}

/** 키보드 이동. ←→ 같은 행 안 한 칸, ↑ 위 행 끝, ↓ 아래 행 앞(맨 위·아래 행이면 같은 행에 다른 위젯이 있을 때 새 행), Shift+↑↓ 바로 위·아래 새 행. */
export function keyboardMove(
  state: DashboardBoardState,
  id: string,
  key: DashboardMoveKey
): DashboardBoardState {
  const at = locateWidget(state, id);
  if (!at) return state;
  const row = state.rows[at.rowIndex];
  switch (key) {
    case "left":
      return at.index === 0
        ? state
        : moveWidget(state, id, { kind: "row", rowId: row.id, index: at.index - 1 });
    case "right":
      return at.index >= row.items.length - 1
        ? state
        : moveWidget(state, id, { kind: "row", rowId: row.id, index: at.index + 1 });
    case "up": {
      const prev = state.rows[at.rowIndex - 1];
      if (prev)
        return moveWidget(state, id, { kind: "row", rowId: prev.id, index: prev.items.length });
      return moveWidget(state, id, { kind: "newRow", rowIndex: 0 });
    }
    case "down": {
      const next = state.rows[at.rowIndex + 1];
      if (next) return moveWidget(state, id, { kind: "row", rowId: next.id, index: 0 });
      return moveWidget(state, id, { kind: "newRow", rowIndex: state.rows.length });
    }
    case "newRowAbove":
      return moveWidget(state, id, { kind: "newRow", rowIndex: at.rowIndex });
    case "newRowBelow":
      return moveWidget(state, id, { kind: "newRow", rowIndex: at.rowIndex + 1 });
    default:
      return state;
  }
}

/** 위젯을 숨긴다(사용자가 바꾼 크기는 버린다). 빈 행은 없앤다. */
export function hideWidget(state: DashboardBoardState, id: string): DashboardBoardState {
  const at = locateWidget(state, id);
  if (!at) return state;
  const rows = state.rows.map(cloneRow);
  rows[at.rowIndex].items.splice(at.index, 1);
  return dropEmptyRows({ rows, hidden: [...state.hidden.filter((h) => h !== id), id] });
}

/** 숨긴 위젯을 마지막 행 끝(칸이 모자라면 새 행)에 다시 놓는다. 붙인 행이 접혀 있으면 펼친다. */
export function addWidget(
  state: DashboardBoardState,
  id: string,
  spanOf: (id: string) => number
): DashboardBoardState {
  if (!state.hidden.includes(id) || locateWidget(state, id)) return state;
  const next = appendItem(
    { ...state, hidden: state.hidden.filter((h) => h !== id) },
    { id },
    spanOf
  );
  return next;
}

/** 행 접힘을 바꾼다. */
export function setRowCollapsed(
  state: DashboardBoardState,
  rowId: string,
  collapsed: boolean
): DashboardBoardState {
  const i = state.rows.findIndex((r) => r.id === rowId);
  if (i < 0 || !!state.rows[i].collapsed === collapsed) return state;
  const rows = state.rows.map(cloneRow);
  if (collapsed) rows[i].collapsed = true;
  else delete rows[i].collapsed;
  return { ...state, rows };
}

/** 위젯의 사용자 크기를 바꾼다. undefined 값은 지운다(기본값으로). */
export function setItemSize(
  state: DashboardBoardState,
  id: string,
  patch: { span?: number; height?: number }
): DashboardBoardState {
  const at = locateWidget(state, id);
  if (!at) return state;
  const rows = state.rows.map(cloneRow);
  const item = rows[at.rowIndex].items[at.index];
  for (const k of Object.keys(patch) as Array<"span" | "height">) {
    const v = patch[k];
    if (v === undefined) delete item[k];
    else item[k] = v;
  }
  const before = state.rows[at.rowIndex].items[at.index];
  if (before.span === item.span && before.height === item.height) return state;
  return { ...state, rows };
}

/* ── 저장 ── */

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function boardStorageKey(userId: string, layoutKey: string): string {
  return `${DASHBOARD_BOARD_PREFIX}${userId}:${layoutKey}`;
}

/** 저장된 보드를 읽는다(없거나 형식이 다르면 null). */
export function loadBoard(userId: string, layoutKey: string): DashboardBoardState | null {
  try {
    const raw = storage()?.getItem(boardStorageKey(userId, layoutKey));
    return raw ? sanitizeBoard(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

/** 보드를 저장한다. state 가 null 이면(기본 배치) 지운다. */
export function saveBoard(
  userId: string,
  layoutKey: string,
  state: DashboardBoardState | null
): void {
  try {
    const s = storage();
    if (!s) return;
    const key = boardStorageKey(userId, layoutKey);
    if (state == null) s.removeItem(key);
    else
      s.setItem(key, JSON.stringify({ v: BOARD_VERSION, rows: state.rows, hidden: state.hidden }));
  } catch {
    // 저장 실패는 무시(배치 편집 자체는 동작)
  }
}

/* ── 놓을 자리 계산(포인터) ── */

export interface DropRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface DropRowRect extends DropRect {
  id: string;
  /** 행 안 카드(행 순서대로). */
  cards: Array<DropRect & { id: string }>;
}

/** 놓일 자리 표시 — 카드 사이 선(v: 세로, h: 가로 — 세로 쌓기일 때) 또는 행 사이 새 행 자리. */
export type DropIndicator =
  | { kind: "line"; dir: "v" | "h"; x: number; y: number; length: number }
  | { kind: "gap"; rowIndex: number };

/**
 * 포인터 위치로 놓을 자리를 정한다. rows 는 화면 위→아래 순서의 행 사각형(카드 사각형 포함)이다.
 * - 행 사이(첫 행 위·마지막 행 아래 포함)면 그 자리에 새 행.
 * - 행 안이면 포인터와 같은 줄(행 안에서 줄바꿈된 카드 줄)의 카드 중 앞뒤를 고른다. 한 줄에 카드가 하나뿐이면
 *   (좁은 화면의 세로 쌓기) 카드 세로 가운데를 기준으로 앞뒤를 고른다.
 * - 결과가 지금 자리와 같으면 null.
 */
export function computeDropTarget(
  x: number,
  y: number,
  rows: readonly DropRowRect[],
  sourceId: string,
  gap = 8
): { target: DashboardDropTarget; indicator: DropIndicator } | null {
  if (rows.length === 0) return null;
  const srcRow = rows.findIndex((r) => r.cards.some((c) => c.id === sourceId));
  const srcIdx = srcRow >= 0 ? rows[srcRow].cards.findIndex((c) => c.id === sourceId) : -1;
  const newRow = (rowIndex: number) => {
    if (
      srcRow >= 0 &&
      rows[srcRow].cards.length === 1 &&
      (rowIndex === srcRow || rowIndex === srcRow + 1)
    )
      return null;
    return {
      target: { kind: "newRow", rowIndex } as DashboardDropTarget,
      indicator: { kind: "gap", rowIndex } as DropIndicator,
    };
  };
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i += 1) {
    if (y < rows[i].top) return newRow(i);
    if (y <= rows[i].bottom) {
      rowIndex = i;
      break;
    }
  }
  if (rowIndex < 0) return newRow(rows.length);

  const row = rows[rowIndex];
  if (row.cards.length === 0) return null;
  // 포인터와 같은 줄의 카드 — 없으면 세로로 가장 가까운 줄.
  let line = row.cards.filter((c) => y >= c.top && y <= c.bottom);
  if (line.length === 0) {
    let best = Infinity;
    for (const c of row.cards) {
      const d = y < c.top ? c.top - y : y - c.bottom;
      if (d < best) best = d;
    }
    line = row.cards.filter((c) => (y < c.top ? c.top - y : y - c.bottom) === best);
  }
  line = [...line].sort((a, b) => a.left - b.left);
  let before: (typeof line)[number] | null = null;
  if (line.length === 1) {
    const c = line[0];
    if (y < (c.top + c.bottom) / 2) before = c;
  } else {
    before = line.find((c) => x < (c.left + c.right) / 2) ?? null;
  }
  let index: number;
  let indicator: DropIndicator;
  if (before) {
    index = row.cards.findIndex((c) => c.id === before.id);
    indicator =
      line.length === 1
        ? {
            kind: "line",
            dir: "h",
            x: before.left,
            y: before.top - gap / 2,
            length: before.right - before.left,
          }
        : {
            kind: "line",
            dir: "v",
            x: before.left - gap / 2,
            y: before.top,
            length: before.bottom - before.top,
          };
  } else {
    const last = line[line.length - 1];
    index = row.cards.findIndex((c) => c.id === last.id) + 1;
    indicator =
      line.length === 1
        ? {
            kind: "line",
            dir: "h",
            x: last.left,
            y: last.bottom + gap / 2,
            length: last.right - last.left,
          }
        : {
            kind: "line",
            dir: "v",
            x: last.right + gap / 2,
            y: last.top,
            length: last.bottom - last.top,
          };
  }
  if (rowIndex === srcRow) {
    if (index > srcIdx) index -= 1;
    if (index === srcIdx) return null;
  }
  return { target: { kind: "row", rowId: row.id, index }, indicator };
}
