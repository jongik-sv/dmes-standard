"use client";

/**
 * 헤더 항목 그리드(TSK-05-02 design.md §2) — 순서(행 드래그)·항목명·표준 물리명·채움·기본값·오프셋·길이·위치. 오프셋은 이 헤더
 * 안 상대값이고 화면에서 즉시 계산한다(F8·불변 I11). 항목은 컬럼 사전 선택 또는 FILLER 로만 더한다(I5).
 */
import { useMemo } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { positionLabel } from "@/layout/layout-calc";
import { hint } from "@/layout/styles";
import type { LayoutItemRow } from "@/layout/types";

function columns(readOnly: boolean): GridColumn[] {
  return [
    { key: "SEQ", header: "순서", width: 70, align: "center", rowDrag: !readOnly },
    { key: "DISPLAY_NAME", header: "항목명", width: 150, render: (v, r) => (r.FILL_KIND === "FILLER" ? "FILLER" : String(v ?? "")) },
    { key: "COLUMN_PHYS", header: "표준 물리명", width: 140 },
    { key: "FILL_KIND", header: "채움", width: 80, align: "center" },
    { key: "DEFAULT_VALUE", header: "기본값", width: 110 },
    { key: "OFFSET", header: "오프셋", width: 70, align: "right" },
    { key: "LENGTH", header: "길이", width: 60, align: "right" },
    { key: "POSITION", header: "위치", width: 90, align: "center",
      render: (_v, r) => positionLabel(Number(r.OFFSET ?? 0), Number(r.LENGTH ?? 0)) },
  ];
}

export interface HeaderItemGridProps {
  rows: LayoutItemRow[];
  selectedKey: string | null;
  readOnly: boolean;
  onSelect: (key: string) => void;
  onAddColumn: () => void;
  onAddFiller: () => void;
  onDelete: () => void;
  onReorder: (keys: Array<string | number>) => void;
}

export function HeaderItemGrid(props: HeaderItemGridProps) {
  const { rows, selectedKey, readOnly } = props;
  const cols = useMemo(() => columns(readOnly), [readOnly]);
  return (
    <GridPanel title="헤더 항목" count={rows.length}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-xs)" }}>
        {!readOnly && (
          <>
            <Button data-testid="header-item-add-column" size="sm" onClick={props.onAddColumn}>+ 항목 추가</Button>
            <Button data-testid="header-item-add-filler" size="sm" onClick={props.onAddFiller}>+ FILLER</Button>
            <Button size="sm" disabled={!selectedKey} onClick={props.onDelete}>삭제</Button>
          </>
        )}
        <span style={hint}>오프셋은 이 헤더 안에서 0부터 셉니다. 행을 끌어 순서를 바꿉니다.</span>
      </div>
      <div data-testid="header-items">
        <AgDataGrid
          columnSizing="fit"
          columns={cols}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="KEY"
          height={260}
          highlightedRowKey={selectedKey}
          emptyMessage="헤더 항목이 없습니다"
          onRowClick={(r) => props.onSelect(String(r.KEY))}
          onRowOrderChange={readOnly ? undefined : props.onReorder}
        />
      </div>
    </GridPanel>
  );
}
