"use client";

/**
 * 디버그 모드 오른쪽 변수 패널(3단계 계획 §4.4·§4.5) — 조사식(핀)·커서 자리 변수 표·식 즉석 평가·노드 상세(`sim-detail*`).
 * Task 0 은 루트 슬롯만 둔다. 본문은 Task 10 이 채운다.
 */
import type { EditFlow } from "../flow-edit";
import type { RuleIoMap } from "../types";
import type { Simulation } from "./useSimulation";

export interface VariablePanelProps {
  sim: Simulation;
  setId: string | null;
  flow: EditFlow;
  rules: RuleIoMap;
  selectedId: string | null;
  /** 식 파싱(validate) 권한 — 없으면 식 평가 칸이 꺼진다(P-D1). */
  canParse: boolean;
  onOpenRule(ruleId: string): void;
}

export function VariablePanel(props: VariablePanelProps) {
  void props; // SEAM(T10): var-watches·var-watch-{name}·var-grid·expr-input·expr-result·expr-recent-{i}·노드 상세(sim-detail*)
  return <div className="rsf-var-panel" data-testid="var-panel" />;
}
