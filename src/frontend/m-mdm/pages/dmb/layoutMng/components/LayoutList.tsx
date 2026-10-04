"use client";

/** 전문 목록(TSK-05-02 design.md §2, D-144 3단계) — 레이아웃 ID·전문 이름·송신→수신·헤더 구성·본문 항목 수·총 길이·현재 버전·DRAFT(소유자). */
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { lengthText } from "@/layout/layout-calc";
import { fmtVer } from "@/shell";
import type { LayoutRow } from "../types";

const COLUMNS: GridColumn[] = [
  { key: "LAYOUT_ID", header: "ID", width: 60, align: "center" },
  { key: "LAYOUT_NAME", header: "전문 이름", width: 170 },
  { key: "TOTAL_LENGTH", header: "총 길이", width: 70, align: "right", render: (v) => lengthText(v as number | null) },
  { key: "SND_SYSTEM", header: "송신→수신", width: 100, render: (_v, r) => `${r.SND_SYSTEM ?? "-"} → ${r.RCV_SYSTEM ?? "-"}` },
  { key: "HEADER_SUMMARY", header: "헤더 구성", width: 240 },
  { key: "ITEM_COUNT", header: "본문 항목", width: 70, align: "right" },
  { key: "CURRENT_VER", header: "현재 버전", width: 70, render: (v) => fmtVer(v as string | null) },
  { key: "DRAFT_VER", header: "DRAFT", width: 110,
    render: (v, r) => (v ? `${fmtVer(v as string)}${r.DRAFT_OWNER ? ` (${String(r.DRAFT_OWNER)})` : ""}` : "") },
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
      <div data-testid="layout-list" style={{ position: "absolute", inset: 0 }}>
        <AgDataGrid
          columnSizing="fit"
          columns={COLUMNS}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="LAYOUT_ID"
          highlightedRowKey={selectedId}
          loading={loading}
          emptyMessage="조회된 전문이 없습니다"
          emptyTestId="layout-list-empty"
          onRowClick={(r) => onSelect(r as unknown as LayoutRow)}
        />
      </div>
    </GridPanel>
  );
}
