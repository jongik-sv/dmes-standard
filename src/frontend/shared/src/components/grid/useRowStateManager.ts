import { useCallback, useRef, useState } from "react";

export type RowState = "normal" | "added" | "modified" | "deleted" | "copied";

export interface RowStateItem<T> {
  data: T;
  _rowState: RowState;
  _original?: T;
  _tempId?: string;
}

export interface RowStateChanges<T> {
  toCreate: T[];
  toUpdate: T[];
  toDelete: T[];
}

export interface RowStateManager<T> {
  rows: RowStateItem<T>[];
  setRows: (items: T[]) => void;
  /**
   * RowStateItem 을 통째로 교체. setRows 와 달리 `_rowState`/`_tempId`/`_original` 을 보존한다.
   * cross-context 편집 (다른 BOM 으로 전환 후 복귀) 시 stashed 편집을 복원할 때 사용.
   */
  setRawRows: (items: RowStateItem<T>[]) => void;
  /** 신규 행 추가 후 새 행의 _tempId 를 반환 (호출측에서 직접 select 하려는 경우 활용) */
  addRow: (item: T) => string;
  /** 행 복사 후 새 행의 _tempId 를 반환 */
  copyRow: (item: T, overrides?: Partial<T>) => string;
  updateRow: (key: string, updated: T) => void;
  /** 상태 변경 없이 데이터만 갱신 (서버 동기화용) */
  refreshRow: (key: string, updated: T) => void;
  markDeleted: (key: string) => void;
  cancelRow: (key: string) => void;
  getChanges: () => RowStateChanges<T>;
  commitAll: () => void;
  isDirty: () => boolean;
  getVisibleData: () => T[];
}

let _tempIdCounter = 0;
function genTempId(): string {
  return `__temp_${Date.now()}_${++_tempIdCounter}`;
}

export function useRowStateManager<T>(keyField: keyof T): RowStateManager<T> {
  const [rows, setRowsState] = useState<RowStateItem<T>[]>([]);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  const getKey = useCallback(
    (row: RowStateItem<T>): string => {
      return row._tempId || String(row.data[keyField] ?? "");
    },
    [keyField],
  );

  const setRows = useCallback(
    (items: T[]) => {
      setRowsState(
        items.map((data) => ({ data, _rowState: "normal" as RowState })),
      );
    },
    [],
  );

  const setRawRows = useCallback(
    (items: RowStateItem<T>[]) => {
      setRowsState(items);
    },
    [],
  );

  const addRow = useCallback(
    (item: T): string => {
      const tempId = genTempId();
      setRowsState((prev) => [
        ...prev,
        { data: item, _rowState: "added", _tempId: tempId },
      ]);
      return tempId;
    },
    [],
  );

  const copyRow = useCallback(
    (item: T, overrides?: Partial<T>): string => {
      const tempId = genTempId();
      const copied = { ...item, ...overrides } as T;
      setRowsState((prev) => [
        ...prev,
        { data: copied, _rowState: "copied", _tempId: tempId },
      ]);
      return tempId;
    },
    [],
  );

  const refreshRow = useCallback(
    (key: string, updated: T) => {
      setRowsState((prev) =>
        prev.map((row) => {
          if (getKey(row) !== key) return row;
          return { ...row, data: updated };
        }),
      );
    },
    [getKey],
  );

  const updateRow = useCallback(
    (key: string, updated: T) => {
      setRowsState((prev) =>
        prev.map((row) => {
          if (getKey(row) !== key) return row;
          if (row._rowState === "added" || row._rowState === "copied") {
            return { ...row, data: updated };
          }
          if (row._rowState === "normal") {
            return {
              ...row,
              data: updated,
              _rowState: "modified",
              _original: row._original ?? row.data,
            };
          }
          return { ...row, data: updated };
        }),
      );
    },
    [getKey],
  );

  const markDeleted = useCallback(
    (key: string) => {
      setRowsState((prev) =>
        prev.map((row) => {
          if (getKey(row) !== key) return row;
          if (row._rowState === "added" || row._rowState === "copied") {
            return null as unknown as RowStateItem<T>;
          }
          if (row._rowState === "deleted") {
            return {
              ...row,
              data: row._original ?? row.data,
              _rowState: "normal" as RowState,
              _original: undefined,
            };
          }
          return {
            ...row,
            _rowState: "deleted" as RowState,
            _original: row._original ?? row.data,
          };
        }).filter(Boolean),
      );
    },
    [getKey],
  );

  const cancelRow = useCallback(
    (key: string) => {
      setRowsState((prev) =>
        prev
          .map((row) => {
            if (getKey(row) !== key) return row;
            if (row._rowState === "added" || row._rowState === "copied") {
              return null as unknown as RowStateItem<T>;
            }
            return {
              ...row,
              data: row._original ?? row.data,
              _rowState: "normal" as RowState,
              _original: undefined,
            };
          })
          .filter(Boolean),
      );
    },
    [getKey],
  );

  const getChanges = useCallback((): RowStateChanges<T> => {
    const current = rowsRef.current;
    return {
      toCreate: current
        .filter((r) => r._rowState === "added" || r._rowState === "copied")
        .map((r) => r.data),
      toUpdate: current
        .filter((r) => r._rowState === "modified")
        .map((r) => r.data),
      toDelete: current
        .filter((r) => r._rowState === "deleted")
        .map((r) => r.data),
    };
  }, []);

  const commitAll = useCallback(() => {
    setRowsState((prev) =>
      prev
        .filter((r) => r._rowState !== "deleted")
        .map((r) => ({ data: r.data, _rowState: "normal" as RowState })),
    );
  }, []);

  const isDirty = useCallback((): boolean => {
    return rowsRef.current.some((r) => r._rowState !== "normal");
  }, []);

  const getVisibleData = useCallback((): T[] => {
    return rowsRef.current.map((r) => r.data);
  }, []);

  return {
    rows,
    setRows,
    setRawRows,
    addRow,
    copyRow,
    updateRow,
    refreshRow,
    markDeleted,
    cancelRow,
    getChanges,
    commitAll,
    isDirty,
    getVisibleData,
  };
}
