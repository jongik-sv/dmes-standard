"use client";

/**
 * 본문 항목 그리드(TSK-05-02 design.md §2) — 헤더 요약 줄 + 순서(행 드래그)·항목명·표준 물리명·fill_kind·도메인(파생)·설정·
 * 오프셋·길이·위치. 오프셋·위치는 화면 즉시 계산이다(불변 I11). 항목은 컬럼 사전 선택 또는 FILLER 로만 더한다(I5).
 */
import { useMemo } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { baseItemColumns, displayRows } from "@/layout/item-rows";
import { lengthText } from "@/layout/layout-calc";
import { hint, sectionTitle } from "@/layout/styles";
import type { LayoutItemRow } from "@/layout/types";

export function itemColumns(readOnly: boolean): GridColumn[] {
  return [
    ...baseItemColumns(readOnly),
    { key: "DERIVED", meta: false, header: "도메인(파생)", width: 140 },
    { key: "SETTING", meta: false, header: "설정", width: 200 },
  ];
}

export interface BodyItemGridProps {
  rows: LayoutItemRow[];
  /** 헤더 길이 합. 판정 시각에 확정 헤더가 없으면 null — 본문 오프셋도 모른다. */
  headerLength: number | null;
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
  const data = useMemo(() => displayRows(rows), [rows]);
  return (
    <div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>{`본문 항목 ${rows.length}건`}</p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-sm)", marginBottom: "var(--spacing-xs)" }}>
        <span data-testid="layout-body-summary">{`헤더 ${lengthText(headerLength)} — 본문 첫 오프셋 ${lengthText(headerLength)}`}</span>
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
        <AgDataGrid gridId="bodyItems"
          columnSizing="fit"
          columns={columns}
          data={data}
          rowKey="KEY"
          height={220}
          highlightedRowKey={selectedKey}
          emptyMessage="본문 항목이 없습니다"
          onRowClick={(r) => props.onSelect(String(r.KEY))}
          onRowOrderChange={readOnly ? undefined : props.onReorder}
        />
      </div>
    </div>
  );
}
