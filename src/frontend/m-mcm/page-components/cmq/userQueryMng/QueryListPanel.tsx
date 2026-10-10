"use client";

/**
 * 쿼리 정의 목록(왼쪽 패널) — 스펙 2026-10-10-user-query-program-design §8.2.
 * 열: 쿼리 ID, 이름, 분류, 담당 부서, 사용, 최대 행, 할당 수, 수정일시. 열 정의는 모듈 상수(화면 성능 가이드 R5).
 */
import { memo } from "react";

import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

import { uiCols } from "@/lib/ui-meta";

import type { QueryGridRow } from "./form-model";

const COLUMNS: GridColumn[] = uiCols([
  { key: "queryId", header: "쿼리 ID", width: 3, minWidth: 100, align: "left" },
  { key: "queryNm", header: "이름", width: 4, minWidth: 100, align: "left" },
  { key: "categoryNm", header: "분류", width: 2, minWidth: 56, align: "center" },
  { key: "moduleNm", header: "모듈", width: 2, minWidth: 70, align: "left" },
  { key: "ownerDeptNm", header: "담당 부서", width: 2, minWidth: 80, align: "left" },
  {
    key: "useYn",
    header: "사용",
    width: 1,
    minWidth: 56,
    align: "center",
    render: (v) =>
      v === "N" ? (
        <GridBadge label="미사용" muted />
      ) : (
        <GridBadge label="사용" bg="var(--color-success-soft)" color="var(--color-success)" />
      ),
  },
  { key: "maxRowCnt", header: "최대 행", width: 1, minWidth: 60, align: "right", type: "number" },
  { key: "assignCnt", header: "할당 수", width: 1, minWidth: 60, align: "right", type: "number" },
  { key: "uAt", header: "수정일시", width: 3, minWidth: 110, align: "center" },
]);

export interface QueryListPanelProps {
  rows: readonly QueryGridRow[];
  selectedId: string;
  loading: boolean;
  loadFailed: boolean;
  onSelect: (row: QueryGridRow) => void;
}

export const QueryListPanel = memo(function QueryListPanel({ rows, selectedId, loading, loadFailed, onSelect }: QueryListPanelProps) {
  return (
    <GridPanel
      title="쿼리 목록"
      count={rows.length}
      titleExtra={
        loadFailed ? (
          <span className="form-error-message" role="alert" data-testid="userq-admin-load-error">
            목록을 불러오지 못했습니다. [조회]로 다시 시도하세요.
          </span>
        ) : null
      }
    >
      <AgDataGrid
        gridId="userQueryList"
        rowKey="queryId"
        columns={COLUMNS}
        data={rows as QueryGridRow[]}
        columnSizing="fit"
        highlightedRowKey={selectedId || null}
        onRowClick={(r) => onSelect(r as QueryGridRow)}
        loading={loading}
      />
    </GridPanel>
  );
});
