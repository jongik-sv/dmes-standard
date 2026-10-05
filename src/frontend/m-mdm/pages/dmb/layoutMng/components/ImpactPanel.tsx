"use client";

/**
 * 컬럼·도메인 변경 영향 전문 목록(TSK-05-03 design.md §2·§6.7) — 컬럼 표준 물리명이나 도메인 표준명·이름으로 찾는다. 그 컬럼을 쓰는
 * 전문과 상대 시스템, 헤더면 사용 전문 수가 보이고, 안 쓰는 컬럼은 "레이아웃에서 쓰지 않는다" 한 줄로 보인다(03:48).
 */
import { useMemo, useState } from "react";
import { Button, Input } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { ColumnPhysName } from "@/column-info";
import { fmtVer } from "@/shell";
import { hint, row, sectionTitle } from "@/layout/styles";
import type { ImpactRow } from "../types";
import { uiCols } from "@/ui-meta";

const COLUMNS: GridColumn[] = uiCols([
  { key: "COLUMN_PHYS", header: "컬럼", width: 130, render: (v) => <ColumnPhysName physName={v as string | null} /> },
  { key: "LAYOUT_NAME", header: "레이아웃", width: 190, render: (v, r) => (v == null ? "(없음)" : `${v}${r.LAYOUT_KIND === "HEADER" ? " (헤더)" : ""}`) },
  { key: "VER", header: "버전", width: 70, render: (v) => fmtVer(v as string | null) },
  { key: "VER_STATE", header: "버전 상태", width: 80,
    render: (v) => ({ CURRENT: "현재", FUTURE: "적용 예정", DRAFT: "작성 중" } as Record<string, string>)[v as string] ?? "" },
  { key: "ITEM", header: "항목", width: 190, render: (v) => (v == null ? "-" : String(v)) },
  { key: "SND_RCV", header: "송신 → 수신", width: 100, render: (v, r) => (v == null ? (r.USED_BY_COUNT != null ? `사용 전문 ${r.USED_BY_COUNT}` : "-") : String(v)) },
  { key: "IMPACT", header: "영향", width: 260 },
], ["COLUMN_PHYS", "LAYOUT_NAME"]);

export interface ImpactPanelProps {
  rows: ImpactRow[] | null;
  loading: boolean;
  onSearch: (keyword: string) => void;
}

export function ImpactPanel({ rows, loading, onSearch }: ImpactPanelProps) {
  const [keyword, setKeyword] = useState("");
  // 검색어 입력 한 글자마다 행 배열을 새로 만들지 않는다.
  const data = useMemo(
    () => (rows ?? []).map((r, i) => ({ ...r, ROW_KEY: i })) as unknown as Record<string, unknown>[],
    [rows],
  );
  return (
    <div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>영향 전문</p>
      <div style={row}>
        <Input data-testid="impact-keyword" aria-label="영향도 검색어" placeholder="컬럼 표준 물리명 또는 도메인 표준명·이름" value={keyword}
          onChange={setKeyword}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSearch(keyword);
          }} />
        <Button data-testid="impact-search" size="sm" disabled={loading} onClick={() => onSearch(keyword)}>조회</Button>
        <span style={hint}>도메인을 좁히거나 컬럼을 바꾸기 전에 그 컬럼을 쓰는 전문과 상대 시스템을 봅니다.</span>
      </div>
      {/* 아직 조회 전(rows == null)이면 그리드는 마운트한 채 숨긴다 — 0건이면 빈 문구, 조회 전엔 아무것도 안 보인다. */}
      <div data-testid="impact-list" style={rows == null ? { display: "none" } : undefined}>
        <AgDataGrid
          columnSizing="fit"
          columns={COLUMNS}
          data={data}
          rowKey="ROW_KEY"
          height={180}
          loading={loading}
          emptyMessage="찾은 컬럼·도메인이 없습니다"
          emptyTestId="impact-list-empty"
        />
      </div>
    </div>
  );
}
