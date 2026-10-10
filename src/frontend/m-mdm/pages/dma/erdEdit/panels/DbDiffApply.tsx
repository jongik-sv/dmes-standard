"use client";

/** DB 차이 탭(단계 1 읽기 목록). FE3 Task 15 가 항목 고르기·[반영](import kind=APPLY_DIFF, ctx.exclusive 안)을 더한다. */
import { useMemo } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import { typeText } from "../canvas/erd-geometry";
import type { ErdEditContext } from "../edit-context";
import type { ErdColumnSpec, ErdDbDiffItem, ErdDbDiffView } from "../types";

const DIFF_LABEL: Record<ErdDbDiffItem["kind"], string> = {
  TABLE_ADDED: "DB 에 생긴 표", TABLE_REMOVED: "DB 에서 사라진 표", COLUMN_ADDED: "DB 에 생긴 컬럼", COLUMN_REMOVED: "DB 에서 사라진 컬럼",
  COLUMN_CHANGED: "컬럼 다름", FK_ADDED: "DB 에 생긴 FK", FK_REMOVED: "DB 에서 사라진 FK",
};

const specText = (s: ErdColumnSpec | null): string => (s ? `${typeText(s)}${s.notNull ? " NN" : ""}` : "");

export function diffRows(view: ErdDbDiffView | null): Record<string, unknown>[] {
  if (!view) return [];
  return view.items.map((i) => ({ id: i.id, kind: DIFF_LABEL[i.kind], table: i.table, column: i.column ?? "", before: specText(i.before), after: specText(i.after) }));
}

const DIFF_COLUMNS: GridColumn[] = [
  { key: "kind", header: "종류", width: 150, meta: false },
  { key: "table", header: "표", width: 200, meta: false },
  { key: "column", header: "컬럼", width: 160, meta: false },
  { key: "before", header: "모델", width: 160, meta: false },
  { key: "after", header: "DB", width: 160, meta: false },
];

export interface DbDiffApplyProps { ctx: ErdEditContext; diff: ErdDbDiffView | null; onReload(): void }

export function DbDiffApply({ diff }: DbDiffApplyProps) {
  // ctx 가 델타마다 바뀌어도 그리드 data 는 diff 가 바뀔 때만 새로 만든다(Screen-Performance R7).
  const rows = useMemo(() => diffRows(diff), [diff]);
  return (
    <AgDataGrid gridId="erdDbDiff" columnSizing="fit" columns={DIFF_COLUMNS} data={rows} rowKey="id"
      emptyMessage={diff ? "DB 와 모델이 같습니다." : "DB 차이를 읽는 중입니다."} />
  );
}
