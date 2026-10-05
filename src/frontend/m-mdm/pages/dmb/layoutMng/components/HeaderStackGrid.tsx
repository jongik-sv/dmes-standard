"use client";

/**
 * 헤더 구성 그리드(TSK-05-02 design.md §2) — 순서(행 드래그)·헤더·EAI·길이·위치·재정의한 상수·[상수 편집]·[빼기].
 * 헤더 안 항목의 구성·길이를 바꾸는 입력은 없다 — 전문에서 헤더는 잠긴다(수용 기준 3, 불변 I8).
 * D-144 3단계: 판정 시각 T 의 헤더 버전·상태를 보인다. 그 시각에 확정 헤더가 없으면(MISSING) 길이·위치는 "-" 이고 안내를 띄운다.
 */
import { useMemo, useRef } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { lengthText, positionLabel } from "@/layout/layout-calc";
import { hint, sectionTitle } from "@/layout/styles";
import type { HeaderStackRow } from "@/layout/types";
import { versionStateLabel } from "@/layout/version-rows";
import { fmtVer } from "@/shell";

/** 판정 시각 T 에 확정 헤더가 없을 때의 상태 표기. */
export const HEADER_MISSING_LABEL = "확정 헤더 없음";

function headerStateLabel(state: unknown): string {
  if (state === "MISSING") return HEADER_MISSING_LABEL;
  if (state === "LEGACY") return "이행 전";
  return versionStateLabel(state as string | null);
}

/** 헤더 행이 판정 시각에 확정 헤더가 없는가(서버 MISSING, 또는 길이를 모름). */
export function isHeaderMissing(h: HeaderStackRow): boolean {
  return h.HEADER_STATE === "MISSING" || h.TOTAL_LENGTH == null;
}

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
    { key: "SEQ", meta: false, header: "순서", width: 70, align: "center", rowDrag: !readOnly },
    { key: "HEADER_NAME", meta: false, header: "헤더", width: 160 },
    { key: "EAI_CODE", header: "EAI", width: 90 },
    { key: "HEADER_VER", meta: false, header: "버전", width: 70, render: (v) => fmtVer(v as string | null) },
    { key: "HEADER_STATE", meta: false, header: "상태", width: 90,
      render: (v) => (v === "MISSING" ? <span style={{ color: "var(--color-danger, #b91c1c)" }}>{HEADER_MISSING_LABEL}</span> : headerStateLabel(v)) },
    { key: "TOTAL_LENGTH", header: "길이", width: 70, align: "right", render: (v) => lengthText(v as number | null) },
    { key: "POSITION", meta: false, header: "위치", width: 90, align: "center" },
    { key: "OVERRIDES", meta: false, header: "재정의한 상수", width: 160, render: (v) => (v ? String(v) : <span style={hint}>없음</span>) },
    { key: "ACTIONS", meta: false, header: "", width: 150,
      render: (_v, r) => (
        <span style={{ display: "inline-flex", gap: "var(--spacing-xs)" }}>
          <Button size="mini" data-testid={`const-edit-open-${r.SEQ}`} onClick={() => actions.current.onEditConst(String(r.KEY))}>상수 편집</Button>
          {!readOnly && <Button size="mini" onClick={() => actions.current.onRemove(String(r.KEY))}>빼기</Button>}
        </span>
      ) },
  ], [readOnly]);
  // 계산 칸은 행 데이터에 넣는다 — ag-grid 는 필드 값이 바뀐 셀만 다시 그린다
  const data = useMemo(() => rows.map((r) => ({
    ...r, POSITION: positionLabel(r.OFFSET, r.TOTAL_LENGTH), OVERRIDES: overrideSummary(r), ACTIONS: `${r.KEY}:${r.SEQ}`,
  })) as unknown as Record<string, unknown>[], [rows]);
  const missing = rows.some(isHeaderMissing);
  return (
    <div>
      <p style={{ ...sectionTitle, padding: "var(--spacing-xs) 0" }}>{`헤더 구성 ${rows.length}건`}</p>
      <div style={{ marginBottom: "var(--spacing-xs)" }}>
        {!readOnly && <Button data-testid="layout-header-add" size="sm" onClick={onAdd}>+ 헤더 추가</Button>}
        <span style={hint}> 헤더 안 항목의 구성·길이는 헤더 정의 화면에서만 바꿉니다. 여기서는 상수만 재정의합니다.</span>
      </div>
      {missing && (
        <p data-testid="layout-header-missing" style={{ ...hint, color: "var(--color-danger, #b91c1c)", margin: "0 0 var(--spacing-xs)" }}>
          판정 시각에 확정 헤더가 없어 헤더 길이·본문 오프셋·총 길이를 정할 수 없습니다(&quot;-&quot;). 시각 T 를 바꾸거나 헤더를 먼저 확정하세요.
        </p>
      )}
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
