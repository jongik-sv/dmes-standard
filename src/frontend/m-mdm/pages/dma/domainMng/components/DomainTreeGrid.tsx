"use client";

/** A-GRID 도메인 목록 — 들여쓰기 상속 트리(기능설계서 §3.2 G-001~G-008). 트리 그리드 선례가 없어 컬럼 render 로 그린다. */
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { indentLabel, typeLabel } from "../domain-tree";
import type { DomainRow } from "../types";
import { hint } from "./styles";

const KIND_LABEL: Record<string, string> = {
  QTY: "QTY 계량", CODE: "CODE 코드", ID: "ID 식별자", TEXT: "TEXT 문자", DATE: "DATE 날짜·시각", FLAG: "FLAG 고정값",
};

const COLUMNS: GridColumn[] = [
  {
    key: "DOMAIN_NAME", header: "도메인명", width: 200,
    render: (v, row) => (
      <span style={row.MATCHED === false ? { color: "var(--color-text-muted)" } : undefined}>
        {indentLabel(String(v ?? ""), Number(row.DEPTH ?? 0))}
      </span>
    ),
  },
  { key: "STD_NAME", header: "표준명", width: 140 },
  { key: "DOMAIN_KIND", header: "종류", width: 110, align: "center", render: (v) => KIND_LABEL[String(v)] ?? String(v ?? "") },
  { key: "LENGTH", header: "타입", width: 100, align: "center", render: (_v, row) => typeLabel(row as unknown as DomainRow) },
  {
    key: "UNIT_CODE", header: "단위", width: 70, align: "center",
    render: (v, row) => (row.PARENT_DOMAIN_ID != null && !v ? "(상속)" : String(v ?? "")),
  },
  {
    key: "STD_RULE", header: "자신의 표준식", width: 180,
    render: (v, row) => (row.DOMAIN_KIND === "CODE" ? "비움(코드 참조만)" : String(v ?? "")),
  },
  { key: "EFF_STD_EXPR", header: "유효 식(조립)", width: 260 },
  {
    key: "BIZ_RULE", header: "비즈니스식(요구 변수)", width: 180,
    render: (_v, row) => {
      const vars = (row.BIZ_REQUIRED_VARS as string[] | undefined) ?? [];
      return row.HAS_BIZ ? `있음${vars.length ? ` (${vars.join(", ")})` : ""}` : "-";
    },
  },
];

export interface DomainTreeGridProps {
  rows: DomainRow[];
  selectedId: number | null;
  loading: boolean;
  onSelect: (row: DomainRow) => void;
}

export function DomainTreeGrid({ rows, selectedId, loading, onSelect }: DomainTreeGridProps) {
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
          data={rows as unknown as Record<string, unknown>[]}
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
