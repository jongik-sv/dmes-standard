"use client";

/**
 * 변경 기록 탭(view sinceRev, 스펙 4.4 되돌리기). 최근 rev 부터, 변경은 종류별 수로 줄인다. 내 세션 행에 "나" 를 단다.
 * 요청 구간 앞에 다시 읽기 지점이 있으면 화면(ErdViewer)이 서버 fromRev 부터 다시 읽고, 안내문(historyNote)이 그 앞은 안 보인다고 알린다.
 * 행마다 [되돌리기] — 그 rev 의 역명령을 새 rev 로 넣는다(restore). 뒤에 같은 속성을 바꾼 변경이 있으면 CONFLICT 다(S2-5).
 * 그리드 data 는 history·mySession 이 바뀔 때만, 단추 열은 canUndo·onUndo 가 바뀔 때만 다시 만든다(Screen-Performance R7, Local-Rules §20).
 */
import { useMemo } from "react";

import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";

import type { ErdChangesView } from "../types";

const KIND_LABEL: Record<string, string> = { table: "표", column: "컬럼", key: "키", relation: "관계", diagram: "다이어그램", diagramNode: "배치" };

export function historyRows(view: ErdChangesView | null, mySession = ""): Record<string, unknown>[] {
  if (!view) return [];
  return [...view.deltas].reverse().map((d) => {
    const counts = new Map<string, number>();
    for (const c of d.changes) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
    return {
      id: String(d.rev), rev: d.rev, who: d.session === mySession ? "나" : "", userId: d.userId, session: d.session, source: d.source,
      summary: [...counts].map(([k, n]) => `${KIND_LABEL[k] ?? k} ${n}`).join("·"),
    };
  });
}

/**
 * 변경 기록 안내문. fromRev 부터 다시 읽었으면 그 rev 앞의 기록이 안 보인다고, 다시 읽어도 reload 면(옛 서버·그사이 새 다시 읽기 지점)
 * 지금 rev 앞에 다시 읽기 지점이 있다고 알린다. 알릴 것이 없으면 null.
 */
export function historyNote(view: ErdChangesView | null): string | null {
  if (!view) return null;
  if (view.reload) return `rev ${view.rev} 앞에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.`;
  if (view.fromRev != null) return `rev ${view.fromRev} 에 다시 읽기 지점이 있어 그 앞의 기록은 보이지 않습니다.`;
  return null;
}

function historyColumns(canUndo: boolean, onUndo: (rev: number) => void): GridColumn[] {
  return [
    { key: "rev", header: "rev", width: 70, align: "right", meta: false },
    { key: "who", header: "", width: 40, align: "center", meta: false },
    { key: "userId", header: "사용자", width: 120, meta: false },
    { key: "session", header: "세션", width: 160, meta: false },
    { key: "source", header: "출처", width: 70, align: "center", meta: false },
    { key: "summary", header: "변경", width: 240, meta: false },
    {
      key: "undo", header: "", width: 100, meta: false, sortable: false, tooltip: false,
      render: (_v, row) => (
        <Button size="mini" data-testid={`erd-undo-${String(row.rev)}`} disabled={!canUndo} onClick={() => onUndo(Number(row.rev))}>
          되돌리기
        </Button>
      ),
    },
  ];
}

export interface ChangeLogProps {
  history: ErdChangesView | null;
  mySession: string;
  canUndo: boolean;
  onUndo(rev: number): void;
}

export function ChangeLog({ history, mySession, canUndo, onUndo }: ChangeLogProps) {
  const rows = useMemo(() => historyRows(history, mySession), [history, mySession]);
  const columns = useMemo(() => historyColumns(canUndo, onUndo), [canUndo, onUndo]);
  return (
    <AgDataGrid gridId="erdHistory" columnSizing="fit" columns={columns} data={rows} rowKey="id"
      emptyMessage={history ? "변경 기록이 없습니다." : "변경 기록을 읽는 중입니다."} />
  );
}
