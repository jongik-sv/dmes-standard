"use client";

/**
 * 값 표(2단계 계획 Task 11, `sim-values`) — 행 = 변수, 열 = 단계(룰 결과·병렬 합류), 칸 = 그 단계 뒤의 값(`typedText`).
 * 바뀐 칸은 배경, 지금 단계 열은 테두리로 강조한다. 표는 공용 `MatrixTable`(피벗 표)로 그리고, 가로로 길면 표 안에서만 가로 스크롤한다.
 *
 * 값이 없는 칸(null·undefined)은 `—`, NULL 값(type NULL)만 `NULL` 이다 — `typedText` 는 둘 다 `NULL` 을 돌려주므로 여기서 가른다.
 * 열 계산(`valueTable`)은 기록이 바뀔 때만 한다. 단계를 넘길 때는 강조 스타일만 다시 그린다(Local-Rules §16).
 */
import { useMemo, type CSSProperties } from "react";

import type { RunTrace, RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";
import { MatrixTable, type MatrixTableColumn, type MatrixTableRow } from "@dk-oasis/shared/matrix-table";

import { typedText, valueTable } from "../trace-view";

export const NO_VALUE = "—";

/** 값 표 칸 글자 — 값 없음은 `—`, NULL 값은 `NULL`. */
export function cellText(v: TypedValue | null | undefined): string {
  return v == null ? NO_VALUE : typedText(v);
}

const CURRENT_STYLE: CSSProperties = { outline: "2px solid var(--color-primary)", outlineOffset: -2 };
const CHANGED_STYLE: CSSProperties = { background: "var(--color-warning-soft)" };
const FUTURE_STYLE: CSSProperties = { opacity: 0.5 };

export interface ValueTableProps {
  trace: RunTrace;
  flow: RuleSetFlow;
  step: number;
}

export function ValueTable({ trace, flow, step }: ValueTableProps) {
  const table = useMemo(() => valueTable(trace, flow), [trace, flow]);
  /** 지금 단계까지 온 마지막 열 — IF 처럼 열이 없는 단계에서는 바로 앞 열을 가리킨다. */
  const current = useMemo(() => {
    let cur = -1;
    for (const c of table.cols) if (c.index <= step) cur = c.index;
    return cur;
  }, [table, step]);

  const columns = useMemo<MatrixTableColumn[]>(
    () =>
      table.cols.map((c) => ({
        key: String(c.index),
        highlight: c.index === current,
        header: (
          <span
            data-testid={`sim-col-${c.index}`}
            data-current={c.index === current ? "true" : "false"}
            title={c.nodeId}
            style={c.index > step ? FUTURE_STYLE : undefined}
          >
            {c.label}
          </span>
        ),
      })),
    [table, current, step],
  );

  const rows = useMemo<MatrixTableRow[]>(() => {
    const colAt = new Map(table.cols.map((c, j) => [String(c.index), j] as const));
    return table.vars.map((name, i) => ({
      key: name,
      label: <span data-testid={`sim-row-${name}`}>{name}</span>,
      renderCell: (key) => {
        const j = colAt.get(key) ?? -1;
        const v = j >= 0 ? table.cells[i][j] : null;
        return <span data-changed={j >= 0 && table.changed[i][j] ? "true" : "false"}>{cellText(v)}</span>;
      },
      cellStyle: (key) => {
        const j = colAt.get(key) ?? -1;
        if (j < 0) return undefined;
        const idx = table.cols[j].index;
        return {
          ...(table.changed[i][j] ? CHANGED_STYLE : null),
          ...(idx === current ? CURRENT_STYLE : null),
          ...(idx > step ? FUTURE_STYLE : null),
        };
      },
    }));
  }, [table, current, step]);

  return (
    <div data-testid="sim-values" className="rsim-values">
      {table.cols.length === 0 ? (
        <p className="rsf-panel-note">값이 생긴 단계가 없다</p>
      ) : (
        <div className="rsim-values-scroll">
          <MatrixTable cornerHeader="변수 \ 단계" columns={columns} rows={rows} align="left" />
        </div>
      )}
    </div>
  );
}
