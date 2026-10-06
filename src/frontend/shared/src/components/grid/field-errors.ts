import { toPhysName } from "../../mdm-meta";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";
import type { GridColumn, AgDataGridFieldError } from "./grid-types";

/** 그리드 행 ID — ag-grid getRowId 와 같은 규칙(임시 ID → rowKey 칸 → id → _rowIndex → "0"). */
export function gridRowIdOf(row: Record<string, unknown>, rowKey: string): string {
  const tempId = row[GRID_TEMP_ID_FIELD];
  if (typeof tempId === "string" && tempId) return tempId;
  return String(row[rowKey] || row.id || row._rowIndex || "0");
}

function leafColumnKeys(columns: GridColumn[], out: string[] = []): string[] {
  for (const c of columns) {
    if (c.children && c.children.length > 0) leafColumnKeys(c.children, out);
    else out.push(c.key);
  }
  return out;
}

/**
 * 서버 오류 목록 → 행 ID → 열 key → 문구. 행을 찾지 못하거나 맞는 잎 열이 없는 오류는 버린다. 같은 칸이면 첫 문구.
 * 순수 함수라 단위 테스트가 ag-grid 렌더 없이 확인한다.
 */
export function indexFieldErrors(
  fieldErrors: AgDataGridFieldError[],
  data: Record<string, unknown>[],
  rowKey: string,
  columns: GridColumn[]
): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  if (fieldErrors.length === 0) return out;
  const keys = leafColumnKeys(columns);
  const byPhys = new Map<string, string>();
  for (const k of keys) {
    const p = toPhysName(k);
    if (p && !byPhys.has(p)) byPhys.set(p, k);
  }
  const byRowKey = new Map<string, Record<string, unknown>>();
  for (const row of data) {
    if (!row) continue;
    for (const v of [row[GRID_TEMP_ID_FIELD], row.rowKey, row[rowKey]]) {
      if (v == null || v === "") continue;
      const k = String(v);
      if (!byRowKey.has(k)) byRowKey.set(k, row);
    }
  }
  for (const fe of fieldErrors) {
    if (!fe || typeof fe.field !== "string") continue;
    const colKey = keys.includes(fe.field) ? fe.field : byPhys.get(toPhysName(fe.field) ?? "");
    if (!colKey) continue;
    const row =
      fe.rowKey != null && fe.rowKey !== ""
        ? byRowKey.get(String(fe.rowKey))
        : typeof fe.rowIndex === "number"
          ? data[fe.rowIndex]
          : undefined;
    if (!row) continue;
    const id = gridRowIdOf(row, rowKey);
    let cells = out.get(id);
    if (!cells) out.set(id, (cells = new Map()));
    if (!cells.has(colKey)) cells.set(colKey, fe.message);
  }
  return out;
}
