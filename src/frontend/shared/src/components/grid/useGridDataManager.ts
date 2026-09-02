"use client";

/**
 * @file useGridDataManager.ts
 * @description 그리드 데이터 관리 공통 훅 (nativeeditor_status 기반)
 *
 * dmes_react 패턴을 따름:
 * - nativeeditor_status: "" (변경없음) | "inserted" (신규) | "updated" (수정) | "deleted" (삭제표시)
 * - 저장 시 status가 있는 행만 모아서 saveHandler에 전달
 * - 삭제 시 기존행은 줄긋기 표시, 신규행은 즉시 제거
 * - 행취소로 모든 변경 원복 가능
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { GRID_TEMP_ID_FIELD } from "./GridPanel";

const TEMP_ROW_PREFIX = "__new_";

export const ROW_STATUS = {
  NONE: "" as const,
  INSERTED: "inserted" as const,
  UPDATED: "updated" as const,
  DELETED: "deleted" as const,
};

function isTempId(value: string | number | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(TEMP_ROW_PREFIX);
}

function resolveRowId(row: Record<string, unknown>, rowKey: string): string | number {
  const tempId = row[GRID_TEMP_ID_FIELD];
  if (typeof tempId === "string" && tempId.startsWith(TEMP_ROW_PREFIX)) {
    return tempId;
  }
  return (row[rowKey] as string | number) ?? "";
}

function stripInternalFields(row: Record<string, unknown>): Record<string, unknown> {
  const cleaned = { ...row };
  delete cleaned[GRID_TEMP_ID_FIELD];
  return cleaned;
}

export interface SavePayload {
  inserted: Record<string, unknown>[];
  updated: Record<string, unknown>[];
  deleted: Record<string, unknown>[];
  totalChanges: number;
}

export interface UseGridDataManagerOptions<T extends Record<string, unknown>> {
  rowKey?: string;
  emptyForm: Partial<T>;
  rowToForm: (row: Record<string, unknown>) => Partial<T>;
  formFieldToRow?: (field: string, value: unknown) => Record<string, unknown>;
  formDefaultsToRow?: () => Record<string, unknown>;
  saveHandler?: (payload: SavePayload) => Promise<void>;
  onSaveSuccess?: () => void | Promise<void>;
}

export interface GridDataManager<T extends Record<string, unknown>> {
  rows: Record<string, unknown>[];
  setRows: (data: Record<string, unknown>[]) => void;
  selectedRowKey: string | number | null;
  isNewRow: boolean;
  formData: Partial<T>;
  handleFormChange: (field: string, value: unknown) => void;
  handleRowClick: (rowId: string | number) => void;
  handleGridDataChange: (newData: Record<string, unknown>[], addedRowKey?: string) => void;
  handleDeleteRow: () => void;
  handleCopyRow: () => void;
  handleSave: () => Promise<void>;
  handleCancel: () => void;
  hasChanges: boolean;
  isSaving: boolean;
  saveError: string | null;
  dismissSaveError: () => void;
  isFormDisabled: boolean;
  scrollToRowKey: string | number | null;
  defaultRowValues: Record<string, unknown>;
}

export function useGridDataManager<T extends Record<string, unknown>>(
  options: UseGridDataManagerOptions<T>
): GridDataManager<T> {
  const { rowKey = "id", emptyForm, rowToForm, formFieldToRow, formDefaultsToRow, saveHandler, onSaveSuccess } = options;

  const [rows, setRowsState] = useState<Record<string, unknown>[]>([]);
  const [selectedRowKey, setSelectedRowKey] = useState<string | number | null>(null);
  const [isNewRow, setIsNewRow] = useState(false);
  const [formData, setFormData] = useState<Partial<T>>(emptyForm);
  const [scrollToRowKey, setScrollToRowKey] = useState<string | number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /** 원본 데이터 (조회 시점 스냅샷, 행취소 시 사용) */
  const originalRows = useRef<Record<string, unknown>[]>([]);

  const defaultRowValues = useMemo(
    () => formDefaultsToRow ? formDefaultsToRow() : {},
    [formDefaultsToRow]
  );

  /** 조회 결과 세팅 (원본 저장 + status 초기화) */
  const setRows = useCallback(
    (data: Record<string, unknown>[]) => {
      const cleaned = data.map((row) => ({ ...row, nativeeditor_status: ROW_STATUS.NONE }));
      setRowsState(cleaned);
      originalRows.current = cleaned.map((row) => ({ ...row }));
      setSelectedRowKey(null);
      setIsNewRow(false);
      setFormData({ ...emptyForm });
    },
    [emptyForm]
  );

  /** 행 클릭 */
  const handleRowClick = useCallback(
    (rowId: string | number) => {
      const isTemp = isTempId(rowId);
      setSelectedRowKey(rowId);
      setIsNewRow(isTemp);
      setScrollToRowKey(null);
      setRowsState((prev) => {
        const row = prev.find((r) => resolveRowId(r, rowKey) === rowId);
        if (row) {
          setFormData(rowToForm(row) as Partial<T>);
        }
        return prev;
      });
    },
    [rowKey, rowToForm]
  );

  /** 폼 필드 변경 → 그리드 데이터 실시간 반영 + status 변경 */
  const handleFormChange = useCallback(
    (field: string, value: unknown) => {
      setFormData((prev) => ({ ...prev, [field]: value }));

      if (selectedRowKey == null) return;

      const rowUpdates = formFieldToRow ? formFieldToRow(field, value) : { [field]: value };

      setRowsState((prev) =>
        prev.map((row) => {
          if (resolveRowId(row, rowKey) !== selectedRowKey) return row;
          const currentStatus = row.nativeeditor_status as string;
          // inserted는 그대로 유지, 나머지는 updated로
          const nextStatus = currentStatus === ROW_STATUS.INSERTED
            ? ROW_STATUS.INSERTED
            : ROW_STATUS.UPDATED;
          return { ...row, ...rowUpdates, nativeeditor_status: nextStatus };
        })
      );
    },
    [selectedRowKey, rowKey, formFieldToRow]
  );

  /** GridPanel onDataChange (행추가/행삭제) */
  const handleGridDataChange = useCallback(
    (newData: Record<string, unknown>[], addedRowKey?: string) => {
      if (addedRowKey) {
        // 행추가: newData에서 새 행만 추출하여 기존 rows에 추가 (stale data 덮어쓰기 방지)
        const addedRow = newData.find((row) => resolveRowId(row, rowKey) === addedRowKey);
        if (addedRow) {
          const newRow = { ...addedRow, ...defaultRowValues, nativeeditor_status: ROW_STATUS.INSERTED };
          setRowsState((prev) => [...prev, newRow]);
        }
        setSelectedRowKey(addedRowKey);
        setFormData({ ...emptyForm });
        setIsNewRow(true);
        setScrollToRowKey(addedRowKey);
      } else {
        // 행삭제 (GridPanel에서 호출): newData 에서 빠진 row 가 INSERTED(미저장 신규) 면 그대로 사라지게,
        // 기존 row 면 deleted 마킹해서 다시 포함 (저장 시 deleted payload 로 BE 전달).
        setRowsState((prev) => {
          const newKeys = new Set(newData.map((r) => resolveRowId(r, rowKey)));
          const deletedRows = prev
            .filter((r) => !newKeys.has(resolveRowId(r, rowKey)))
            .filter((r) => r.nativeeditor_status !== ROW_STATUS.INSERTED)
            .map((r) => ({ ...r, nativeeditor_status: ROW_STATUS.DELETED }));
          return [...newData, ...deletedRows];
        });
        setSelectedRowKey(null);
        setIsNewRow(false);
        setFormData({ ...emptyForm });
        setScrollToRowKey(null);
      }
    },
    [emptyForm, rowKey, defaultRowValues]
  );

  /** 행삭제 (nativeeditor_status 기반) - GridPanel 대신 이 함수를 사용 권장 */
  const handleDeleteRow = useCallback(() => {
    if (selectedRowKey == null) return;

    setRowsState((prev) => {
      const targetRow = prev.find((r) => resolveRowId(r, rowKey) === selectedRowKey);
      if (!targetRow) return prev;

      const status = targetRow.nativeeditor_status as string;

      if (status === ROW_STATUS.INSERTED) {
        // 신규행: 즉시 제거
        return prev.filter((r) => resolveRowId(r, rowKey) !== selectedRowKey);
      }

      // 기존행: deleted 표시 (줄긋기)
      return prev.map((r) =>
        resolveRowId(r, rowKey) === selectedRowKey
          ? { ...r, nativeeditor_status: ROW_STATUS.DELETED }
          : r
      );
    });

    setSelectedRowKey(null);
    setIsNewRow(false);
    setFormData({ ...emptyForm });
  }, [selectedRowKey, rowKey, emptyForm]);

  /**
   * 행복사: 선택된 행의 모든 필드를 복제해 신규(INSERTED) row 로 추가.
   * PK 자리는 tempId 로 채워 사용자가 직접 새 PK 입력. 복사된 row 가 자동 선택 + 신규 모드.
   */
  const handleCopyRow = useCallback(() => {
    if (selectedRowKey == null) return;

    const tempId = `${TEMP_ROW_PREFIX}copy_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    setRowsState((prev) => {
      const targetRow = prev.find((r) => resolveRowId(r, rowKey) === selectedRowKey);
      if (!targetRow) return prev;

      const copied: Record<string, unknown> = {
        ...targetRow,
        [rowKey]: tempId,
        [GRID_TEMP_ID_FIELD]: tempId,
        nativeeditor_status: ROW_STATUS.INSERTED,
      };
      return [...prev, copied];
    });

    setSelectedRowKey(tempId);
    setIsNewRow(true);
    setScrollToRowKey(tempId);
    setFormData({ ...emptyForm });
  }, [selectedRowKey, rowKey, emptyForm]);

  /** 행취소: 모든 변경 원복 */
  const handleCancel = useCallback(() => {
    setRowsState(originalRows.current.map((row) => ({ ...row })));
    setSelectedRowKey(null);
    setIsNewRow(false);
    setFormData({ ...emptyForm });
    setScrollToRowKey(null);
  }, [emptyForm]);

  /** 변경 사항 존재 여부 */
  const hasChanges = useMemo(
    () => rows.some((row) => (row.nativeeditor_status as string) !== ROW_STATUS.NONE),
    [rows]
  );

  /** 저장: status가 있는 행만 모아서 saveHandler에 전달 */
  const handleSave = useCallback(async () => {
    if (!saveHandler) return;

    const inserted = rows
      .filter((r) => r.nativeeditor_status === ROW_STATUS.INSERTED)
      .map(stripInternalFields);
    const updated = rows
      .filter((r) => r.nativeeditor_status === ROW_STATUS.UPDATED)
      .map(stripInternalFields);
    const deleted = rows
      .filter((r) => r.nativeeditor_status === ROW_STATUS.DELETED)
      .map(stripInternalFields);

    const totalChanges = inserted.length + updated.length + deleted.length;
    if (totalChanges === 0) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await saveHandler({ inserted, updated, deleted, totalChanges });
      if (onSaveSuccess) {
        await onSaveSuccess();
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "저장에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }, [rows, saveHandler, onSaveSuccess]);

  const dismissSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  const isFormDisabled = useMemo(() => !isNewRow && selectedRowKey == null, [isNewRow, selectedRowKey]);

  return {
    rows,
    setRows,
    selectedRowKey,
    isNewRow,
    formData,
    handleFormChange,
    handleRowClick,
    handleGridDataChange,
    handleDeleteRow,
    handleCopyRow,
    handleSave,
    handleCancel,
    hasChanges,
    isSaving,
    saveError,
    dismissSaveError,
    isFormDisabled,
    scrollToRowKey,
    defaultRowValues,
  };
}
