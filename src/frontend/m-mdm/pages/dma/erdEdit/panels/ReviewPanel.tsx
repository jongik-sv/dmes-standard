"use client";

/**
 * 아래 검토 패널(스펙 2.2) — 표준 위반 / 추정 관계 검토([맞음]·[아님], 접힌 후보 포함, S7) / DB 다시 가져오기(DbDiffApply) / 변경 기록(ChangeLog).
 * [맞음]·[아님] 단추는 읽기 전용·연결 끊김·처리 중이면 막고 감싼 span 의 title 에 짧은 이유를 둔다(locked·lockReason, U34).
 * 단추 열 정의는 locked·lockReason·onDecide 가 바뀔 때만 새로 만든다(Local-Rules §20).
 * 위반 행을 누르면 그 컬럼을 고르고(표 + 그리드 행, U39), 추정 관계 행을 누르면 자식 표를 고른다(컬럼 그리드·캔버스가 따라간다).
 * 위반 행·건수는 "고칠 위반" 규칙 하나(state/violations.ts, U25)를 쓴다 — 요약 줄·왼쪽 목록 수와 같은 수다.
 */
import { useCallback, useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Tabs, type TabItem } from "@dk-oasis/shared/tabs";

import type { RelationDecision } from "../api";
import type { ErdEditContext } from "../edit-context";
import { evidenceText } from "../labels";
import { isCountedViolation } from "../state/violations";
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

/**
 * 고칠 위반 컬럼(U25) — TYPE·DOMAIN·MISS, 감사 컬럼은 showAudit 일 때만. NEW·ALIAS 는 빠진다(그리드 배지로만 보임).
 * MCP listViolations(OK·ALIAS 가 아닌 컬럼)와는 다른 기준이다.
 */
export function violationRows(model: ErdModelJson, status: ErdStatusView | null, showAudit = false): ViolationRow[] {
  if (!status) return [];
  const out: ViolationRow[] = [];
  const tables = Object.entries(model.tables).sort(([, a], [, b]) => a.phys.localeCompare(b.phys));
  for (const [tableId, t] of tables) {
    for (const cid of t.columnOrder) {
      const c = model.columns[cid];
      const s = status.statuses[cid];
      if (!c || !s || !isCountedViolation(model, cid, status.statuses, showAudit)) continue;
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
  /** 근거 원문(경로 전체). 근거 칸 title 로 보인다. */
  evidenceTitle: string;
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
      evidence: r.evidence.map(evidenceText).join(", "),
      evidenceTitle: r.evidence.map((e) => `${e.kind} ${e.ref}`).join("\n"),
      rank: r.candidateRank == null ? "" : String(r.candidateRank),
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
/** 근거 칸 — 셀 툴팁은 값만 보이므로 원문은 감싼 span 의 title 로 둔다. */
const renderEvidence = (v: unknown, row: Record<string, unknown>) => <span title={String(row.evidenceTitle ?? "")}>{String(v ?? "")}</span>;

function inferredColumns(onDecide: (relationId: string, op: RelationDecision) => void, locked: boolean, lockReason: string | null): GridColumn[] {
  const off = locked && lockReason ? `판정 — ${lockReason}` : undefined;
  return [
    { key: "child", header: "자식(FK 쪽)", width: 240, meta: false },
    { key: "parent", header: "부모", width: 240, meta: false },
    { key: "evidence", header: "근거", width: 240, meta: false, tooltip: false, render: renderEvidence },
    {
      key: "rank", header: "후보 순위", width: 90, align: "center", meta: false,
      headerTooltip: "같은 자식 컬럼에 부모 후보가 여럿일 때의 순위. 1 이 가장 그럴듯함",
    },
    {
      key: "actions", header: "판정", width: 130, meta: false, sortable: false, tooltip: false,
      render: (_v, row) => (
        <span className="erd-actions" title={off}>
          <Button size="mini" data-testid={`erd-confirm-${String(row.id)}`} disabled={locked} onClick={() => onDecide(String(row.id), "confirmRelation")}>
            맞음
          </Button>
          <Button size="mini" data-testid={`erd-reject-${String(row.id)}`} disabled={locked} onClick={() => onDecide(String(row.id), "rejectRelation")}>
            아님
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
  /** [맞음]·[아님] 이 꺼졌을 때 title 에 붙일 짧은 이유(U34). */
  lockReason: string | null;
  /** 변경 기록 되돌리기(Task 10). */
  mySession: string;
  canUndo: boolean;
  /** [되돌리기] 가 꺼졌을 때 title 에 붙일 짧은 이유(U34). */
  undoReason: string | null;
  onUndo(rev: number): void;
  /** 접힘 = 머리 줄(탭·[펼치기])만 그린다(UX 1차 U11). 탭을 누르면 그 탭을 열고 펼친다. */
  collapsed: boolean;
  onToggle(open: boolean): void;
}

export function ReviewPanel({
  ctx, model, status, tab, onTab, diff, history, onReloadDiff, onReloadHistory, onDecide, onSelectTable, locked, lockReason,
  mySession, canUndo, undoReason, onUndo, collapsed, onToggle,
}: ReviewPanelProps) {
  const showAudit = ctx?.audit.show ?? false;
  const violations = useMemo(() => (model ? violationRows(model, status, showAudit) : []), [model, status, showAudit]);
  const inferred = useMemo(() => (model ? inferredRows(model) : []), [model]);
  const inferredCols = useMemo(() => inferredColumns(onDecide, locked, lockReason), [onDecide, locked, lockReason]);
  // 위반 행 → 그 컬럼을 고른다(표 + 그리드 행, U39). 편집 문맥이 없으면 표만.
  const selectColumn = ctx?.nav.selectColumn;
  const onViolationRow = useCallback((row: Record<string, unknown>) => {
    if (selectColumn) selectColumn(String(row.id));
    else if (typeof row.tableId === "string") onSelectTable(row.tableId);
  }, [selectColumn, onSelectTable]);
  const onRow = useCallback((row: Record<string, unknown>) => {
    if (typeof row.tableId === "string") onSelectTable(row.tableId);
  }, [onSelectTable]);
  const items: TabItem[] = [
    { key: "violations", label: <span data-testid="erd-tab-violations">표준 위반({violations.length})</span> },
    { key: "inferred", label: <span data-testid="erd-tab-inferred">추정 관계 검토({inferred.length})</span> },
    { key: "diff", label: <span data-testid="erd-tab-diff">DB 다시 가져오기{diff ? `(${diff.items.length})` : ""}</span> },
    { key: "history", label: <span data-testid="erd-tab-history">변경 기록</span> },
  ];
  const onTabChange = useCallback((k: string) => {
    onTab(k as ReviewTab);
    if (collapsed) onToggle(true);
  }, [onTab, onToggle, collapsed]);
  if (collapsed) {
    return (
      <div className="erd-review__head">
        <Tabs items={items} activeKey={tab} onChange={onTabChange} />
        <span className="erd-bar__spacer" />
        <Button size="mini" data-testid="erd-review-toggle" title="검토 패널 펼치기" aria-expanded={false} onClick={() => onToggle(true)}>
          ▴ 펼치기
        </Button>
      </div>
    );
  }
  return (
    <div className="erd-review__panel" data-testid="erd-review">
      <div className="erd-review__head">
        <Tabs items={items} activeKey={tab} onChange={onTabChange} />
        {tab === "diff" && (
          <Button size="sm" data-testid="erd-diff-reload" onClick={onReloadDiff}>
            새로 읽기
          </Button>
        )}
        {tab === "history" && (
          <Button size="sm" data-testid="erd-history-reload" onClick={onReloadHistory}>
            새로 읽기
          </Button>
        )}
        <span className="erd-bar__spacer" />
        <Button size="mini" data-testid="erd-review-toggle" title="검토 패널 접기" aria-expanded onClick={() => onToggle(false)}>
          ▾ 접기
        </Button>
      </div>
      {tab === "history" && historyNote(history) && (
        <div className="erd-review__note" data-testid="erd-history-note">{historyNote(history)}</div>
      )}
      <div className="erd-review__body" data-testid={`erd-review-${tab}`}>
        <div className="erd-review__grid">
          {tab === "violations" && (
            <AgDataGrid gridId="erdViolations" columnSizing="fit" columns={VIOLATION_COLUMNS} data={violations} rowKey="id" onRowClick={onViolationRow}
              emptyMessage={!model ? "모델을 고르면 보입니다." : status ? "표준 위반이 없습니다." : "표준 상태를 읽는 중입니다."} />
          )}
          {tab === "inferred" && (
            <AgDataGrid gridId="erdInferred" columnSizing="fit" columns={inferredCols} data={inferred} rowKey="id" onRowClick={onRow}
              emptyMessage="검토할 추정 관계가 없습니다." />
          )}
          {tab === "diff" && ctx && <DbDiffApply ctx={ctx} diff={diff} onReload={onReloadDiff} />}
          {tab === "history" && (
            <ChangeLog history={history} mySession={mySession} model={model} canUndo={canUndo} undoReason={undoReason} onUndo={onUndo} />
          )}
        </div>
      </div>
    </div>
  );
}
