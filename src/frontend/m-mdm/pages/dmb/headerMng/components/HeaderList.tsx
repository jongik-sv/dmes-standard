"use client";

/** 헤더 목록(TSK-05-02 design.md §2, D-144 3단계) — 헤더 이름·EAI·인코딩·길이·항목 수·사용 전문 수·버전·상태. */
import type { ReactNode } from "react";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { empty } from "@/layout/styles";
import { versionStateLabel } from "@/layout/version-rows";
import { fmtVer } from "@/shell";
import type { HeaderRow } from "../types";

const COLUMNS: GridColumn[] = [
  { key: "LAYOUT_ID", header: "헤더 ID", width: 80, align: "center" },
  { key: "LAYOUT_NAME", header: "헤더 이름", width: 200 },
  { key: "EAI_CODE", header: "EAI", width: 90 },
  { key: "ENCODING", header: "인코딩", width: 80 },
  { key: "TOTAL_LENGTH", header: "길이", width: 70, align: "right" },
  { key: "ITEM_COUNT", header: "항목", width: 60, align: "right" },
  { key: "USED_BY_COUNT", header: "사용 전문", width: 80, align: "right" },
  { key: "HEADER_VER", header: "버전", width: 70, render: (v) => fmtVer(v as string | null) },
  { key: "HEADER_STATE", header: "상태", width: 70, render: (v) => versionStateLabel(v as string | null) },
];

export interface HeaderListProps {
  rows: HeaderRow[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (row: HeaderRow) => void;
  /** 제목 오른쪽 자리 — 첫 조회 상한 안내(GridLimitNotice). */
  titleExtra?: ReactNode;
}

export function HeaderList({ rows, selectedId, loading, onSelect, titleExtra }: HeaderListProps) {
  return (
    <GridPanel title="헤더 목록" count={rows.length} titleExtra={titleExtra}>
      {rows.length === 0 && !loading ? (
        <p data-testid="header-list-empty" style={empty}>조회된 헤더가 없습니다</p>
      ) : (
        <div data-testid="header-list" style={{ position: "absolute", inset: 0 }}>
          <AgDataGrid
            columnSizing="fit"
            columns={COLUMNS}
            data={rows as unknown as Record<string, unknown>[]}
            rowKey="LAYOUT_ID"
            highlightedRowKey={selectedId}
            loading={loading}
            emptyMessage="조회된 헤더가 없습니다"
            onRowClick={(r) => onSelect(r as unknown as HeaderRow)}
          />
        </div>
      )}
    </GridPanel>
  );
}
