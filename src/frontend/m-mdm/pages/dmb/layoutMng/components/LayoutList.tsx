"use client";

/** 전문 목록(TSK-05-02 design.md §2) — 레이아웃 ID·전문 이름·송신→수신·헤더 구성·본문 항목 수·총 길이·버전. */
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { empty } from "@/layout/styles";
import type { LayoutRow } from "../types";

const COLUMNS: GridColumn[] = [
  { key: "LAYOUT_ID", header: "ID", width: 60, align: "center" },
  { key: "LAYOUT_NAME", header: "전문 이름", width: 170 },
  { key: "TOTAL_LENGTH", header: "총 길이", width: 70, align: "right" },
  { key: "SND_SYSTEM", header: "송신→수신", width: 100, render: (_v, r) => `${r.SND_SYSTEM ?? "-"} → ${r.RCV_SYSTEM ?? "-"}` },
  { key: "HEADER_SUMMARY", header: "헤더 구성", width: 240 },
  { key: "ITEM_COUNT", header: "본문 항목", width: 70, align: "right" },
  { key: "LAYOUT_VERSION", header: "버전", width: 50, align: "right" },
];

export interface LayoutListProps {
  rows: LayoutRow[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (row: LayoutRow) => void;
}

export function LayoutList({ rows, selectedId, loading, onSelect }: LayoutListProps) {
  return (
    <GridPanel title="전문 목록" count={rows.length}>
      {rows.length === 0 && !loading ? (
        <p data-testid="layout-list-empty" style={empty}>조회된 전문이 없습니다</p>
      ) : (
        <div data-testid="layout-list" style={{ position: "absolute", inset: 0 }}>
          <AgDataGrid
            columnSizing="fit"
            columns={COLUMNS}
            data={rows as unknown as Record<string, unknown>[]}
            rowKey="LAYOUT_ID"
            height={260}
            highlightedRowKey={selectedId}
            loading={loading}
            emptyMessage="조회된 전문이 없습니다"
            onRowClick={(r) => onSelect(r as unknown as LayoutRow)}
          />
        </div>
      )}
    </GridPanel>
  );
}
