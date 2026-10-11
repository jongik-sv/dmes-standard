"use client";

/**
 * 아래 검토 패널(스펙 2.2) — 표준 위반 / 추정 관계 검토(확정·기각, 접힌 후보 포함, S7) / DB 차이(DbDiffApply) / 변경 기록(ChangeLog).
 * 확정·기각 단추는 읽기 전용·연결 끊김·처리 중이면 막는다(locked). 단추 열 정의는 locked·onDecide 가 바뀔 때만 새로 만든다(Local-Rules §20).
 * 행을 누르면 그 표를 고른다(컬럼 그리드·캔버스가 따라간다).
 */
import { useCallback, useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import type { RelationDecision } from "../api";
import type { ErdEditContext } from "../edit-context";
import type { ErdChangesView, ErdColumnStatus, ErdDbDiffView, ErdModelJson, ErdStatusView } from "../types";
import { ChangeLog, historyNote } from "./ChangeLog";
import { statusBadge } from "./ColumnGrid";
import { DbDiffApply } from "./DbDiffApply";

export type ReviewTab = "violations" | "inferred" | "diff" | "history";

export interface ViolationRow extends Record<string, unknown> {
  id: string;
  tableId: string;
  table: string;
  column: string;
  logical: string;
  status: ErdColumnStatus;
  domain: string;
}

/** 상태가 OK·ALIAS 가 아닌 컬럼(README MCP listViolations 와 같은 기준). */
export function violationRows(model: ErdModelJson, status: ErdStatusView | null): ViolationRow[] {
  if (!status) return [];
  const out: ViolationRow[] = [];
  const tables = Object.entries(model.tables).sort(([, a], [, b]) => a.phys.localeCompare(b.phys));
  for (const [tableId, t] of tables) {
    for (const cid of t.columnOrder) {
      const c = model.columns[cid];
      const s = status.statuses[cid];
      if (!c || !s || s === "OK" || s === "ALIAS") continue;
      out.push({
        id: cid, tableId, table: t.phys, column: c.phys, logical: c.logical, status: s,
        domain: c.domainId != null ? status.domains[String(c.domainId)]?.name ?? String(c.domainId) : "",
      });
    }
  }
  return out;
}

export interface InferredRow extends Record<string, unknown> {
  id: string;
  tableId: string;
  child: string;
  parent: string;
  evidence: string;
  rank: string;
  folded: boolean;
}

/** 추정 관계 전부(접힌 후보 포함). 자식 글자 → 순위(없음·1·2…) → id 순. */
export function inferredRows(model: ErdModelJson): InferredRow[] {
  const name = (tableId: string, cols: string[]) =>
    `${model.tables[tableId]?.phys ?? tableId}.${cols.map((c) => model.columns[c]?.phys ?? c).join(",")}`;
  return Object.entries(model.relations)
    .filter(([, r]) => r.state === "INFERRED")
    .map(([id, r]) => ({
      id, tableId: r.child,
      child: name(r.child, r.pairs.map((p) => p[0])),
      parent: name(r.parent, r.pairs.map((p) => p[1])),
      evidence: r.evidence.map((e) => `${e.kind} ${e.ref}`).join(", "),
      rank: r.candidateRank == null ? "" : r.candidateRank === 1 ? "1순위" : `후보 ${r.candidateRank}`,
      folded: (r.candidateRank ?? 0) > 1,
      order: r.candidateRank ?? 0,
    }))
    .sort((a, b) => a.child.localeCompare(b.child) || a.order - b.order || a.id.localeCompare(b.id))
    .map(({ order: _order, ...row }) => row);
}

const VIOLATION_COLUMNS: GridColumn[] = [
  { key: "table", header: "표", width: 200, meta: false },
  { key: "column", header: "컬럼", width: 180, meta: false },
  { key: "logical", header: "논리명", width: 160, meta: false },
  { key: "status", header: "상태", width: 110, align: "center", meta: false, tooltip: false, render: statusBadge },
  { key: "domain", header: "도메인", width: 140, meta: false },
];
function inferredColumns(onDecide: (relationId: string, op: RelationDecision) => void, locked: boolean): GridColumn[] {
  return [
    { key: "child", header: "자식(FK 쪽)", width: 240, meta: false },
    { key: "parent", header: "부모", width: 240, meta: false },
    { key: "evidence", header: "근거", width: 240, meta: false },
    { key: "rank", header: "후보", width: 80, align: "center", meta: false },
    {
      key: "actions", header: "", width: 130, meta: false, sortable: false, tooltip: false,
      render: (_v, row) => (
        <span className="erd-actions">
          <Button size="mini" data-testid={`erd-confirm-${String(row.id)}`} disabled={locked} onClick={() => onDecide(String(row.id), "confirmRelation")}>
            확정
          </Button>
          <Button size="mini" data-testid={`erd-reject-${String(row.id)}`} disabled={locked} onClick={() => onDecide(String(row.id), "rejectRelation")}>
            기각
          </Button>
        </span>
      ),
    },
  ];
}

export interface ReviewPanelProps {
  ctx: ErdEditContext | null;
  model: ErdModelJson | null;
  status: ErdStatusView | null;
  tab: ReviewTab;
  onTab(tab: ReviewTab): void;
  diff: ErdDbDiffView | null;
  history: ErdChangesView | null;
  onReloadDiff(): void;
  onReloadHistory(): void;
  onDecide(relationId: string, op: RelationDecision): void;
  onSelectTable(tableId: string): void;
  locked: boolean;
  /** 변경 기록 되돌리기(Task 10). */
  mySession: string;
  canUndo: boolean;
  onUndo(rev: number): void;
}

export function ReviewPanel({
  ctx, model, status, tab, onTab, diff, history, onReloadDiff, onReloadHistory, onDecide, onSelectTable, locked, mySession, canUndo, onUndo,
}: ReviewPanelProps) {
  const violations = useMemo(() => (model ? violationRows(model, status) : []), [model, status]);
  const inferred = useMemo(() => (model ? inferredRows(model) : []), [model]);
  const inferredCols = useMemo(() => inferredColumns(onDecide, locked), [onDecide, locked]);
  const onRow = useCallback((row: Record<string, unknown>) => {
    if (typeof row.tableId === "string") onSelectTable(row.tableId);
  }, [onSelectTable]);
  const items: TabItem[] = [
    { key: "violations", label: <span data-testid="erd-tab-violations">표준 위반({violations.length})</span> },
    { key: "inferred", label: <span data-testid="erd-tab-inferred">추정 관계 검토({inferred.length})</span> },
    { key: "diff", label: <span data-testid="erd-tab-diff">DB 차이{diff ? `(${diff.items.length})` : ""}</span> },
    { key: "history", label: <span data-testid="erd-tab-history">변경 기록</span> },
  ];
  return (
    <div className="erd-review__panel" data-testid="erd-review">
      <div className="erd-review__head">
        <Tabs items={items} activeKey={tab} onChange={(k) => onTab(k as ReviewTab)} />
        {tab === "diff" && (
          <Button size="sm" data-testid="erd-diff-reload" onClick={onReloadDiff}>
            다시 읽기
          </Button>
        )}
        {tab === "history" && (
          <Button size="sm" data-testid="erd-history-reload" onClick={onReloadHistory}>
            다시 읽기
          </Button>
        )}
      </div>
      {tab === "history" && historyNote(history) && (
        <div className="erd-review__note" data-testid="erd-history-note">{historyNote(history)}</div>
      )}
      <div className="erd-review__body" data-testid={`erd-review-${tab}`}>
        <div className="erd-review__grid">
          {tab === "violations" && (
            <AgDataGrid gridId="erdViolations" columnSizing="fit" columns={VIOLATION_COLUMNS} data={violations} rowKey="id" onRowClick={onRow}
              emptyMessage={status ? "표준 위반이 없습니다." : "표준 상태를 읽는 중입니다."} />
          )}
          {tab === "inferred" && (
            <AgDataGrid gridId="erdInferred" columnSizing="fit" columns={inferredCols} data={inferred} rowKey="id" onRowClick={onRow}
              emptyMessage="검토할 추정 관계가 없습니다." />
          )}
          {tab === "diff" && ctx && <DbDiffApply ctx={ctx} diff={diff} onReload={onReloadDiff} />}
          {tab === "history" && <ChangeLog history={history} mySession={mySession} canUndo={canUndo} onUndo={onUndo} />}
        </div>
      </div>
    </div>
  );
}
