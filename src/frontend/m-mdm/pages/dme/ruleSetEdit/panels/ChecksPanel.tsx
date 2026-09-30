"use client";

/**
 * 검사 결과 패널(2단계 계획 Task 10, P10) — 화면 즉시 검사(`flowChecks`) 요약 줄과 항목. 항목을 누르면 그 노드로 캔버스를 옮기고 고른다
 * (nodeId 가 없는 항목은 아무 일도 하지 않는다). 거부(REJECT)가 있으면 저장이 막힌다(P-D4).
 */
import type { CSSProperties } from "react";

import { badgeStyle } from "@/shell";

import type { RuleSetCheck } from "../types";

/** 거부 배지 — shared 배지 톤에 위험 톤이 없어 같은 모양에 위험 토큰을 입힌다. */
export const REJECT_BADGE: CSSProperties = { ...badgeStyle("neutral"), color: "var(--color-danger)", background: "var(--color-danger-soft)" };

export function CheckBadge({ check }: { check: Pick<RuleSetCheck, "severity"> }) {
  return check.severity === "REJECT" ? <span style={REJECT_BADGE}>거부</span> : <span style={badgeStyle("warning")}>경고</span>;
}

export interface ChecksPanelProps {
  checks: readonly RuleSetCheck[];
  onFocus: (nodeId: string) => void;
}

export function ChecksPanel({ checks, onFocus }: ChecksPanelProps) {
  const rejects = checks.filter((c) => c.severity === "REJECT").length;
  const warns = checks.length - rejects;
  const summary = [rejects > 0 ? `거부 ${rejects}` : null, warns > 0 ? `경고 ${warns}` : null].filter(Boolean).join(" · ");
  return (
    <div data-testid="set-checks" className="rsf-checks">
      <p className="rsf-checks-summary">
        {checks.length === 0 ? (
          <span style={badgeStyle("success")}>통과</span>
        ) : (
          <>
            <span>{summary}</span>
            {rejects > 0 && <span className="rsf-checks-hint">거부를 모두 고쳐야 저장된다</span>}
          </>
        )}
      </p>
      {checks.length > 0 && (
        <ul className="rsf-checks-list">
          {checks.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                className="rsf-check"
                data-testid={`set-check-${i}`}
                title={c.code}
                disabled={!c.nodeId}
                onClick={() => c.nodeId && onFocus(c.nodeId)}
              >
                <CheckBadge check={c} />
                <span className="rsf-check-text">{c.message}</span>
                {c.nodeId && <code className="rsf-check-node">{c.nodeId}</code>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
