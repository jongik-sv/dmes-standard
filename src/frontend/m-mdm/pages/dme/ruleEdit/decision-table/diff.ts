/**
 * base 버전 대비 강조(TSK-08-02 design I22). 비교 대상은 `base_ver` 버전의 행이고 row_id 로 맞댄다.
 * 셀은 `ast` 를 뺀 JSON 으로 견준다. 행 설명만 바뀌어도 CHANGED. base 에 없으면 ADDED, base 에만 있으면 지운 행.
 * base 가 없으면(null) 강조하지 않는다.
 */
import type { StoredRow } from "../types";
import { parseCells, type CellObj, type GridRow } from "./grid-model";

export type RowDiffStatus = "ADDED" | "CHANGED" | "SAME";

export interface RowDiff {
  status: RowDiffStatus;
  changedVarIds: Set<number>;
  noteChanged: boolean;
}

export interface TableDiff {
  rows: Map<number, RowDiff>;
  deleted: StoredRow[];
}

function withoutAst(cell: CellObj | undefined): string {
  if (!cell) return "";
  const { ast: _ast, ...rest } = cell;
  return JSON.stringify(rest);
}

/** base 행 하나의 비교용 형태 — 칸별 `ast` 를 뺀 JSON. 저장 행 객체마다 한 번만 만든다. */
interface BaseRow {
  row: StoredRow;
  cells: string;
  byVar: Map<number, string>;
}

/**
 * base 쪽 캐시(편집마다 base 행 전체를 다시 parse·stringify 하지 않게) — base 배열마다 row_id → 비교용 형태, 그리고 지금 행의 셀 객체마다
 * 마지막 판정 결과. 셀 객체·행 설명·row_id·base 행이 같으면 판정도 같으므로 앞 결과(같은 RowDiff 객체)를 돌려준다.
 */
interface BaseCache {
  byId: Map<number, BaseRow>;
  results: WeakMap<object, { rowId: number; note: string; base: BaseRow; diff: RowDiff }>;
}
const baseCaches = new WeakMap<readonly StoredRow[], BaseCache>();

function baseCacheOf(base: readonly StoredRow[]): BaseCache {
  let c = baseCaches.get(base);
  if (!c) {
    c = { byId: new Map(), results: new WeakMap() };
    baseCaches.set(base, c);
  }
  return c;
}

function baseRowOf(c: BaseCache, b: StoredRow): BaseRow {
  const hit = c.byId.get(b.rowId);
  // base 배열은 바꾸지 않는 값이지만, 같은 row_id 자리에 다른 행·셀이 오면 다시 만든다.
  if (hit && hit.row === b && hit.cells === b.cells) return hit;
  const byVar = new Map<number, string>();
  const parsed = parseCells(b.cells);
  for (const [k, cell] of Object.entries(parsed)) byVar.set(Number(k), withoutAst(cell));
  const out: BaseRow = { row: b, cells: b.cells, byVar };
  c.byId.set(b.rowId, out);
  return out;
}

function rowDiffOf(b: BaseRow, r: GridRow): RowDiff {
  const ids = new Set<number>([...b.byVar.keys(), ...Object.keys(r.cells).map(Number)]);
  const changed = new Set<number>();
  for (const id of [...ids].sort((x, y) => x - y)) {
    if ((b.byVar.get(id) ?? "") !== withoutAst(r.cells[id])) changed.add(id);
  }
  const noteChanged = (b.row.note ?? "") !== (r.note ?? "");
  return { status: changed.size > 0 || noteChanged ? "CHANGED" : "SAME", changedVarIds: changed, noteChanged };
}

/** 셀 객체 열쇠 — 그리드 행은 늘 셀 객체를 갖지만, 비정상 입력(null 등)이면 캐시하지 않는다. */
const isKey = (v: unknown): v is object => typeof v === "object" && v !== null;

export function diffTable(base: readonly StoredRow[] | null, current: readonly GridRow[]): TableDiff {
  const rows = new Map<number, RowDiff>();
  if (!base) {
    for (const r of current) rows.set(r.rowId, { status: "SAME", changedVarIds: new Set(), noteChanged: false });
    return { rows, deleted: [] };
  }
  const cache = baseCacheOf(base);
  const baseById = new Map(base.map((r) => [r.rowId, r]));
  for (const r of current) {
    const b = baseById.get(r.rowId);
    if (!b) {
      rows.set(r.rowId, { status: "ADDED", changedVarIds: new Set(), noteChanged: false });
      continue;
    }
    const br = baseRowOf(cache, b);
    const note = r.note ?? "";
    const prev = isKey(r.cells) ? cache.results.get(r.cells) : undefined;
    if (prev && prev.rowId === r.rowId && prev.note === note && prev.base === br) {
      rows.set(r.rowId, prev.diff);
      continue;
    }
    const diff = rowDiffOf(br, r);
    if (isKey(r.cells)) cache.results.set(r.cells, { rowId: r.rowId, note, base: br, diff });
    rows.set(r.rowId, diff);
  }
  const currentIds = new Set(current.map((r) => r.rowId));
  return { rows, deleted: base.filter((r) => !currentIds.has(r.rowId)) };
}
