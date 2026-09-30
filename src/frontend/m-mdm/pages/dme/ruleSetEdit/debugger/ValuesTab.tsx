"use client";

/**
 * 디버그 모드 아래 "값 표" 탭 내용(3단계 계획 §4.1) — 2단계 값 표(`ValueTable`, `sim-values`)와 실행 경고(`SimWarnings`, `sim-warnings`)를 커서 기준으로 그린다.
 * 커서 k 는 "노드 k 실행 전"(P-D13)이라 값 표의 지금 단계는 k - 1 이다(끝이면 마지막 노드). 표는 기록 때의 흐름 사본으로 푼다.
 */
import type { Simulation } from "./useSimulation";
import { SimWarnings } from "./SimWarnings";
import { ValueTable } from "./ValueTable";

export interface ValuesTabProps {
  sim: Simulation;
}

export function ValuesTab({ sim }: ValuesTabProps) {
  const last = sim.last;
  if (!last) {
    return (
      <div className="rsf-values-tab">
        <p className="rsf-panel-note">실행하면 변수 × 단계 값 표가 보인다. [한 단계]·[계속]으로 시작한다</p>
      </div>
    );
  }
  const n = last.trace.nodes.length;
  return (
    <div className="rsf-values-tab">
      <ValueTable trace={last.trace} flow={last.flow} step={Math.min(sim.cursor, n) - 1} />
      <SimWarnings warnings={last.warnings} />
    </div>
  );
}
