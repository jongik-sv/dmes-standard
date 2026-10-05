"use client";

/**
 * 등록 검증 표(TSK-05-03 design.md §2·§6.2) — 03 거부 조건 7종을 원문 순서로(#·거부 조건·코드·결과·메시지) + 표 밖 이슈. 검증은 서버
 * validate 가 현재 편집 상태로 한다(쓰지 않는다). 결과 배지: 통과·거부·경고(판정 불가는 저장을 막지 않는다, D6).
 */
import { useMemo } from "react";
import { Button } from "@dk-oasis/shared/form";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { badge, hint, row } from "@/layout/styles";
import type { CheckResult } from "../types";

const RESULT_LABEL: Record<string, string> = { PASS: "통과", FAIL: "거부", WARN: "경고" };
const RESULT_COLOR: Record<string, string> = { PASS: "var(--color-success)", FAIL: "var(--color-danger)", WARN: "var(--color-warning)" };

// 행·결과·메시지 testid 는 render 결과에 둔다(행 요소는 그리드가 그린다).
const COLUMNS: GridColumn[] = [
  { key: "NO", header: "#", width: 40, align: "right", render: (v) => <span data-testid={`layout-check-row-${v}`}>{String(v)}</span> },
  { key: "CONDITION", meta: false, header: "거부 조건", width: 260 },
  { key: "CODE", meta: false, header: "코드", width: 60 },
  {
    key: "RESULT", meta: false, header: "결과", width: 70, tooltip: false,
    render: (v, r) => (
      <span data-testid={`layout-check-result-${r.NO}`} style={{ ...badge, color: RESULT_COLOR[String(v)] }}>
        {RESULT_LABEL[String(v)] ?? String(v)}
      </span>
    ),
  },
  { key: "MESSAGE", meta: false, header: "메시지", width: 320, render: (v, r) => <span data-testid={`layout-check-message-${r.NO}`}>{String(v ?? "")}</span> },
];

export interface LayoutCheckPanelProps {
  result: CheckResult | null;
  busy: boolean;
  canRun: boolean;
  onRun: () => void;
}

export function LayoutCheckPanel({ result, busy, canRun, onRun }: LayoutCheckPanelProps) {
  const checks = result?.checks ?? [];
  const others = result?.otherIssues ?? [];
  const rawChecks = result?.checks;
  const data = useMemo(() => (rawChecks ?? []).map((c) => ({ ...c, MESSAGE: c.MESSAGES.join(" / ") })), [rawChecks]);
  return (
    <div>
      <div style={row}>
        {canRun ? (
          <Button data-testid="layout-check-run" size="sm" disabled={busy} onClick={onRun}>검증 실행</Button>
        ) : (
          <span style={hint}>표준 관리자만 실행합니다</span>
        )}
        <span style={hint}>현재 편집 상태로 03 등록 거부 조건 7종을 검사합니다. 저장하지 않습니다.</span>
      </div>
      {checks.length > 0 && (
        <div data-testid="layout-check-table" style={{ marginTop: "var(--spacing-sm)" }}>
          <AgDataGrid
            columnSizing="fit"
            columns={COLUMNS}
            data={data}
            rowKey="NO"
            height="auto"
          />
        </div>
      )}
      {others.length > 0 && (
        <ul data-testid="layout-check-other" style={{ margin: "var(--spacing-sm) 0 0", color: "var(--color-danger)" }}>
          {others.map((o, i) => <li key={i}>{`${o.CODE}${o.SEQ != null ? `[${o.SEQ}]` : ""} ${o.MESSAGE}`}</li>)}
        </ul>
      )}
      {result && (
        <p style={hint}>{result.passed ? "저장할 수 있습니다." : "거부 항목을 고쳐야 저장할 수 있습니다."}</p>
      )}
    </div>
  );
}
