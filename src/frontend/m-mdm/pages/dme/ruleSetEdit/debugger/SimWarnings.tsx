"use client";

/**
 * 실행 경고 목록(`sim-warnings`) — 기록 실행(`execute`) 응답의 `warnings` 를 한 줄씩 보인다. 없으면 아무것도 그리지 않는다.
 * 디버그 모드 값 표 탭(`ValuesTab`)이 쓴다.
 */
import { badgeStyle } from "@/shell";

import type { SimWarning } from "../types";

export function SimWarnings({ warnings }: { warnings: readonly SimWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="rsim-list" data-testid="sim-warnings">
      {warnings.map((w, i) => (
        <li key={`${w.code}-${i}`}>
          <span style={badgeStyle("warning")}>{w.code}</span> {w.ruleId && <code>{w.ruleId}</code>} {w.message}
        </li>
      ))}
    </ul>
  );
}
