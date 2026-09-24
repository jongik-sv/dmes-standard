"use client";

/**
 * 등록 검증 표(TSK-05-03 design.md §2·§6.2) — 03 거부 조건 7종을 원문 순서로(#·거부 조건·코드·결과·메시지) + 표 밖 이슈. 검증은 서버
 * validate 가 현재 편집 상태로 한다(쓰지 않는다). 결과 배지: 통과·거부·경고(판정 불가는 저장을 막지 않는다, D6).
 */
import { Button } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { badge, hint, row } from "@/layout/styles";
import type { CheckResult } from "../types";

const RESULT_LABEL: Record<string, string> = { PASS: "통과", FAIL: "거부", WARN: "경고" };
const RESULT_COLOR: Record<string, string> = { PASS: "var(--color-success)", FAIL: "var(--color-danger)", WARN: "var(--color-warning)" };

export interface LayoutCheckPanelProps {
  result: CheckResult | null;
  busy: boolean;
  canRun: boolean;
  onRun: () => void;
}

export function LayoutCheckPanel({ result, busy, canRun, onRun }: LayoutCheckPanelProps) {
  const checks = result?.checks ?? [];
  const others = result?.otherIssues ?? [];
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
        <table data-testid="layout-check-table" style={{ ...DETAIL_TABLE_STYLE, marginTop: "var(--spacing-sm)" }}>
          <thead>
            <tr>
              <th style={DETAIL_LABEL_CELL}>#</th>
              <th style={DETAIL_LABEL_CELL}>거부 조건</th>
              <th style={DETAIL_LABEL_CELL}>코드</th>
              <th style={DETAIL_LABEL_CELL}>결과</th>
              <th style={DETAIL_LABEL_CELL}>메시지</th>
            </tr>
          </thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.NO} data-testid={`layout-check-row-${c.NO}`}>
                <td style={DETAIL_VALUE_CELL}>{c.NO}</td>
                <td style={DETAIL_VALUE_CELL}>{c.CONDITION}</td>
                <td style={DETAIL_VALUE_CELL}>{c.CODE}</td>
                <td style={DETAIL_VALUE_CELL}>
                  <span data-testid={`layout-check-result-${c.NO}`} style={{ ...badge, color: RESULT_COLOR[c.RESULT] }}>
                    {RESULT_LABEL[c.RESULT] ?? c.RESULT}
                  </span>
                </td>
                <td style={DETAIL_VALUE_CELL} data-testid={`layout-check-message-${c.NO}`}>{c.MESSAGES.join(" / ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
