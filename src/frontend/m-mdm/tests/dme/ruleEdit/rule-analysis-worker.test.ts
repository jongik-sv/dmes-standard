// 의사결정표 즉시 검사 Worker 스케줄러 — Worker 에는 한 번에 한 일만 맡기고, 일하는 동안 들어온 입력은 가장 최근 것만 남는다.
// 단위 테스트에서는 `inline-worker:` 가 빈 문자열이라 화면은 동기 검사로 돈다(카드 테스트가 그 경로를 본다).
import { describe, expect, it } from "vitest";

import workerSource from "inline-worker:../../../pages/dme/ruleEdit/decision-table/analysis.worker.ts";
import {
  AnalysisScheduler,
  analyzeNow,
  type AnalysisInput,
  type AnalysisJob,
  type AnalysisReply,
  type WorkerLike,
} from "../../../pages/dme/ruleEdit/decision-table/use-rule-analysis";
import { SAMPLE_ROWS, SAMPLE_VARS } from "./fixtures";

class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<AnalysisReply>) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  posted: AnalysisJob[] = [];
  terminated = false;
  postMessage(job: AnalysisJob) {
    this.posted.push(job);
  }
  terminate() {
    this.terminated = true;
  }
  reply(seq: number) {
    this.onmessage?.({ data: { seq, result: { issues: [], failed: false } } } as MessageEvent<AnalysisReply>);
  }
}

const input = (ruleId: string): AnalysisInput => ({ ruleId, ruleKind: "DECISION", hitPolicy: "FIRST", vars: [], rows: [] });

describe("AnalysisScheduler", () => {
  it("일하는 동안 들어온 입력은 가장 최근 것 하나만 앞 일이 끝난 뒤 보낸다", () => {
    const w = new FakeWorker();
    const replies: number[] = [];
    const s = new AnalysisScheduler(w, (r) => replies.push(r.seq), () => {});
    expect(s.submit(input("a"))).toBe(1);
    expect(s.submit(input("b"))).toBe(2);
    expect(s.submit(input("c"))).toBe(3);
    expect(w.posted.map((j) => j.input.ruleId)).toEqual(["a"]);

    w.reply(1);
    expect(replies).toEqual([1]);
    expect(w.posted.map((j) => [j.seq, j.input.ruleId])).toEqual([
      [1, "a"],
      [3, "c"],
    ]);

    w.reply(3);
    expect(replies).toEqual([1, 3]);
    expect(w.posted).toHaveLength(2);
  });

  it("쉬고 있으면 바로 보낸다", () => {
    const w = new FakeWorker();
    const s = new AnalysisScheduler(w, () => {}, () => {});
    s.submit(input("a"));
    w.reply(1);
    s.submit(input("b"));
    expect(w.posted.map((j) => j.seq)).toEqual([1, 2]);
  });

  it("Worker 오류는 onFail 로 알리고, dispose 는 Worker 를 끝낸다", () => {
    const w = new FakeWorker();
    let failed = 0;
    const s = new AnalysisScheduler(w, () => {}, () => failed++);
    w.onerror?.(new Error("boom"));
    expect(failed).toBe(1);
    s.dispose();
    expect(w.terminated).toBe(true);
  });

  it("보내기가 실패하면(structured clone 오류) onFail 로 알린다", () => {
    const w = new FakeWorker();
    w.postMessage = () => {
      throw new Error("DataCloneError");
    };
    let failed = 0;
    const s = new AnalysisScheduler(w, () => {}, () => failed++);
    s.submit(input("a"));
    expect(failed).toBe(1);
  });
});

describe("Worker 입력", () => {
  it("단위 테스트에서는 Worker 소스가 비어 동기 검사로 돈다", () => {
    expect(workerSource).toBe("");
  });

  it("입력은 structured clone 을 거쳐도 같은 검사 결과를 낸다", () => {
    const i: AnalysisInput = {
      ruleId: "R1",
      ruleKind: "DECISION",
      hitPolicy: "UNIQUE",
      vars: SAMPLE_VARS,
      rows: [...SAMPLE_ROWS, ...SAMPLE_ROWS.map((r) => ({ ...r, rowId: r.rowId + 100 }))],
    };
    const direct = analyzeNow(i);
    expect(direct.issues.length).toBeGreaterThan(0);
    expect(analyzeNow(structuredClone(i))).toEqual(direct);
    expect(structuredClone(direct)).toEqual(direct);
  });
});
