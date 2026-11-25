"use client";

/**
 * 검증 케이스 목록 — 상태(PASS·경고·FAIL·미실행), 케이스 ID, 이름. 행을 누르면 그 케이스를 열고 실행한다.
 */
import { memo } from "react";

import { AgDataGrid, GridBadge, GridPanel, type GridButton, type GridColumn } from "@dk-oasis/shared/grid";

import type { CaseRow, CaseStatus } from "./types";

const BADGE: Record<CaseStatus, { bg?: string; color?: string; muted?: boolean }> = {
  NOT_RUN: { muted: true },
  PASS: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  WARN: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  FAIL: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

export function CaseStatusBadge({ status, label }: { status: CaseStatus; label: string }) {
  return <GridBadge label={label} {...(BADGE[status] ?? { muted: true })} />;
}

const COLUMNS: GridColumn[] = [
  {
    key: "status",
    header: "상태",
    width: 1,
    minWidth: 64,
    align: "center",
    meta: false,
    render: (v, row) => <CaseStatusBadge status={v as CaseStatus} label={String((row as unknown as CaseRow).statusNm ?? v)} />,
  },
  { key: "caseId", header: "케이스", width: 1, minWidth: 70, align: "left", meta: false },
  {
    key: "caseNm",
    header: "이름",
    width: 4,
    minWidth: 140,
    align: "left",
    meta: false,
    render: (v, row) => <span title={(row as unknown as CaseRow).baseOrdRef ?? ""}>{String(v ?? "")}</span>,
  },
];

export interface CaseListPanelProps {
  rows: CaseRow[];
  loading: boolean;
  selectedId: string | null;
  busy: boolean;
  onSelect: (caseId: string) => void;
  onNew: () => void;
  onRunAll: () => void;
}

export const CaseListPanel = memo(function CaseListPanel({ rows, loading, selectedId, busy, onSelect, onNew, onRunAll }: CaseListPanelProps) {
  const buttons: GridButton[] = [
    { id: "btn_case_new", label: "＋ 신규", onClick: onNew, disabled: busy },
    { id: "btn_case_run_all", label: "전체 재실행", onClick: onRunAll, disabled: busy || rows.length === 0 },
  ];
  return (
    <GridPanel title="검증 케이스" count={rows.length} loading={loading} buttons={buttons}>
      <AgDataGrid
        gridId="cases"
        rowKey="caseId"
        columns={COLUMNS}
        data={rows as unknown as Record<string, unknown>[]}
        columnSizing="fit"
        highlightedRowKey={selectedId}
        onRowClick={(row) => onSelect(String(row.caseId))}
        loading={loading}
      />
    </GridPanel>
  );
});
