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

export function diffTable(base: readonly StoredRow[] | null, current: readonly GridRow[]): TableDiff {
  const rows = new Map<number, RowDiff>();
  if (!base) {
    for (const r of current) rows.set(r.rowId, { status: "SAME", changedVarIds: new Set(), noteChanged: false });
    return { rows, deleted: [] };
  }
  const baseById = new Map(base.map((r) => [r.rowId, r]));
  for (const r of current) {
    const b = baseById.get(r.rowId);
    if (!b) {
      rows.set(r.rowId, { status: "ADDED", changedVarIds: new Set(), noteChanged: false });
      continue;
    }
    const baseCells = parseCells(b.cells);
    const ids = new Set<number>([...Object.keys(baseCells), ...Object.keys(r.cells)].map(Number));
    const changed = new Set<number>();
    for (const id of [...ids].sort((x, y) => x - y)) {
      if (withoutAst(baseCells[id]) !== withoutAst(r.cells[id])) changed.add(id);
    }
    const noteChanged = (b.note ?? "") !== (r.note ?? "");
    rows.set(r.rowId, { status: changed.size > 0 || noteChanged ? "CHANGED" : "SAME", changedVarIds: changed, noteChanged });
  }
  const currentIds = new Set(current.map((r) => r.rowId));
  return { rows, deleted: base.filter((r) => !currentIds.has(r.rowId)) };
}
