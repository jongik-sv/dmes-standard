"use client";

/** 오른쪽 컬럼 그리드(읽기 전용, 스펙 2.2) — 고른 표의 컬럼: 키|논리명|물리명|도메인|타입|NN|표준. */
import { useMemo } from "react";

import { Badge, type BadgeTone } from "@dk-oasis/shared/form";
import { AgDataGrid, GridPanel, type GridColumn } from "@dk-oasis/shared/grid";

import { keyMarks } from "../canvas/erd-flow";
import { typeText } from "../canvas/erd-geometry";
import type { ErdEditContext } from "../edit-context";
import type { ErdColumnStatus, ErdModelJson, ErdStatusView } from "../types";

export const STATUS_LABEL: Record<ErdColumnStatus, string> = {
  OK: "표준", ALIAS: "별칭", NEW: "새 이름", TYPE: "타입 불일치", DOMAIN: "도메인 다름", MISS: "사전 없음",
};
const STATUS_TONE: Record<ErdColumnStatus, BadgeTone> = {
  OK: "success", ALIAS: "success", NEW: "primary", TYPE: "warning", DOMAIN: "warning", MISS: "danger",
};

export function statusBadge(value: unknown) {
  const s = value as ErdColumnStatus | null;
  return s && STATUS_LABEL[s] ? <Badge label={STATUS_LABEL[s]} tone={STATUS_TONE[s]} /> : null;
}

/** 칸 정의는 모듈 상수다(Local-Rules §20·§31). meta:false — MDM 컬럼 사전 캡션을 쓰지 않는다. */
const COLUMNS: GridColumn[] = [
  { key: "key", header: "키", width: 44, align: "center", meta: false },
  { key: "logical", header: "논리명", width: 110, meta: false },
  { key: "phys", header: "물리명", width: 120, meta: false },
  { key: "domain", header: "도메인", width: 80, meta: false },
  { key: "type", header: "타입", width: 100, meta: false },
  { key: "nn", header: "NN", width: 40, align: "center", meta: false },
  { key: "status", header: "표준", width: 90, align: "center", meta: false, tooltip: false, render: statusBadge },
];

export function columnRows(model: ErdModelJson, tableId: string | null, status: ErdStatusView | null): Record<string, unknown>[] {
  const t = tableId ? model.tables[tableId] : undefined;
  if (!t) return [];
  const marks = keyMarks(model);
  return t.columnOrder
    .filter((cid) => model.columns[cid])
    .map((cid) => {
      const c = model.columns[cid];
      return {
        id: cid,
        key: marks.get(cid) ?? "",
        logical: c.logical,
        phys: c.phys,
        domain: c.domainId != null ? status?.domains[String(c.domainId)]?.name ?? String(c.domainId) : "",
        type: typeText(c),
        nn: c.notNull ? "Y" : "",
        status: status?.statuses[cid] ?? null,
      };
    });
}

export interface ColumnGridProps {
  /** 편집 문맥(Task 9). FE3 Task 14 가 칸 편집·그리드 키를 더한다. */
  ctx: ErdEditContext;
  tableId: string | null;
}

export function ColumnGrid({ ctx, tableId }: ColumnGridProps) {
  const model = ctx.state.model;
  const status = ctx.status;
  const rows = useMemo(() => columnRows(model, tableId, status), [model, tableId, status]);
  const table = tableId ? model.tables[tableId] : undefined;
  return (
    <GridPanel title={table ? table.logical || table.phys : "컬럼"} count={rows.length}
      titleExtra={table ? <span className="erd-mono">{table.phys}</span> : undefined}>
      <div data-testid="erd-columns" style={{ position: "absolute", inset: 0 }}>
        <AgDataGrid gridId="erdColumns" columnSizing="fit" columns={COLUMNS} data={rows} rowKey="id"
          emptyMessage="캔버스나 검토 목록에서 표를 고르세요." emptyTestId="erd-columns-empty" />
      </div>
    </GridPanel>
  );
}
