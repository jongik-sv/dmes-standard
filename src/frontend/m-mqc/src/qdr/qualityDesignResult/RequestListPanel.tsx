"use client";

/**
 * 왼쪽 「품질설계 의뢰현황」 — 의뢰(주문 행) 목록. 의뢰일 기준 최신순(서버 정렬). 행을 누르면 오른쪽에 설계결과를 연다.
 */
import { memo } from "react";

import { AgDataGrid, GridBadge, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

import { fmtThk, fmtWid } from "./format";
import type { DesignRow, DesignStatus } from "./types";

const STATUS_BADGE: Record<DesignStatus, { bg?: string; color?: string; muted?: boolean }> = {
  WAIT: { muted: true },
  ING: { bg: "var(--color-primary-soft)", color: "var(--color-primary)" },
  CONF: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  HOLD: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
};

export function StatusGridBadge({ status, label }: { status: DesignStatus; label: string }) {
  return <GridBadge label={label} {...(STATUS_BADGE[status] ?? { muted: true })} />;
}

const COLUMNS: GridColumn[] = [
  {
    key: "orderKey",
    header: "주문번호 · 행번",
    width: 3,
    minWidth: 150,
    align: "left",
    meta: false,
    render: (v, row) => {
      const r = row as unknown as DesignRow;
      return (
        <span title={`${r.prdLabel} · ${r.edge} · ${r.prdShp === "S" ? "S:Sheet" : "C:Coil"}`}>
          {String(v)}{" "}
          {r.urgent ? <GridBadge label="긴급" bg="var(--color-danger-soft)" color="var(--color-danger)" /> : null}
        </span>
      );
    },
  },
  { key: "spcAvr", header: "규격약호", width: 2, minWidth: 100, align: "left", meta: false },
  {
    key: "thk",
    header: "두께 × 폭",
    width: 2,
    minWidth: 110,
    align: "right",
    meta: false,
    render: (_v, row) => {
      const r = row as unknown as DesignRow;
      return `${fmtThk(r.thk)} × ${fmtWid(r.wid)}`;
    },
  },
  {
    key: "cusNm",
    header: "최종수요가",
    width: 2,
    minWidth: 90,
    align: "left",
    meta: false,
    render: (v, row) => <span title={`${(row as unknown as DesignRow).cusCd} · 의뢰 ${(row as unknown as DesignRow).reqDt}`}>{String(v ?? "")}</span>,
  },
  {
    key: "status",
    header: "설계상태",
    width: 1,
    minWidth: 74,
    align: "center",
    meta: false,
    render: (v, row) => <StatusGridBadge status={v as DesignStatus} label={(row as unknown as DesignRow).statusNm} />,
  },
];

export interface RequestListPanelProps {
  rows: DesignRow[];
  loading: boolean;
  selectedKey: string | null;
  onSelect: (orderKey: string) => void;
}

export const RequestListPanel = memo(function RequestListPanel({ rows, loading, selectedKey, onSelect }: RequestListPanelProps) {
  return (
    <GridPanel title="품질설계 의뢰현황" count={rows.length} loading={loading} titleExtra={<span className="mqc-qd-muted">의뢰일 기준 · 최신순</span>}>
      <AgDataGrid
        gridId="requests"
        rowKey="orderKey"
        columns={COLUMNS}
        data={rows as unknown as Record<string, unknown>[]}
        columnSizing="fit"
        highlightedRowKey={selectedKey}
        onRowClick={(row) => onSelect(String(row.orderKey))}
        loading={loading}
      />
    </GridPanel>
  );
});
