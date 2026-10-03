"use client";

/** A-GRID 도메인 목록 — 들여쓰기 상속 트리(기능설계서 §3.2 G-001~G-008). 트리 그리드 선례가 없어 컬럼 render 로 그린다. */
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { useMemo } from "react";

import { DIMMED_MARK, toGridRows } from "../domain-tree";
import type { DomainRow } from "../types";
import { hint } from "./styles";

const KIND_LABEL: Record<string, string> = {
  QTY: "QTY 계량", CODE: "CODE 코드", ID: "ID 식별자", TEXT: "TEXT 문자", DATE: "DATE 날짜·시각", FLAG: "FLAG 고정값",
};

// 칸 값은 toGridRows 가 만든 표시 문자열(_NAME 등) — 다른 칸에서 파생되는 표시를 render 로 그리면 같은 행 키로 다시 조회할 때 갱신되지 않는다.
const COLUMNS: GridColumn[] = [
  {
    key: "_NAME", header: "도메인명", width: 200,
    render: (v) => {
      const text = String(v ?? "");
      const dimmed = text.endsWith(DIMMED_MARK);
      return <span style={dimmed ? { color: "var(--color-text-muted)" } : undefined}>{dimmed ? text.slice(0, -1) : text}</span>;
    },
  },
  { key: "STD_NAME", header: "표준명", width: 140 },
  { key: "DOMAIN_KIND", header: "종류", width: 110, align: "center", render: (v) => KIND_LABEL[String(v)] ?? String(v ?? "") },
  { key: "_TYPE", header: "타입", width: 100, align: "center" },
  { key: "_UNIT", header: "단위", width: 70, align: "center" },
  { key: "_STD", header: "자신의 표준식", width: 180 },
  { key: "EFF_STD_EXPR", header: "유효 식(조립)", width: 260 },
  { key: "_BIZ", header: "비즈니스식(요구 변수)", width: 180 },
];

export interface DomainTreeGridProps {
  rows: DomainRow[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (row: DomainRow) => void;
}

export function DomainTreeGrid({ rows, selectedId, loading, onSelect }: DomainTreeGridProps) {
  const gridRows = useMemo(() => toGridRows(rows), [rows]);
  return (
    <GridPanel title="도메인 목록" count={rows.length}>
      <span className="domain-mng__count" style={hint}>{`도메인 ${rows.length}건`}</span>
      {rows.length === 0 && !loading ? (
        <p className="domain-mng__empty" style={{ padding: "var(--spacing-md)", color: "var(--color-text-muted)" }}>
          조회된 도메인이 없습니다
        </p>
      ) : (
        <AgDataGrid
          columnSizing="fit"
          columns={COLUMNS}
          data={gridRows as unknown as Record<string, unknown>[]}
          rowKey="DOMAIN_ID"
          highlightedRowKey={selectedId}
          loading={loading}
          loadingMessage="조회 중..."
          emptyMessage="조회된 도메인이 없습니다"
          onRowClick={(row) => onSelect(row as unknown as DomainRow)}
        />
      )}
    </GridPanel>
  );
}
