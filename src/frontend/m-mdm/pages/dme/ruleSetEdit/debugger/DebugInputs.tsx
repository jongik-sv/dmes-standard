"use client";

/**
 * 디버그 모드 왼쪽 입력 패널(3단계 계획 §4.1·E6) — 입력 폼·JSON·판정 시각·최근 입력, 아래에 테스트 케이스(`TestCasePanel`).
 * Task 0 은 루트 슬롯만 둔다. 본문은 Task 10 이 채운다.
 */
import type { Simulation } from "./useSimulation";
import type { TestCases } from "./useTestCases";

export interface DebugInputsProps {
  sim: Simulation;
  tests: TestCases;
  setId: string | null;
  /** 케이스 저장·삭제 — 담당자·INUSE·저장 권한. */
  canEditCases: boolean;
  /** canDo("execute"). */
  canRun: boolean;
  onError(e: unknown): void;
}

export function DebugInputs(props: DebugInputsProps) {
  void props; // SEAM(T10): dbg-evalts·dbg-fields·dbg-input-{name}·dbg-send-{name}·dbg-json·dbg-json-import·dbg-error·dbg-recent + TestCasePanel
  return <div className="rsf-dbg-inputs" data-testid="dbg-inputs" />;
}
