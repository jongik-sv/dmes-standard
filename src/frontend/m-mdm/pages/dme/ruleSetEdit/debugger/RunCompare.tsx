"use client";

/**
 * 실행 비교 탭(3단계 계획 E7) — 바로 전 실행과 이번 실행의 결과 값·지난 노드 차이(`compareRuns`).
 * Task 0 은 루트 슬롯만 둔다. 본문은 Task 10 이 채운다.
 */
import type { Simulation } from "./useSimulation";

export interface RunCompareProps {
  sim: Simulation;
}

export function RunCompare(props: RunCompareProps) {
  void props; // SEAM(T10): run-compare-values·run-compare-path(sim.previous·sim.last)
  return <div className="rsf-run-compare" data-testid="run-compare" />;
}
