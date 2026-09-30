"use client";

/**
 * 실행 비교 탭(3단계 계획 E7, 스펙 §4.7) — 바로 전 실행(`sim.previous`)과 이번 실행(`sim.last`)의 최종 결과 값(`run-compare-values`: 이름·이전·지금·같음/다름,
 * 다른 줄 강조)과 한쪽 실행에만 지난 노드(`run-compare-path`: "이전에만"·"지금만"). 비교는 `compareRuns` 로 기록이 바뀔 때만 한다(Local-Rules §16).
 */
import { useMemo } from "react";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";

import { compareRuns } from "./debug-model";
import { cellText } from "./ValueTable";
import type { Simulation } from "./useSimulation";

export interface RunCompareProps {
  sim: Simulation;
}

export const NO_PREVIOUS_NOTE = "이전 실행이 없다. 흐름을 고친 뒤 같은 입력으로 다시 돌리면 차이가 보인다";

const COLUMNS: GridColumn[] = [
  { key: "name", header: "이름", width: 140 },
  { key: "before", header: "이전", width: 120 },
  { key: "after", header: "지금", width: 120 },
  {
    key: "same",
    header: "같음/다름",
    width: 90,
    tooltip: false,
    render: (v) => <span style={badgeStyle(v ? "neutral" : "warning")}>{v ? "같음" : "다름"}</span>,
  },
];

const rowClass = (row: Record<string, unknown>) => (row.same ? undefined : "rsf-cmp-diff");

function NodeList({ testId, label, ids }: { testId: string; label: string; ids: readonly string[] }) {
  return (
    <li data-testid={testId}>
      <span style={badgeStyle(ids.length > 0 ? "info" : "neutral")}>{label}</span>{" "}
      {ids.length === 0 ? (
        <span className="rsf-muted">없음</span>
      ) : (
        ids.map((id, i) => (
          <span key={id}>
            {i > 0 && ", "}
            <code>{id}</code>
          </span>
        ))
      )}
    </li>
  );
}

export function RunCompare({ sim }: RunCompareProps) {
  const before = sim.previous;
  const after = sim.last;
  const diff = useMemo(() => (before && after ? compareRuns(before.trace, after.trace) : null), [before, after]);
  const rows = useMemo(
    () => (diff?.values ?? []).map((v) => ({ name: v.name, before: cellText(v.before), after: cellText(v.after), same: v.same })),
    [diff],
  );

  if (!diff) {
    return (
      <div className="rsf-run-compare" data-testid="run-compare">
        <p className="rsf-panel-note">{NO_PREVIOUS_NOTE}</p>
      </div>
    );
  }
  const changed = rows.filter((r) => !r.same).length;
  return (
    <div className="rsf-run-compare" data-testid="run-compare">
      <p className="rsf-panel-sub">{`결과 값 — ${rows.length}개 가운데 ${changed}개 다름`}</p>
      <div data-testid="run-compare-values">
        <AgDataGrid columns={COLUMNS} data={rows} rowKey="name" height="auto" sortable={false} getRowClassExtra={rowClass} emptyMessage="두 실행 모두 결과 값이 없다" ariaLabel="실행 비교 결과 값" />
      </div>
      <p className="rsf-panel-sub">지난 노드 차이</p>
      <ul className="rsf-cmp-path" data-testid="run-compare-path">
        <NodeList testId="run-compare-only-before" label="이전에만" ids={diff.onlyBefore} />
        <NodeList testId="run-compare-only-after" label="지금만" ids={diff.onlyAfter} />
      </ul>
    </div>
  );
}
