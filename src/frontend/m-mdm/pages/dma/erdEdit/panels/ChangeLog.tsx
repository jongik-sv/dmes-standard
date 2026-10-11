"use client";

/**
 * 변경 기록 탭(view sinceRev, 스펙 4.4 되돌리기, UX 1차 U33). 최근 번호(rev)부터 시각 · 번호 · 사람 · 출처 · 내용 · [되돌리기].
 * 사람은 내 세션이면 "나", 아니면 사용자 ID(마우스를 올리면 세션 · 출처). 내용은 종류별로 묶어 이름 하나 + "외 n", 감사 컬럼은 "감사 컬럼 n" 으로 따로.
 * 요청 구간 앞에 다시 읽기 지점이 있으면 화면(ErdViewer)이 서버 fromRev 부터 다시 읽고, 안내문(historyNote)이 그 앞은 안 보인다고 알린다.
 * 행마다 [되돌리기] — 그 번호의 역명령을 새 번호로 넣는다(restore). 뒤에 같은 속성을 바꾼 변경이 있으면 CONFLICT 다(S2-5).
 * 그리드 data 는 history·mySession·model 이 바뀔 때만, 단추 열은 canUndo·undoReason·onUndo 가 바뀔 때만 다시 만든다(Screen-Performance R7, Local-Rules §20).
 */
import { useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import { isAuditColumn } from "../audit-columns";
import { KIND_LABEL, SOURCE_LABEL, timeText } from "../labels";
import type { ErdChange, ErdChangeKind, ErdChangesView, ErdDelta, ErdModelJson } from "../types";

/** 묶음 순서 — 표 → 컬럼 → 감사 컬럼 → 키 → 관계 → 다이어그램 → 표 자리. 삭제는 같은 순서로 뒤에. */
const GROUP_ORDER: readonly string[] = ["table", "column", "audit", "key", "relation", "diagram", "diagramNode"];

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

function tablePhys(model: ErdModelJson | null, tableId: string | null): string | null {
  return tableId ? (model?.tables[tableId]?.phys ?? tableId) : null;
}

/** 요소 이름 — 값(델타)에 있으면 그것, 없으면 모델, 그것도 없으면 id. */
function elementName(c: ErdChange, model: ErdModelJson | null): string {
  const v = c.value ?? {};
  switch (c.kind) {
    case "table":
      return str(v.phys) ?? model?.tables[c.id]?.phys ?? c.id;
    case "column": {
      const col = model?.columns[c.id];
      const t = tablePhys(model, str(v.table) ?? col?.table ?? null);
      const phys = str(v.phys) ?? col?.phys ?? c.id;
      return t ? `${t}.${phys}` : phys;
    }
    case "key":
      return str(v.name) ?? model?.keys[c.id]?.name ?? c.id;
    case "relation": {
      const r = model?.relations[c.id];
      const child = tablePhys(model, str(v.child) ?? r?.child ?? null);
      const parent = tablePhys(model, str(v.parent) ?? r?.parent ?? null);
      return child && parent ? `${child}→${parent}` : c.id;
    }
    case "diagram":
      return str(v.diagramName) ?? c.id;
    default:
      return c.id;
  }
}

function columnPhys(c: ErdChange, model: ErdModelJson | null): string | undefined {
  return str(c.value?.phys) ?? model?.columns[c.id]?.phys;
}

/**
 * 한 델타의 내용 글(U33). 예: "표 TB_A · 컬럼 TB_A.COL_X 외 2 · 감사 컬럼 8 · 표 자리 57 · 삭제: 관계 TB_B→TB_A".
 * 표 자리(diagramNode)와 감사 컬럼은 수만 센다. 삭제(op delete)는 "삭제: " 를 붙여 따로 묶는다.
 */
export function changeSummary(d: Pick<ErdDelta, "changes">, model: ErdModelJson | null = null): string {
  const groups = new Map<string, { kind: string; del: boolean; names: string[]; count: number }>();
  for (const c of d.changes) {
    const del = c.op === "delete";
    const kind: string = c.kind === "column" && isAuditColumn(columnPhys(c, model)) ? "audit" : c.kind;
    const k = `${del ? "1" : "0"}:${kind}`;
    const g = groups.get(k) ?? { kind, del, names: [], count: 0 };
    g.count += 1;
    if (g.names.length < 1 && kind !== "audit" && kind !== "diagramNode") g.names.push(elementName(c, model));
    groups.set(k, g);
  }
  const rank = (kind: string) => {
    const i = GROUP_ORDER.indexOf(kind);
    return i < 0 ? GROUP_ORDER.length : i;
  };
  return [...groups.values()]
    .sort((a, b) => Number(a.del) - Number(b.del) || rank(a.kind) - rank(b.kind) || a.kind.localeCompare(b.kind))
    .map((g) => {
      const label = g.kind === "audit" ? "감사 컬럼" : (KIND_LABEL[g.kind as ErdChangeKind] ?? g.kind);
      const body = g.names.length === 0
        ? `${label} ${g.count}`
        : `${label} ${g.names[0]}${g.count > 1 ? ` 외 ${g.count - 1}` : ""}`;
      return g.del ? `삭제: ${body}` : body;
    })
    .join(" · ");
}

/** 변경 기록 행(README 정본 모양). now 는 시험이 시각을 고정할 때 준다. */
export interface HistoryRow extends Record<string, unknown> {
  id: string; rev: number; at: string; who: string; whoTitle: string; source: string; summary: string;
}

export function historyRows(view: ErdChangesView | null, mySession = "", model: ErdModelJson | null = null, now: Date = new Date()): HistoryRow[] {
  if (!view) return [];
  return [...view.deltas].reverse().map((d) => {
    const source = SOURCE_LABEL[d.source] ?? d.source;
    return {
      id: String(d.rev), rev: d.rev, at: timeText(d.at ?? null, now),
      who: d.session === mySession ? "나" : d.userId, whoTitle: `${d.session} · ${source}`,
      source, summary: changeSummary(d, model),
    };
  });
}

/**
 * 변경 기록 안내문. fromRev 부터 다시 읽었으면 그 번호 앞의 기록이 안 보인다고, 다시 읽어도 reload 면(옛 서버·그사이 새 다시 읽기 지점)
 * 지금 번호 앞에 다시 읽기 지점이 있다고 알린다. 알릴 것이 없으면 null.
 */
export function historyNote(view: ErdChangesView | null): string | null {
  if (!view) return null;
  if (view.reload) return `번호 ${view.rev} 앞에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.`;
  if (view.fromRev != null) return `번호 ${view.fromRev} 에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.`;
  return null;
}

/** 사람 칸 — 셀 툴팁은 값만 보이므로 세션 · 출처는 감싼 span 의 title 로 둔다. */
const renderWho = (v: unknown, row: Record<string, unknown>) => <span title={String(row.whoTitle ?? "")}>{String(v ?? "")}</span>;

function historyColumns(canUndo: boolean, undoReason: string | null, onUndo: (rev: number) => void): GridColumn[] {
  const off = canUndo ? undefined : (undoReason ? `되돌리기 — ${undoReason}` : undefined);
  return [
    { key: "at", header: "시각", width: 70, align: "center", meta: false },
    { key: "rev", header: "번호", width: 60, align: "right", meta: false },
    { key: "who", header: "사람", width: 120, meta: false, tooltip: false, render: renderWho },
    { key: "source", header: "출처", width: 70, align: "center", meta: false },
    { key: "summary", header: "내용", width: 300, meta: false },
    {
      key: "undo", header: "", width: 100, meta: false, sortable: false, tooltip: false,
      render: (_v, row) => (
        <span title={off}>
          <Button size="mini" data-testid={`erd-undo-${String(row.rev)}`} disabled={!canUndo} onClick={() => onUndo(Number(row.rev))}>
            되돌리기
          </Button>
        </span>
      ),
    },
  ];
}

export interface ChangeLogProps {
  history: ErdChangesView | null;
  mySession: string;
  /** 내용 글의 표·컬럼 이름을 찾는 모델(델타 값에 이름이 없을 때). */
  model: ErdModelJson | null;
  canUndo: boolean;
  /** [되돌리기] 가 꺼졌을 때 title 에 붙일 짧은 이유(U34). */
  undoReason: string | null;
  onUndo(rev: number): void;
}

export function ChangeLog({ history, mySession, model, canUndo, undoReason, onUndo }: ChangeLogProps) {
  const rows = useMemo(() => historyRows(history, mySession, model), [history, mySession, model]);
  const columns = useMemo(() => historyColumns(canUndo, undoReason, onUndo), [canUndo, undoReason, onUndo]);
  return (
    <AgDataGrid gridId="erdHistory" columnSizing="fit" columns={columns} data={rows} rowKey="id"
      emptyMessage={history ? "변경 기록이 없습니다." : "변경 기록을 읽는 중입니다."} />
  );
}
