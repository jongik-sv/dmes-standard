"use client";

/**
 * 본문 항목 그리드(TSK-05-02 design.md §2) — 헤더 요약 줄 + 순서(행 드래그)·항목명·표준 물리명·fill_kind·도메인(파생)·설정·
 * 오프셋·길이·위치. 오프셋·위치는 화면 즉시 계산이다(불변 I11). 항목은 컬럼 사전 선택 또는 FILLER 로만 더한다(I5).
 */
import { useMemo } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";
import { derivedLabel } from "@/layout/LayoutItemDetail";
import { positionLabel } from "@/layout/layout-calc";
import { hint } from "@/layout/styles";
import type { LayoutItemRow } from "@/layout/types";

export function itemSetting(r: LayoutItemRow): string {
  const parts: string[] = [];
  if (r.DEFAULT_VALUE) parts.push(r.FILL_KIND === "AUTO" ? `AUTO ${r.DEFAULT_VALUE}` : `기본값 ${r.DEFAULT_VALUE}`);
  if (r.NUM_FORMAT) parts.push(r.NUM_FORMAT);
  if (r.TRANS_UNIT) parts.push(`전송 단위 ${r.TRANS_UNIT}`);
  if (r.UNIT_ITEM) parts.push(`단위 항목 ${r.UNIT_ITEM}`);
  return parts.join(" · ");
}

export function itemColumns(readOnly: boolean): GridColumn[] {
  return [
    { key: "SEQ", header: "순서", width: 70, align: "center", rowDrag: !readOnly },
    { key: "DISPLAY_NAME", header: "항목명", width: 150, render: (v, r) => (r.FILL_KIND === "FILLER" ? "FILLER" : String(v ?? "")) },
    { key: "COLUMN_PHYS", header: "표준 물리명", width: 140 },
    { key: "FILL_KIND", header: "채움", width: 80, align: "center" },
    { key: "DATA_TYPE", header: "도메인(파생)", width: 140, render: (_v, r) => derivedLabel(r as unknown as LayoutItemRow) },
    { key: "DEFAULT_VALUE", header: "설정", width: 200, render: (_v, r) => itemSetting(r as unknown as LayoutItemRow) },
    { key: "OFFSET", header: "오프셋", width: 70, align: "right" },
    { key: "LENGTH", header: "길이", width: 60, align: "right" },
    { key: "POSITION", header: "위치", width: 90, align: "center",
      render: (_v, r) => positionLabel(Number(r.OFFSET ?? 0), Number(r.LENGTH ?? 0)) },
  ];
}

export interface BodyItemGridProps {
  rows: LayoutItemRow[];
  headerLength: number;
  selectedKey: string | null;
  readOnly: boolean;
  onSelect: (key: string) => void;
  onAddColumn: () => void;
  onAddFiller: () => void;
  onDelete: () => void;
  onReorder: (keys: Array<string | number>) => void;
}

export function BodyItemGrid(props: BodyItemGridProps) {
  const { rows, headerLength, selectedKey, readOnly } = props;
  const columns = useMemo(() => itemColumns(readOnly), [readOnly]);
  return (
    <GridPanel title="본문 항목" count={rows.length}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-xs)" }}>
        <span data-testid="layout-body-summary">{`헤더 ${headerLength} — 본문 첫 오프셋 ${headerLength}`}</span>
        {!readOnly && (
          <>
            <Button data-testid="layout-item-add-column" size="sm" onClick={props.onAddColumn}>+ 항목 추가</Button>
            <Button data-testid="layout-item-add-filler" size="sm" onClick={props.onAddFiller}>+ FILLER</Button>
            <Button size="sm" disabled={!selectedKey} onClick={props.onDelete}>삭제</Button>
          </>
        )}
        <span style={hint}>행을 끌어 순서를 바꿉니다. 오프셋·총 길이는 바로 다시 계산됩니다.</span>
      </div>
      <div data-testid="layout-items">
        <AgDataGrid
          columnSizing="fit"
          columns={columns}
          data={rows as unknown as Record<string, unknown>[]}
          rowKey="KEY"
          height={220}
          highlightedRowKey={selectedKey}
          emptyMessage="본문 항목이 없습니다"
          onRowClick={(r) => props.onSelect(String(r.KEY))}
          onRowOrderChange={readOnly ? undefined : props.onReorder}
        />
      </div>
    </GridPanel>
  );
}
