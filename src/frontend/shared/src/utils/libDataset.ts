/**
 * 데이터셋(배열/객체) 유틸리티 함수
 * - 원본: dmes_react/frontend/src/lib/libDataset.js
 */

import { isNullOrEmpty } from "./libUtil";

export const ROW_TYPE = { NORMAL: 1, INSERT: 2, UPDATE: 4, DELETE: 8 } as const;
export type RowType = (typeof ROW_TYPE)[keyof typeof ROW_TYPE];

export const ROW_STATUS = { INSERTED: "inserted", UPDATED: "updated", DELETED: "deleted" } as const;
export type RowStatus = (typeof ROW_STATUS)[keyof typeof ROW_STATUS];

type DataRow = Record<string, unknown>;

export function findFirstRow(dataArray: DataRow[], col: string, val: unknown): number {
  if (!Array.isArray(dataArray)) return -1;
  for (let i = 0; i < dataArray.length; i++) {
    if (dataArray[i][col] == val) return i;
  }
  return -1;
}

export function findRows(dataArray: DataRow[], col: string, val: unknown): number[] {
  const result: number[] = [];
  if (!Array.isArray(dataArray)) return result;
  for (let i = 0; i < dataArray.length; i++) {
    if (dataArray[i][col] == val) result.push(i);
  }
  return result;
}

export function findRowsByMultiCol(dataArray: DataRow[], conditions: Record<string, unknown>): number[] {
  const result: number[] = [];
  if (!Array.isArray(dataArray)) return result;
  const conditionKeys = Object.keys(conditions);
  for (let i = 0; i < dataArray.length; i++) {
    let match = true;
    for (const key of conditionKeys) {
      if (dataArray[i][key] != conditions[key]) {
        match = false;
        break;
      }
    }
    if (match) result.push(i);
  }
  return result;
}

export function deleteRows(dataArray: DataRow[], col: string, val: unknown): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  return dataArray.filter((row) => row[col] != val);
}

export function deleteMultiRows(dataArray: DataRow[], indices: number[]): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  if (!Array.isArray(indices)) return dataArray;
  const indexSet = new Set(indices);
  return dataArray.filter((_, index) => !indexSet.has(index));
}

export function isDuplicationCheck(
  dataArray: DataRow[],
  columnIds: string | string[],
  currentRow: number | null = null,
): boolean {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return false;
  const cols = Array.isArray(columnIds) ? columnIds : [columnIds];
  const makeKey = (row: DataRow) => cols.map((col) => row[col]).join("|");
  const seen = new Map<string, number>();
  for (let i = 0; i < dataArray.length; i++) {
    const key = makeKey(dataArray[i]);
    if (seen.has(key)) {
      if (currentRow !== null) {
        if (i === currentRow || seen.get(key) === currentRow) return true;
      } else {
        return true;
      }
    }
    seen.set(key, i);
  }
  return false;
}

export function removeDuplicates(dataArray: DataRow[], columnIds: string | string[]): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  const cols = Array.isArray(columnIds) ? columnIds : [columnIds];
  const seen = new Set<string>();
  const result: DataRow[] = [];
  for (const row of dataArray) {
    const key = cols.map((col) => row[col]).join("|");
    if (!seen.has(key)) {
      seen.add(key);
      result.push({ ...row });
    }
  }
  return result;
}

export function isDatasetChanged(dataArray: DataRow[], originalArray: DataRow[]): boolean {
  if (!Array.isArray(dataArray) || !Array.isArray(originalArray)) return dataArray !== originalArray;
  if (dataArray.length !== originalArray.length) return true;
  return JSON.stringify(dataArray) !== JSON.stringify(originalArray);
}

export interface ChangedRows {
  inserted: DataRow[];
  updated: DataRow[];
  deleted: DataRow[];
}

export function getChangedRows(dataArray: DataRow[]): ChangedRows {
  const result: ChangedRows = { inserted: [], updated: [], deleted: [] };
  if (!Array.isArray(dataArray)) return result;
  for (const row of dataArray) {
    const rowType = (row._rowType || row.rowType || ROW_TYPE.NORMAL) as number;
    switch (rowType) {
      case ROW_TYPE.INSERT:
        result.inserted.push(row);
        break;
      case ROW_TYPE.UPDATE:
        result.updated.push(row);
        break;
      case ROW_TYPE.DELETE:
        result.deleted.push(row);
        break;
    }
  }
  return result;
}

export function findData(
  dataArray: DataRow[],
  idCol: string,
  idVal: unknown,
  subCol: string | null = null,
  subVal: unknown = null,
): number {
  if (!Array.isArray(dataArray)) return -1;
  if (isNullOrEmpty(subCol)) return findFirstRow(dataArray, idCol, idVal);
  for (let i = 0; i < dataArray.length; i++) {
    if (dataArray[i][idCol] == idVal && dataArray[i][subCol!] == subVal) return i;
  }
  return -1;
}

export function editData(
  dataArray: DataRow[],
  idCol: string,
  idVal: unknown,
  valCol: string,
  newVal: unknown,
  subCol: string | null = null,
  subVal: unknown = null,
): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  const curRow = findData(dataArray, idCol, idVal, subCol, subVal);
  if (curRow === -1) return [...dataArray];
  const newArray = [...dataArray];
  newArray[curRow] = { ...newArray[curRow], [valCol]: newVal };
  return newArray;
}

export function deleteData(
  dataArray: DataRow[],
  idCol: string,
  idVal: unknown,
  subCol: string | null = null,
  subVal: unknown = null,
): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  const curRow = findData(dataArray, idCol, idVal, subCol, subVal);
  if (curRow === -1) return [...dataArray];
  return dataArray.filter((_, index) => index !== curRow);
}

export function setFirstRow(
  dataArray: DataRow[],
  codeValue: unknown,
  dataValue: unknown,
  codeColumn: string = "code",
  dataColumn: string = "name",
): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  const newRow = { [codeColumn]: codeValue, [dataColumn]: dataValue };
  return [newRow, ...dataArray];
}

export interface RowCopyResult {
  data: DataRow[];
  newRowIndex: number;
}

export function rowcopyData(
  dataArray: DataRow[],
  sourceRow: number,
  columns: string[] | null = null,
  insertType: "A" | "I" = "A",
  currentRow: number | null = null,
): RowCopyResult {
  if (!Array.isArray(dataArray)) return { data: [], newRowIndex: -1 };
  if (sourceRow < 0 || sourceRow >= dataArray.length) return { data: [...dataArray], newRowIndex: -1 };
  const sourceData = dataArray[sourceRow];
  let newRow: DataRow = {};
  if (columns === null) {
    newRow = { ...sourceData };
  } else {
    for (const col of columns) newRow[col] = sourceData[col];
  }
  const newArray = [...dataArray];
  let newRowIndex: number;
  if (insertType === "A") {
    newArray.push(newRow);
    newRowIndex = newArray.length - 1;
  } else {
    const insertIndex = (currentRow !== null ? currentRow : sourceRow) + 1;
    newArray.splice(insertIndex, 0, newRow);
    newRowIndex = insertIndex;
  }
  return { data: newArray, newRowIndex };
}

export function addRow(dataArray: DataRow[], rowData: DataRow = {}, position: number = -1): DataRow[] {
  if (!Array.isArray(dataArray)) return [rowData];
  const newRow = { _rowType: ROW_TYPE.INSERT, ...rowData };
  const newArray = [...dataArray];
  if (position === -1 || position >= dataArray.length) {
    newArray.push(newRow);
  } else {
    newArray.splice(position, 0, newRow);
  }
  return newArray;
}

export function getColumnValues(dataArray: DataRow[], column: string): unknown[] {
  if (!Array.isArray(dataArray)) return [];
  return dataArray.map((row) => row[column]);
}

export function sumColumn(dataArray: DataRow[], column: string): number {
  if (!Array.isArray(dataArray)) return 0;
  return dataArray.reduce((sum, row) => sum + (parseFloat(String(row[column])) || 0), 0);
}

export function avgColumn(dataArray: DataRow[], column: string): number {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return 0;
  return sumColumn(dataArray, column) / dataArray.length;
}

export function maxColumn(dataArray: DataRow[], column: string): number | null {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;
  const values = dataArray.map((row) => parseFloat(String(row[column])) || 0);
  return Math.max(...values);
}

export function minColumn(dataArray: DataRow[], column: string): number | null {
  if (!Array.isArray(dataArray) || dataArray.length === 0) return null;
  const values = dataArray.map((row) => parseFloat(String(row[column])) || 0);
  return Math.min(...values);
}

export function countColumn(dataArray: DataRow[], column: string | null = null, value: unknown = null): number {
  if (!Array.isArray(dataArray)) return 0;
  if (column === null) return dataArray.length;
  return dataArray.filter((row) => row[column] == value).length;
}

export type AggType = "sum" | "avg" | "count" | "max" | "min";

export function groupBy(
  dataArray: DataRow[],
  groupColumns: string | string[],
  aggregations: Record<string, AggType> = {},
): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  const groups = Array.isArray(groupColumns) ? groupColumns : [groupColumns];
  const grouped = new Map<string, DataRow & { _rows: DataRow[] }>();
  for (const row of dataArray) {
    const key = groups.map((col) => row[col]).join("|");
    if (!grouped.has(key)) {
      const groupData: DataRow & { _rows: DataRow[] } = { _rows: [] };
      groups.forEach((col) => (groupData[col] = row[col]));
      grouped.set(key, groupData);
    }
    grouped.get(key)!._rows.push(row);
  }
  const result: DataRow[] = [];
  for (const [, groupData] of grouped) {
    const rows = groupData._rows;
    const resultRow: DataRow = { ...groupData };
    delete resultRow._rows;
    for (const [col, aggType] of Object.entries(aggregations)) {
      switch (aggType) {
        case "sum":
          resultRow[col] = rows.reduce((sum, r) => sum + (parseFloat(String(r[col])) || 0), 0);
          break;
        case "avg":
          resultRow[col] = rows.reduce((sum, r) => sum + (parseFloat(String(r[col])) || 0), 0) / rows.length;
          break;
        case "count":
          resultRow[col] = rows.length;
          break;
        case "max":
          resultRow[col] = Math.max(...rows.map((r) => parseFloat(String(r[col])) || 0));
          break;
        case "min":
          resultRow[col] = Math.min(...rows.map((r) => parseFloat(String(r[col])) || 0));
          break;
      }
    }
    result.push(resultRow);
  }
  return result;
}

export interface SortConfig {
  column: string;
  order?: "asc" | "desc";
}

export function sortBy(dataArray: DataRow[], columns: string | SortConfig[], order: "asc" | "desc" = "asc"): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  const sortConfig: SortConfig[] = Array.isArray(columns) ? columns : [{ column: columns, order }];
  return [...dataArray].sort((a, b) => {
    for (const config of sortConfig) {
      const col = typeof config === "string" ? config : config.column;
      const ord = typeof config === "string" ? order : config.order || "asc";
      let valA = a[col];
      let valB = b[col];
      if (!isNaN(Number(valA)) && !isNaN(Number(valB))) {
        valA = parseFloat(String(valA));
        valB = parseFloat(String(valB));
      }
      if ((valA as number) < (valB as number)) return ord === "asc" ? -1 : 1;
      if ((valA as number) > (valB as number)) return ord === "asc" ? 1 : -1;
    }
    return 0;
  });
}

export function moveRow(dataArray: DataRow[], fromIndex: number, toIndex: number): DataRow[] {
  if (!Array.isArray(dataArray)) return [];
  if (fromIndex < 0 || fromIndex >= dataArray.length) return [...dataArray];
  if (toIndex < 0 || toIndex >= dataArray.length) return [...dataArray];
  const newArray = [...dataArray];
  const [removed] = newArray.splice(fromIndex, 1);
  newArray.splice(toIndex, 0, removed);
  return newArray;
}

// gfn_ 호환 별칭
export const gfn_findFirstRow = findFirstRow;
export const gfn_findRows = findRows;
export const gfn_findRowsByMultiCol = findRowsByMultiCol;
export const gfn_deleteRows = deleteRows;
export const gfn_deleteMultiRows = deleteMultiRows;
export const gfn_isDuplicationCheck = isDuplicationCheck;
export const gfn_dsDupDel = removeDuplicates;
export const gfn_isDatasetChanged = isDatasetChanged;
export const gfn_getChangedRows = getChangedRows;
export const gfn_findData = findData;
export const gfn_editData = editData;
export const gfn_deleteData = deleteData;
export const gfn_setFirstRow = setFirstRow;
export const gfn_rowcopyData = rowcopyData;
export const gfn_addRow = addRow;
export const gfn_getColumnValues = getColumnValues;
export const gfn_sumColumn = sumColumn;
export const gfn_avgColumn = avgColumn;
export const gfn_maxColumn = maxColumn;
export const gfn_minColumn = minColumn;
export const gfn_countColumn = countColumn;
export const gfn_groupBy = groupBy;
export const gfn_sortBy = sortBy;
export const gfn_moveRow = moveRow;
