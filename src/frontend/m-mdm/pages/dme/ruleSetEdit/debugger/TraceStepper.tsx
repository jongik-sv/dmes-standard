"use client";

/**
 * 따라가기(2단계 계획 Task 11) — [처음] [이전] [다음] [끝], 진행 막대(`sim-progress`), 상태 문구(`sim-status`).
 * 상태 문구는 끝까지 갔으면 `완료 · {n}단계 · 결과 변수 {m}개`, 오류로 멈췄으면 `오류로 멈춤 — {nodeId}: {첫 위반 문구}`,
 * 기록이 비었으면 `실행 전 오류 — {첫 위반 문구}`, 따라가는 중이면 `{step+1}/{n} · {nodeId}` 이다.
 */
import { IconPlayerSkipBack, IconPlayerSkipForward, IconPlayerTrackNext, IconPlayerTrackPrev } from "@tabler/icons-react";

import type { RunTrace } from "@/contract/engine-contract.generated";
import { Button, ProgressBar } from "@dk-oasis/shared/form";

export type TraceEnd = "done" | "stopped" | "before" | null;

/** 지금 단계가 기록의 끝인가, 끝이면 어떻게 끝났나. */
export function endOf(trace: RunTrace, step: number): TraceEnd {
  const n = trace.nodes.length;
  if (n === 0) return "before";
  if (step < n - 1) return null;
  return (trace.violations ?? []).length > 0 ? "stopped" : "done";
}

/** 상태 문구(`sim-status`). 기록이 있을 때만 쓴다. */
export function statusText(trace: RunTrace, step: number): string {
  const first = trace.violations?.[0]?.message ?? "";
  switch (endOf(trace, step)) {
    case "before":
      return `실행 전 오류 — ${first}`;
    case "stopped":
      return `오류로 멈춤 — ${trace.nodes[step].nodeId}: ${first}`;
    case "done":
      return `완료 · ${trace.nodes.length}단계 · 결과 변수 ${Object.keys(trace.finalValues ?? {}).length}개`;
    default:
      return `${step + 1}/${trace.nodes.length} · ${trace.nodes[step].nodeId}`;
  }
}

export interface TraceStepperProps {
  /** 기록. 없으면 버튼이 모두 꺼지고 `message` 를 상태 문구로 보인다. */
  trace: RunTrace | null;
  step: number;
  onStep: (step: number) => void;
  /** 기록이 없을 때의 상태 문구. */
  message: string;
}

export function TraceStepper({ trace, step, onStep, message }: TraceStepperProps) {
  const total = trace?.nodes.length ?? 0;
  const end = trace ? endOf(trace, step) : null;
  const value = total > 0 ? Math.round(((step + 1) / total) * 100) : 0;
  const barStatus = !trace || total === 0 ? "idle" : end === "stopped" ? "error" : end === "done" ? "completed" : "running";
  return (
    <div className="rsim-stepper">
      <div className="rsim-stepper-row">
        <Button size="sm" data-testid="sim-first" ariaLabel="처음" title="처음" disabled={total === 0 || step <= 0} onClick={() => onStep(0)}>
          <IconPlayerSkipBack size={14} aria-hidden="true" />
          처음
        </Button>
        <Button size="sm" data-testid="sim-prev" ariaLabel="이전" title="이전 (←)" disabled={total === 0 || step <= 0} onClick={() => onStep(step - 1)}>
          <IconPlayerTrackPrev size={14} aria-hidden="true" />
          이전
        </Button>
        <Button size="sm" data-testid="sim-next" ariaLabel="다음" title="다음 (→)" disabled={total === 0 || step >= total - 1} onClick={() => onStep(step + 1)}>
          다음
          <IconPlayerTrackNext size={14} aria-hidden="true" />
        </Button>
        <Button size="sm" data-testid="sim-last" ariaLabel="끝" title="끝" disabled={total === 0 || step >= total - 1} onClick={() => onStep(total - 1)}>
          끝
          <IconPlayerSkipForward size={14} aria-hidden="true" />
        </Button>
        <div className="rsim-progress" data-testid="sim-progress" data-value={value}>
          <ProgressBar status={barStatus} value={value} label="" showPercent={false} hideWhenIdle={false} />
        </div>
      </div>
      <p className="rsim-status" data-testid="sim-status" data-end={end ?? "running"} role="status">
        {trace ? statusText(trace, step) : message}
      </p>
    </div>
  );
}
