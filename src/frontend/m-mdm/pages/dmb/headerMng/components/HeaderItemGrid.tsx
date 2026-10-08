"use client";

/**
 * 헤더 항목 그리드(TSK-05-02 design.md §2) — 순서(행 드래그)·항목명·표준 물리명·채움·기본값·오프셋·길이·위치. 오프셋은 이 헤더
 * 안 상대값이고 화면에서 즉시 계산한다(F8·불변 I11). 항목은 컬럼 사전 선택 또는 FILLER 로만 더한다(I5).
 */
import { useMemo } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { hint } from "@/layout/styles";
import type { LayoutItemRow } from "@/layout/types";
import { baseItemColumns, displayRows } from "@/layout/item-rows";

function columns(readOnly: boolean): GridColumn[] {
  return [...baseItemColumns(readOnly), { key: "DEFAULT_VALUE", header: "기본값", width: 110 }];
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
  const data = useMemo(() => displayRows(rows), [rows]);
  return (
    <div>
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
        <AgDataGrid gridId="headerItems"
          title="헤더 항목"
          columnSizing="fit"
          columns={cols}
          data={data}
          rowKey="KEY"
          height={260}
          highlightedRowKey={selectedKey}
          emptyMessage="헤더 항목이 없습니다"
          onRowClick={(r) => props.onSelect(String(r.KEY))}
          onRowOrderChange={readOnly ? undefined : props.onReorder}
        />
      </div>
    </div>
  );
}
