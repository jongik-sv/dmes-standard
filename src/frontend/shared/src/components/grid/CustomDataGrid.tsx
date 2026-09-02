"use client";

/**
 * @file CustomDataGrid.tsx
 * @description 완전 커스텀 데이터 그리드 컴포넌트 (라이브러리 없음)
 *
 * 외부 라이브러리 없이 순수 React로 구현한 경량 그리드입니다.
 * AG-Grid와 동일한 Props 인터페이스를 제공하여 교체 사용이 가능합니다.
 */

import "./grid.css";
import React, { useState, useMemo, useRef, useEffect, useCallback, memo } from "react";
import type { GridColumn } from "./AgDataGrid";

const EMPTY_SELECTED_ROWS: (string | number)[] = [];

export interface CustomDataGridProps {
  columns?: GridColumn[];
  data?: Record<string, unknown>[];
  rowKey?: string;
  height?: string | number;
  selectable?: boolean;
  multiSelect?: boolean;
  selectedRows?: (string | number)[];
  onRowSelect?: (selectedIds: (string | number)[], selectedData: Record<string, unknown> | Record<string, unknown>[]) => void;
  onRowClick?: (row: Record<string, unknown>, event: React.MouseEvent) => void;
  onRowDoubleClick?: (row: Record<string, unknown>, event: React.MouseEvent) => void;
  sortable?: boolean;
  emptyMessage?: string;
  className?: string;
  highlightedRowKey?: string | number | null;
  scrollToRow?: string | number | null;
  loading?: boolean;
  loadingMessage?: string;
  ariaLabel?: string;
}

interface SortConfig {
  key: string | null;
  direction: "asc" | "desc";
}

function CustomDataGridComponent({
  columns = [],
  data = [],
  rowKey = "id",
  height,
  selectable = false,
  multiSelect = false,
  selectedRows = EMPTY_SELECTED_ROWS,
  onRowSelect,
  onRowClick,
  onRowDoubleClick,
  sortable = true,
  emptyMessage = "데이터가 없습니다.",
  className = "",
  highlightedRowKey = null,
  scrollToRow = null,
  loading = false,
  loadingMessage = "조회 중...",
  ariaLabel,
}: CustomDataGridProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: "asc" });
  const [internalSelectedRows, setInternalSelectedRows] = useState<(string | number)[]>(selectedRows);

  // 외부 selectedRows가 변경되면 내부 상태 업데이트
  useEffect(() => {
    setInternalSelectedRows(selectedRows);
  }, [selectedRows]);

  // 데이터 정렬 (새로 추가된 행은 맨 아래)
  const processedData = useMemo(() => {
    const addedRows = data.filter((row) => row.nativeeditor_status === "inserted");
    const otherRows = data.filter((row) => row.nativeeditor_status !== "inserted");
    return [...otherRows, ...addedRows];
  }, [data]);

  // 정렬된 데이터
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return processedData;

    const sorted = [...processedData].sort((a, b) => {
      const aValue = a[sortConfig.key!];
      const bValue = b[sortConfig.key!];

      // null/undefined 처리
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // 숫자 비교
      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortConfig.direction === "asc" ? aValue - bValue : bValue - aValue;
      }

      // 문자열 비교
      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [processedData, sortConfig]);

  // 정렬 핸들러
  const handleSort = useCallback(
    (columnKey: string) => {
      if (!sortable) return;

      const column = columns.find((col) => col.key === columnKey);
      if (column?.sortable === false) return;

      setSortConfig((prev) => {
        if (prev.key === columnKey) {
          // 같은 컬럼 클릭: asc → desc → none
          if (prev.direction === "asc") {
            return { key: columnKey, direction: "desc" };
          } else if (prev.direction === "desc") {
            return { key: null, direction: "asc" };
          }
        }
        return { key: columnKey, direction: "asc" };
      });
    },
    [sortable, columns]
  );

  // scrollToRow가 변경되면 해당 행으로 스크롤
  useEffect(() => {
    if (!scrollToRow || !bodyRef.current) return;

    const rowElement = bodyRef.current.querySelector(`[data-row-key="${scrollToRow}"]`);
    if (rowElement) {
      rowElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [scrollToRow, sortedData]);

  // 행 클릭 핸들러
  const handleRowClick = useCallback(
    (row: Record<string, unknown>, event: React.MouseEvent) => {
      if (onRowClick) {
        onRowClick(row, event);
      }
    },
    [onRowClick]
  );

  // 행 더블클릭 핸들러
  const handleRowDoubleClick = useCallback(
    (row: Record<string, unknown>, event: React.MouseEvent) => {
      if (onRowDoubleClick) {
        onRowDoubleClick(row, event);
      }
    },
    [onRowDoubleClick]
  );

  // 체크박스 변경 핸들러
  const handleCheckboxChange = useCallback(
    (row: Record<string, unknown>, checked: boolean) => {
      const rowId = row[rowKey] as string | number;
      let newSelectedRows: (string | number)[];

      if (multiSelect) {
        if (checked) {
          newSelectedRows = [...internalSelectedRows, rowId];
        } else {
          newSelectedRows = internalSelectedRows.filter((id) => id !== rowId);
        }
      } else {
        newSelectedRows = checked ? [rowId] : [];
      }

      setInternalSelectedRows(newSelectedRows);

      if (onRowSelect) {
        const selectedData = sortedData.filter((r) => newSelectedRows.includes(r[rowKey] as string | number));
        onRowSelect(newSelectedRows, selectedData.length === 1 ? selectedData[0] : selectedData);
      }
    },
    [rowKey, multiSelect, internalSelectedRows, onRowSelect, sortedData]
  );

  // 전체 선택 핸들러
  const handleSelectAll = useCallback(
    (checked: boolean) => {
      let newSelectedRows: (string | number)[];

      if (checked) {
        newSelectedRows = sortedData.map((row) => row[rowKey] as string | number);
      } else {
        newSelectedRows = [];
      }

      setInternalSelectedRows(newSelectedRows);

      if (onRowSelect) {
        const selectedData = checked ? sortedData : [];
        onRowSelect(newSelectedRows, selectedData);
      }
    },
    [sortedData, rowKey, onRowSelect]
  );

  // 전체 선택 상태
  const isAllSelected = useMemo(() => {
    return sortedData.length > 0 && internalSelectedRows.length === sortedData.length;
  }, [sortedData, internalSelectedRows]);

  const isIndeterminate = useMemo(() => {
    return internalSelectedRows.length > 0 && internalSelectedRows.length < sortedData.length;
  }, [sortedData, internalSelectedRows]);

  // 값 포맷팅
  const formatValue = useCallback((value: unknown, column: GridColumn): React.ReactNode => {
    if (value == null) return "";

    switch (column.type) {
      case "number":
        return typeof value === "number" ? value.toLocaleString() : String(value);
      case "boolean":
        return value ? "Y" : "N";
      default:
        return String(value);
    }
  }, []);

  // 행 스타일 결정
  const getRowClassName = useCallback(
    (row: Record<string, unknown>) => {
      const rowId = row[rowKey] as string | number;
      const isDeleted = row.nativeeditor_status === "deleted";
      const isHighlighted = highlightedRowKey !== null && rowId === highlightedRowKey;
      const isSelected = internalSelectedRows.includes(rowId);

      const classes = ["cm-custom-grid-row"];
      if (isDeleted) classes.push("row-deleted");
      if (isHighlighted) classes.push("row-highlighted");
      if (isSelected) classes.push("row-selected");

      return classes.join(" ");
    },
    [rowKey, highlightedRowKey, internalSelectedRows]
  );

  // 컬럼 너비 계산
  const totalFixedWidth = useMemo(() => {
    return columns.reduce((sum, col) => sum + (typeof col.width === "number" ? col.width : 0), 0) + (selectable ? 40 : 0);
  }, [columns, selectable]);

  return (
    <div
      className={`cm-custom-data-grid ${className}`.trim()}
      style={{ height: height || "100%" }}
      aria-label={ariaLabel || "데이터 목록"}
      aria-busy={loading}
    >
      {/* 헤더 */}
      <div className="cm-custom-grid-header">
        <div className="cm-custom-grid-header-row" style={{ minWidth: totalFixedWidth || "auto" }}>
          {/* 선택 체크박스 컬럼 */}
          {selectable && (
            <div className="cm-custom-grid-header-cell cm-custom-grid-checkbox-cell">
              {multiSelect && (
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = isIndeterminate;
                  }}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              )}
            </div>
          )}

          {/* 데이터 컬럼 헤더 */}
          {columns.map((col) => {
            const isSortable = sortable && col.sortable !== false;
            const isSorted = sortConfig.key === col.key;

            return (
              <div
                key={col.key}
                className={`cm-custom-grid-header-cell ${isSortable ? "sortable" : ""} ${isSorted ? "sorted" : ""}`}
                style={{
                  width: col.width || "auto",
                  minWidth: col.width || "auto",
                  flex: col.width ? "none" : 1,
                  textAlign: col.headerAlign || "center",
                }}
                onClick={() => isSortable && handleSort(col.key)}
              >
                <span className="header-text">{col.header}</span>
                {isSortable && (
                  <span className="sort-indicator">{isSorted && (sortConfig.direction === "asc" ? "▲" : "▼")}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 바디 */}
      <div className="cm-custom-grid-body" ref={bodyRef}>
        {/* 로딩 오버레이 */}
        {loading && (
          <div className="cm-custom-grid-loading">
            <div className="loading-spinner"></div>
            <span>{loadingMessage}</span>
          </div>
        )}

        {/* 빈 데이터 메시지 */}
        {!loading && sortedData.length === 0 && (
          <div className="cm-custom-grid-empty">
            <span>{emptyMessage}</span>
          </div>
        )}

        {/* 데이터 행 */}
        {!loading &&
          sortedData.map((row) => {
            const rowId = row[rowKey] as string | number;
            const isChecked = internalSelectedRows.includes(rowId);

            return (
              <div
                key={rowId}
                data-row-key={rowId}
                className={getRowClassName(row)}
                style={{ minWidth: totalFixedWidth || "auto" }}
                onClick={(e) => handleRowClick(row, e)}
                onDoubleClick={(e) => handleRowDoubleClick(row, e)}
              >
                {/* 선택 체크박스 */}
                {selectable && (
                  <div className="cm-custom-grid-cell cm-custom-grid-checkbox-cell">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        e.stopPropagation();
                        handleCheckboxChange(row, e.target.checked);
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                )}

                {/* 데이터 셀 */}
                {columns.map((col) => {
                  const value = row[col.key];
                  const displayValue = col.render ? col.render(value, row) : formatValue(value, col);

                  return (
                    <div
                      key={col.key}
                      className="cm-custom-grid-cell"
                      style={{
                        width: col.width || "auto",
                        minWidth: col.width || "auto",
                        flex: col.width ? "none" : 1,
                        textAlign: col.align || "left",
                      }}
                    >
                      {displayValue}
                    </div>
                  );
                })}
              </div>
            );
          })}
      </div>
    </div>
  );
}

export const CustomDataGrid = memo(CustomDataGridComponent);
