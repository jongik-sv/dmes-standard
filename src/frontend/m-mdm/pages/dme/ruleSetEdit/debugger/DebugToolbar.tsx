"use client";

/**
 * 디버그 툴바(3단계 계획 §4.3) — 흐름 툴바 아래 줄. [계속] [한 단계] [이전] [여기까지] [처음부터] [끝내기]·상태 문구·낡은 기록 배지·알림.
 * Task 0 은 루트 슬롯만 둔다. 본문은 Task 10 이 채운다.
 */
import type { Simulation } from "./useSimulation";

export interface DebugToolbarProps {
  sim: Simulation;
  /** canDo("execute"). */
  canRun: boolean;
  /** [여기까지] 는 고른 노드 기준이다. */
  selectedId: string | null;
}

export function DebugToolbar(props: DebugToolbarProps) {
  void props; // SEAM(T10): dbg-continue·dbg-step·dbg-step-back·dbg-run-to·dbg-restart·dbg-finish·dbg-status·dbg-stale·dbg-notice
  return <div className="rsf-dbg-toolbar" data-testid="dbg-toolbar" />;
}
