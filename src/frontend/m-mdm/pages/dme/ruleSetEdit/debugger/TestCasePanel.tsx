"use client";

/**
 * 테스트 케이스 패널(3단계 계획 E6) — 케이스 표·[지금 입력 저장]·[모두 실행]·통과 요약·기대/실제 차이·케이스 팝업. `DebugInputs` 가 그린다.
 * Task 0 은 루트 슬롯만 둔다. 본문은 Task 10 이 채운다.
 */
import type { Simulation } from "./useSimulation";
import type { TestCases } from "./useTestCases";

export interface TestCasePanelProps {
  sim: Simulation;
  tests: TestCases;
  canEditCases: boolean;
  canRun: boolean;
}

export function TestCasePanel(props: TestCasePanelProps) {
  void props; // SEAM(T10): case-grid·case-save-current·case-run-all·case-summary·case-load·case-edit·case-delete·case-debug·case-diff·case-modal
  return <div className="rsf-case-panel" data-testid="case-panel" />;
}
