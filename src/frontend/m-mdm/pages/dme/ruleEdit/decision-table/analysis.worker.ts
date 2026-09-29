/**
 * 즉시 검사 Worker(I13) — 화면 스레드에서 돌면 2,600행 표에서 편집마다 1~2초씩 멈춰서 `runAnalysis` 를 여기로 옮겼다.
 * `inline-worker:` 로 따로 묶여 Blob URL 로 뜬다(use-rule-analysis). 입력·출력은 순수 데이터라 structured clone 으로 오간다.
 */
import { runAnalysis } from "./analysis";
import type { AnalysisJob, AnalysisReply } from "./use-rule-analysis";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<AnalysisJob>) => void) | null;
  postMessage(reply: AnalysisReply): void;
};

scope.onmessage = (e) => {
  const { seq, input } = e.data;
  scope.postMessage({ seq, result: runAnalysis(input.ruleId, input.ruleKind, input.hitPolicy, input.vars, input.rows) });
};
