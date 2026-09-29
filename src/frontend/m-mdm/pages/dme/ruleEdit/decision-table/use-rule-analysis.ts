/**
 * 즉시 검사(I13)를 Worker 에서 돌린다 — 편집이 멈추고 `ANALYSIS_DELAY_MS` 뒤에 보내고, Worker 가 일하는 동안 들어온 편집은 가장 최근 것
 * 하나만 남겼다가 앞 일이 끝나면 보낸다. 늦게 온 옛 결과(지금 입력의 순번이 아닌 것)는 버린다.
 *
 * Worker 를 못 쓰면(단위 테스트·SSR·Worker 생성/실행 오류) 전처럼 렌더 중에 바로 검사한다 — 이때는 기다림도 "검사 중" 도 없다.
 */
import { useEffect, useMemo, useRef, useState } from "react";

import type { HitPolicy } from "@/evalex";
import workerSource from "inline-worker:./analysis.worker.ts";

import type { StoredRow } from "../types";
import { runAnalysis, type AnalysisResult } from "./analysis";
import type { StoredVar } from "./grid-model";

export const ANALYSIS_DELAY_MS = 300;

export interface AnalysisInput {
  ruleId: string;
  ruleKind: "DECISION" | "DERIVE";
  hitPolicy: HitPolicy | null;
  vars: readonly StoredVar[];
  rows: readonly StoredRow[];
}

export interface AnalysisJob {
  seq: number;
  input: AnalysisInput;
}

export interface AnalysisReply {
  seq: number;
  result: AnalysisResult;
}

export interface WorkerLike {
  onmessage: ((e: MessageEvent<AnalysisReply>) => void) | null;
  onerror: ((e: unknown) => void) | null;
  postMessage(job: AnalysisJob): void;
  terminate(): void;
}

export function analyzeNow(input: AnalysisInput): AnalysisResult {
  return runAnalysis(input.ruleId, input.ruleKind, input.hitPolicy, input.vars, input.rows);
}

/** Worker 에 한 번에 한 일만 맡긴다 — 일하는 동안 들어온 입력은 가장 최근 것만 남는다(2,600행 검사가 줄줄이 쌓이지 않게). */
export class AnalysisScheduler {
  private seq = 0;
  private busy = false;
  private waiting: AnalysisJob | null = null;

  constructor(
    private readonly worker: WorkerLike,
    onReply: (reply: AnalysisReply) => void,
    private readonly onFail: () => void,
  ) {
    worker.onmessage = (e) => {
      this.busy = false;
      onReply(e.data);
      this.flush();
    };
    worker.onerror = () => onFail();
  }

  /** 입력을 맡기고 그 순번을 돌려준다. */
  submit(input: AnalysisInput): number {
    this.seq += 1;
    this.waiting = { seq: this.seq, input };
    this.flush();
    return this.seq;
  }

  dispose(): void {
    this.worker.terminate();
  }

  private flush(): void {
    if (this.busy || !this.waiting) return;
    const job = this.waiting;
    this.waiting = null;
    this.busy = true;
    try {
      this.worker.postMessage(job);
    } catch {
      // 보낼 수 없는 입력(structured clone 실패)이면 "검사 중" 에 멈추지 않고 동기 검사로 돌린다.
      this.busy = false;
      this.onFail();
    }
  }
}

function createAnalysisWorker(): { worker: WorkerLike; release: () => void } | null {
  if (!workerSource || typeof Worker === "undefined" || typeof Blob === "undefined" || typeof URL.createObjectURL !== "function") return null;
  const url = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  try {
    const worker = new Worker(url) as unknown as WorkerLike;
    return { worker, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

export interface RuleAnalysisState {
  /** 가장 최근에 끝난 검사 — 검사 중이면 앞 입력의 결과다. 입력이 없거나 아직 한 번도 끝나지 않았으면 null. */
  result: AnalysisResult | null;
  /** 지금 입력의 검사가 아직 끝나지 않았다. */
  pending: boolean;
}

/** `input` 이 null 이면 검사하지 않는다(변경 없음 → 서버 검사를 보인다). input 은 내용이 바뀔 때만 새 객체여야 한다(useMemo). */
export function useRuleAnalysis(input: AnalysisInput | null): RuleAnalysisState {
  const [workerFailed, setWorkerFailed] = useState(false);
  const [scheduler, setScheduler] = useState<AnalysisScheduler | null>(null);
  const [done, setDone] = useState<{ input: AnalysisInput; result: AnalysisResult } | null>(null);
  const sentRef = useRef<{ seq: number; input: AnalysisInput } | null>(null);
  const useWorker = !workerFailed && !!workerSource && typeof Worker !== "undefined";

  useEffect(() => {
    if (!useWorker) return;
    const created = createAnalysisWorker();
    if (!created) {
      setWorkerFailed(true);
      return;
    }
    const s = new AnalysisScheduler(
      created.worker,
      (reply) => {
        const sent = sentRef.current;
        if (sent && sent.seq === reply.seq) setDone({ input: sent.input, result: reply.result });
      },
      () => setWorkerFailed(true),
    );
    setScheduler(s);
    return () => {
      s.dispose();
      created.release();
      setScheduler(null);
    };
  }, [useWorker]);

  useEffect(() => {
    if (!scheduler) return;
    if (!input) {
      sentRef.current = null;
      setDone(null);
      return;
    }
    const timer = setTimeout(() => {
      sentRef.current = { seq: scheduler.submit(input), input };
    }, ANALYSIS_DELAY_MS);
    return () => clearTimeout(timer);
  }, [scheduler, input]);

  const syncResult = useMemo(() => (!useWorker && input ? analyzeNow(input) : null), [useWorker, input]);
  if (!useWorker) return { result: syncResult, pending: false };
  if (!input) return { result: null, pending: false };
  return { result: done?.result ?? null, pending: done?.input !== input };
}
