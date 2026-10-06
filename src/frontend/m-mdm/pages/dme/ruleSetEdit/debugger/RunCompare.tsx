"use client";

/**
 * 실행 비교 탭(3단계 계획 E7, 스펙 §4.7) — 바로 전 실행(`sim.previous`)과 이번 실행(`sim.last`)의 최종 결과 값(`run-compare-values`: 이름·이전·지금·같음/다름,
 * 다른 줄 강조)과 한쪽 실행에만 지난 노드(`run-compare-path`: "이전에만"·"지금만"). 비교는 `compareRuns` 로 기록이 바뀔 때만 한다(Local-Rules §16).
 * 하위 세트 프레임에 들어가 있으면(`framePath`, 하위 세트 spec §11) 두 실행에서 같은 SET 노드 경로를 따라간 하위 기록끼리 견준다(`subTraceAt`).
 */
import { useContext, useMemo } from "react";
import { EditorActiveContext } from "../tabs-context";

import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badgeStyle } from "@/shell";

import { subTraceAt } from "./call-stack";
import { compareRuns, modeDiffNote } from "./debug-model";
import { cellText } from "./ValueTable";
import type { Simulation } from "./useSimulation";

export interface RunCompareProps {
  sim: Simulation;
  /** 들어간 프레임의 SET 노드 경로(바깥부터) — 있으면 두 실행에서 같은 경로의 하위 기록끼리 견준다. */
  framePath?: readonly string[];
}

export const NO_PREVIOUS_NOTE = "이전 실행이 없다. 흐름을 고친 뒤 같은 입력으로 다시 돌리면 차이가 보인다";
/** 이전 실행에 같은 SET 노드 경로의 하위 기록이 없을 때(그 노드를 지나지 않았거나 하위 세트 전에 멈춤). */
export const NO_PREVIOUS_SUB_NOTE = "이전 실행에는 이 하위 세트 기록이 없다";

const COLUMNS: GridColumn[] = [
  { key: "name", meta: false, header: "이름", width: 140 },
  { key: "before", meta: false, header: "이전", width: 120 },
  { key: "after", meta: false, header: "지금", width: 120 },
  {
    key: "same",
    meta: false,
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

export function RunCompare({ sim, framePath }: RunCompareProps) {
  const active = useContext(EditorActiveContext);
  const before = sim.previous;
  const after = sim.last;
  /** 경로 배열은 렌더마다 새로 올 수 있어 글자 키로 비교한다(Local-Rules §16). */
  const pathKey = (framePath ?? []).join(">");
  const diff = useMemo(() => {
    if (!before || !after) return null;
    const path = pathKey === "" ? [] : pathKey.split(">");
    const b = subTraceAt(before.trace, path);
    const a = subTraceAt(after.trace, path);
    return b && a ? compareRuns(b, a) : null;
  }, [before, after, pathKey]);
  const modeNote = before && after ? modeDiffNote(before.ruleVersions, after.ruleVersions) : null;
  const rows = useMemo(
    () => (diff?.values ?? []).map((v) => ({ name: v.name, before: cellText(v.before), after: cellText(v.after), same: v.same })),
    [diff],
  );

  if (!diff) {
    return (
      <div className="rsf-run-compare" data-testid="run-compare">
        <p className="rsf-panel-note">{before && after && pathKey !== "" ? NO_PREVIOUS_SUB_NOTE : NO_PREVIOUS_NOTE}</p>
      </div>
    );
  }
  const changed = rows.filter((r) => !r.same).length;
  return (
    <div className="rsf-run-compare" data-testid="run-compare">
      {modeNote && <p className="rsf-panel-note" data-testid="run-compare-mode" role="status">{modeNote}</p>}
      <p className="rsf-panel-sub">{`결과 값 — ${rows.length}개 가운데 ${changed}개 다름`}</p>
      <div data-testid="run-compare-values">
        <AgDataGrid gridId="debugRunCompare" personalize={active ? undefined : false} columns={COLUMNS} data={rows} rowKey="name" height="auto" sortable={false} getRowClassExtra={rowClass} emptyMessage="두 실행 모두 결과 값이 없다" ariaLabel="실행 비교 결과 값" />
      </div>
      <p className="rsf-panel-sub">지난 노드 차이</p>
      <ul className="rsf-cmp-path" data-testid="run-compare-path">
        <NodeList testId="run-compare-only-before" label="이전에만" ids={diff.onlyBefore} />
        <NodeList testId="run-compare-only-after" label="지금만" ids={diff.onlyAfter} />
      </ul>
    </div>
  );
}
