"use client";

/**
 * @file MuiDataGrid.tsx
 * @description MUI DataGrid 기반 데이터 그리드 컴포넌트
 *
 * MUI X DataGrid를 사용하여 구현한 그리드입니다.
 * AG-Grid, CustomDataGrid와 동일한 Props 인터페이스를 제공하여 교체 사용이 가능합니다.
 *
 * 사용 전 패키지 설치 필요:
 * pnpm add @mui/x-data-grid @mui/material @emotion/react @emotion/styled
 */

import React, { useMemo, useCallback, useEffect, useRef, memo } from "react";
import { DataGrid as MuiGrid, GridRowParams, GridRowSelectionModel, GridColDef } from "@mui/x-data-grid";
import type { GridColumn } from "./AgDataGrid";

export interface MuiDataGridProps {
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

function MuiDataGridComponent({
  columns = [],
  data = [],
  rowKey = "id",
  height,
  selectable = false,
  multiSelect = false,
  selectedRows = [],
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
}: MuiDataGridProps) {
  const apiRef = useRef<{ scrollToIndexes: (params: { rowIndex: number }) => void } | null>(null);

  // 공통 columns 형식을 MUI DataGrid columns로 변환
  const muiColumns = useMemo<GridColDef[]>(() => {
    return columns.map((col) => {
      const colDef: GridColDef = {
        field: col.key,
        headerName: col.header,
        width: col.width ? parseInt(String(col.width), 10) : undefined,
        flex: col.width ? undefined : 1,
        sortable: sortable && col.sortable !== false,
        resizable: true,
        align: col.align || "left",
        headerAlign: col.headerAlign || "center",
        // 커스텀 렌더러
        renderCell: col.render
          ? (params: { value?: unknown; row: Record<string, unknown> }) => col.render!(params.value, params.row)
          : undefined,
        // 타입별 값 포맷터
        valueFormatter: !col.render
          ? (value: unknown) => {
              if (value == null) return "";
              switch (col.type) {
                case "number":
                  return typeof value === "number" ? value.toLocaleString() : String(value);
                case "boolean":
                  return value ? "Y" : "N";
                default:
                  return String(value);
              }
            }
          : undefined,
      };
      return colDef;
    });
  }, [columns, sortable]);

  // 데이터 정렬 (새로 추가된 행은 맨 아래)
  const processedRows = useMemo(() => {
    const addedRows = data.filter(
      (row) => row._status === "I" || row.nativeeditor_status === "inserted" || row.__isNew
    );
    const otherRows = data.filter(
      (row) => row._status !== "I" && row.nativeeditor_status !== "inserted" && !row.__isNew
    );
    return [...otherRows, ...addedRows];
  }, [data]);

  // 행 ID 가져오기
  const getRowId = useCallback(
    (row: Record<string, unknown>) => {
      return row[rowKey] || row.id;
    },
    [rowKey]
  );

  // 행 클릭 핸들러
  const handleRowClick = useCallback(
    (params: GridRowParams, event: React.MouseEvent) => {
      if (onRowClick) {
        onRowClick(params.row as Record<string, unknown>, event);
      }
    },
    [onRowClick]
  );

  // 행 더블클릭 핸들러
  const handleRowDoubleClick = useCallback(
    (params: GridRowParams, event: React.MouseEvent) => {
      if (onRowDoubleClick) {
        onRowDoubleClick(params.row as Record<string, unknown>, event);
      }
    },
    [onRowDoubleClick]
  );

  // 행 선택 핸들러
  const handleRowSelectionModelChange = useCallback(
    (newSelectionModel: GridRowSelectionModel) => {
      if (onRowSelect) {
        const selectedIds: (string | number)[] =
          newSelectionModel && typeof newSelectionModel === "object" && "ids" in newSelectionModel
            ? Array.from((newSelectionModel as { ids: Set<string | number> }).ids)
            : Array.isArray(newSelectionModel)
              ? newSelectionModel
              : [newSelectionModel as string | number];
        const selectedData = processedRows.filter((row) => selectedIds.includes(getRowId(row) as string | number));
        onRowSelect(selectedIds, selectedData.length === 1 ? selectedData[0] : selectedData);
      }
    },
    [onRowSelect, processedRows, getRowId]
  );

  // 행 스타일 (삭제된 행, 하이라이트 행 표시)
  const getRowClassName = useCallback(
    (params: GridRowParams) => {
      const row = params.row as Record<string, unknown>;
      const rowId = getRowId(row);
      const isDeleted = row.nativeeditor_status === "deleted" || row._status === "D";
      const isHighlighted = highlightedRowKey !== null && rowId === highlightedRowKey;

      const classes: string[] = [];
      if (isDeleted) classes.push("mui-row-deleted");
      if (isHighlighted) classes.push("mui-row-highlighted");

      return classes.join(" ");
    },
    [getRowId, highlightedRowKey]
  );

  // scrollToRow 처리
  useEffect(() => {
    if (!scrollToRow || !apiRef.current) return;

    const rowIndex = processedRows.findIndex((row) => getRowId(row) === scrollToRow);
    if (rowIndex !== -1) {
      apiRef.current.scrollToIndexes({ rowIndex });
    }
  }, [scrollToRow, processedRows, getRowId]);

  // 빈 데이터 오버레이 컴포넌트
  const NoRowsOverlay = useMemo(
    () =>
      function NoRowsOverlayComponent() {
        return (
          <div className="mui-grid-no-rows">
            <span>{emptyMessage}</span>
          </div>
        );
      },
    [emptyMessage]
  );

  // 로딩 오버레이 컴포넌트
  const LoadingOverlay = useMemo(
    () =>
      function LoadingOverlayComponent() {
        return (
          <div className="mui-grid-loading">
            <div className="loading-spinner"></div>
            <span>{loadingMessage}</span>
          </div>
        );
      },
    [loadingMessage]
  );

  return (
    <div
      className={`cm-mui-data-grid ${className}`.trim()}
      style={{ height: height || "100%", width: "100%" }}
      aria-label={ariaLabel || "데이터 목록"}
      aria-busy={loading}
    >
      <MuiGrid
        rows={processedRows}
        columns={muiColumns}
        getRowId={getRowId as (row: Record<string, unknown>) => string | number}
        loading={loading}
        // 선택 관련
        checkboxSelection={selectable}
        disableMultipleRowSelection={!multiSelect}
        rowSelectionModel={{ type: "include", ids: new Set(selectedRows) } as GridRowSelectionModel}
        onRowSelectionModelChange={handleRowSelectionModelChange}
        // 이벤트 핸들러
        onRowClick={handleRowClick}
        onRowDoubleClick={handleRowDoubleClick}
        // 스타일 관련
        getRowClassName={getRowClassName}
        rowHeight={28}
        columnHeaderHeight={32}
        // 기능 설정
        disableColumnMenu
        disableColumnFilter
        sortingMode="client"
        // 페이지네이션 비활성화 (전체 데이터 표시)
        hideFooter
        // 오버레이
        slots={{
          noRowsOverlay: NoRowsOverlay,
          loadingOverlay: LoadingOverlay,
        }}
        // 기타
        sx={{
          border: "none",
          "& .MuiDataGrid-cell:focus": {
            outline: "none",
          },
          "& .MuiDataGrid-cell:focus-within": {
            outline: "none",
          },
          "& .MuiDataGrid-columnHeader:focus": {
            outline: "none",
          },
          "& .MuiDataGrid-columnHeader:focus-within": {
            outline: "none",
          },
        }}
      />
    </div>
  );
}

export const MuiDataGrid = memo(MuiDataGridComponent);
