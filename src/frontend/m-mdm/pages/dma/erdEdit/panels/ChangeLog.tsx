"use client";

/** 변경 기록 탭(view sinceRev). 최근 rev 부터, 변경은 종류별 수로 줄인다. Task 10 이 행마다 [되돌리기] 를 더한다. */
import { useMemo } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import type { ErdChangesView } from "../types";

const KIND_LABEL: Record<string, string> = { table: "표", column: "컬럼", key: "키", relation: "관계", diagram: "다이어그램", diagramNode: "배치" };

export function historyRows(view: ErdChangesView | null): Record<string, unknown>[] {
  if (!view) return [];
  return [...view.deltas].reverse().map((d) => {
    const counts = new Map<string, number>();
    for (const c of d.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    return {
      id: String(d.rev), rev: d.rev, userId: d.userId, session: d.session, source: d.source,
      summary: [...counts].map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`).join("·"),
    };
  });
}

const HISTORY_COLUMNS: GridColumn[] = [
  { key: "rev", header: "rev", width: 70, align: "right", meta: false },
  { key: "userId", header: "사용자", width: 120, meta: false },
  { key: "session", header: "세션", width: 160, meta: false },
  { key: "source", header: "출처", width: 70, align: "center", meta: false },
  { key: "summary", header: "변경", width: 260, meta: false },
];

export interface ChangeLogProps { history: ErdChangesView | null }

export function ChangeLog({ history }: ChangeLogProps) {
  // 그리드 data 는 history 가 바뀔 때만 새로 만든다(Screen-Performance R7).
  const rows = useMemo(() => historyRows(history), [history]);
  return (
    <AgDataGrid gridId="erdHistory" columnSizing="fit" columns={HISTORY_COLUMNS} data={rows} rowKey="id"
      emptyMessage={history ? "변경 기록이 없습니다." : "변경 기록을 읽는 중입니다."} />
  );
}
