"use client";

/**
 * 디버그 모드 아래 "값 표" 탭 내용(3단계 계획 §4.1) — 2단계 값 표(`ValueTable`, `sim-values`)와 실행 경고(`sim-warnings`)를 커서 기준으로 그린다.
 * Task 0 은 루트 슬롯만 둔다. 본문은 Task 10 이 채운다.
 */
import type { Simulation } from "./useSimulation";

export interface ValuesTabProps {
  sim: Simulation;
}

export function ValuesTab(props: ValuesTabProps) {
  void props; // SEAM(T10): sim.last 로 ValueTable(sim-values, 커서 열 강조)·sim-warnings
  return <div className="rsf-values-tab" />;
}
