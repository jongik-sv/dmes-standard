/**
 * 디버깅 중 룰 링크 → 룰 화면 값 테스트 채우기. 넘기는 값은 그 룰 노드가 읽은 값(`NodeTrace.reads`)이다.
 *
 * 트레이스 상세의 [룰 편집 열기]는 누른 그 실행의 reads 를 싣는다. 캔버스 노드 링크와 우클릭 [룰 편집 열기]는 노드 ID 만 알므로, 커서 앞에서
 * 그 노드가 마지막으로 실행된 기록의 reads 를 싣는다. 커서 노드(실행 전)는 노드 상세처럼 아직 실행하지 않은 것으로 본다. 커서 앞에서 실행된 적이
 * 없거나 읽은 값이 없으면 값 없이 연다(디버그가 아닐 때와 같다).
 */
import type { NodeTrace, RunTrace, TypedValue } from "@/contract/engine-contract.generated";

/** 룰 링크가 함께 넘기는 것 — 읽은 값(트레이스 상세) 또는 노드 ID(캔버스 노드). */
export type RuleLinkFrom = { inputs: Readonly<Record<string, TypedValue>> | null | undefined } | { nodeId: string };

/** 링크가 읽을 디버그 기록과 커서(`trace.nodes[0..cursor)` 실행 끝, `nodes[cursor]` 지금 노드). */
export interface DebugLinkSource {
  trace: RunTrace;
  cursor: number;
}

/** 커서 앞(`nodes[0..cursor)`)에서 그 노드의 가장 최근 실행. 없으면 null. */
export function latestRunAt(trace: RunTrace, cursor: number, nodeId: string): NodeTrace | null {
  for (let i = Math.min(Math.trunc(cursor), trace.nodes.length) - 1; i >= 0; i--) {
    if (trace.nodes[i].nodeId === nodeId) return trace.nodes[i];
  }
  return null;
}

/** 넘길 읽은 값 — 비었으면 null(값 없이 연다). */
export function linkInputs(from: RuleLinkFrom | undefined, source: DebugLinkSource | null): Record<string, TypedValue> | null {
  if (!from) return null;
  const reads = "nodeId" in from ? (source ? latestRunAt(source.trace, source.cursor, from.nodeId)?.reads : null) : from.inputs;
  return reads && Object.keys(reads).length > 0 ? { ...reads } : null;
}
