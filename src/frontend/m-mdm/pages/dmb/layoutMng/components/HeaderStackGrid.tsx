"use client";

/**
 * 헤더 구성 그리드(TSK-05-02 design.md §2) — 순서(행 드래그)·헤더·EAI·길이·위치·재정의한 상수·[상수 편집]·[빼기].
 * 헤더 안 항목의 구성·길이를 바꾸는 입력은 없다 — 전문에서 헤더는 잠긴다(수용 기준 3, 불변 I8).
 */
import { useMemo, useRef } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { positionLabel } from "@/layout/layout-calc";
import { hint, sectionTitle } from "@/layout/styles";
import type { HeaderStackRow } from "@/layout/types";

export function overrideSummary(h: HeaderStackRow): string {
  return h.items.filter((i) => i.FILL_KIND === "CONST" && i.OVERRIDE_VALUE && i.OVERRIDE_VALUE.trim() !== "")
    .map((i) => `${i.DISPLAY_NAME ?? i.COLUMN_PHYS} ${i.OVERRIDE_VALUE}`).join(", ");
}

export interface HeaderStackGridProps {
  rows: HeaderStackRow[];
  readOnly: boolean;
  onAdd: () => void;
  onRemove: (key: string) => void;
  onEditConst: (key: string) => void;
  onReorder: (keys: Array<string | number>) => void;
}

export function HeaderStackGrid({ rows, readOnly, onAdd, onRemove, onEditConst, onReorder }: HeaderStackGridProps) {
  // 셀 버튼 콜백은 ref 로 — 열 정의를 렌더마다 새로 만들지 않는다
  const actions = useRef({ onRemove, onEditConst });
  actions.current = { onRemove, onEditConst };
  const columns = useMemo<GridColumn[]>(() => [
    { key: "SEQ", header: "순서", width: 70, align: "center", rowDrag: !readOnly },
    { key: "HEADER_NAME", header: "헤더", width: 160 },
    { key: "EAI_CODE", header: "EAI", width: 90 },
    { key: "TOTAL_LENGTH", header: "길이", width: 70, align: "right" },
    { key: "POSITION", header: "위치", width: 90, align: "center" },
    { key: "OVERRIDES", header: "재정의한 상수", width: 160, render: (v) => (v ? String(v) : <span style={hint}>없음</span>) },
    { key: "ACTIONS", header: "", width: 150,
      render: (_v, r) => (
        <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
          <Button size="mini" data-testid={`const-edit-open-${r.SEQ}`} onClick={() => actions.current.onEditConst(String(r.KEY))}>상수 편집</Button>
          {!readOnly && <Button size="mini" onClick={() => actions.current.onRemove(String(r.KEY))}>빼기</Button>}
        </span>
      ) },
  ], [readOnly]);
  // 계산 칸은 행 데이터에 넣는다 — ag-grid 는 필드 값이 바뀐 셀만 다시 그린다
  const data = useMemo(() => rows.map((r) => ({
    ...r, POSITION: positionLabel(r.OFFSET ?? 0, r.TOTAL_LENGTH), OVERRIDES: overrideSummary(r), ACTIONS: `${r.KEY}:${r.SEQ}`,
  })) as unknown as Record<string, unknown>[], [rows]);
  return (
    <div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>{`헤더 구성 ${rows.length}건`}</p>
      <div style={{ marginBottom: "var(--spacing-xs)" }}>
        {!readOnly && <Button data-testid="layout-header-add" size="sm" onClick={onAdd}>+ 헤더 추가</Button>}
        <span style={hint}> 헤더 안 항목의 구성·길이는 헤더 정의 화면에서만 바꿉니다. 여기서는 상수만 재정의합니다.</span>
      </div>
      <div data-testid="layout-header-stack">
        <AgDataGrid
          columnSizing="fit"
          columns={columns}
          data={data}
          rowKey="KEY"
          height={150}
          emptyMessage="쌓인 헤더가 없습니다"
          onRowOrderChange={readOnly ? undefined : onReorder}
        />
      </div>
    </div>
  );
}
