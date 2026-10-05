/**
 * 디버거 "안으로 들어가기"(하위 세트 spec §11, C-D15, 계획 Task 9 Ruling 15·21) — 같은 캔버스에서 하위 기록·하위 흐름을 읽기 전용으로 보는 프레임.
 * React 의존이 없는 순수 함수다. 기록 재생이라 탭을 열지 않는다. 하위 세트를 고치려면 SET 노드 링크로 탭을 연다.
 *
 * 하위 흐름은 실행 응답의 `calledFlows`(서버가 기록의 `sub` 를 따라 모은 판정 시각의 RELEASED 흐름)에서 온다. 그 세트의 항목이 없으면(서버가 아직 주지 않음)
 * 들어갈 수 없다(`enterFrame` 이 null). 항목은 있는데 `flow` 가 null(FLOW_JSON 없음)이면 `ruleIds` 한 줄 흐름이다.
 * 하위 흐름은 편집기가 열 때와 같은 변환(`toEditFlow` — 옛 형식 IF 합류를 D-136 새 형식으로)을 거쳐 그린다(스펙 §11).
 */
import type { RunTrace, TypedValue } from "@/contract/engine-contract.generated";

import { toEditFlow, type EditFlow } from "../flow-edit";
import { frames } from "../trace-view";
import type { CalledFlow, RuleIo } from "../types";

export interface CallFrame {
  /** 부모 흐름의 SET 노드. */
  nodeId: string;
  setId: string;
  /** 경로 표시 — SET 노드 라벨, 없으면 세트명, 없으면 세트 ID. */
  label: string;
  /** 하위 세트 기록. */
  trace: RunTrace;
  /** 하위 세트의 저장된 흐름(실행 때 받은 것, 편집기 변환을 거친 것). */
  flow: EditFlow;
  /** 하위 흐름 룰들의 입출력(룰 노드 제목·칩). */
  rules: Record<string, RuleIo>;
  /** 0..n — "노드 k 실행 전"(P-D13). 들어갈 때는 끝(n). */
  cursor: number;
}

/**
 * 부모 기록의 SET 노드 nodeId 로 들어간다. 그 노드가 SET 이 아니거나 하위 기록이 없거나, 그 하위 세트의 흐름을 받지 못했으면(`called` 에 없음) null.
 */
export function enterFrame(
  parentTrace: RunTrace,
  parentFlow: { nodes: ReadonlyArray<{ id: string; label?: string | null }> },
  nodeId: string,
  called: Readonly<Record<string, CalledFlow | undefined>>,
): CallFrame | null {
  const n = parentTrace.nodes.find((x) => x.nodeId === nodeId && x.kind === "SET");
  const sub = n?.sub;
  if (!sub) return null;
  const cf = called[sub.setId];
  if (!cf) return null;
  const label = parentFlow.nodes.find((x) => x.id === nodeId)?.label?.trim() || cf.setName?.trim() || sub.setId;
  const rules: Record<string, RuleIo> = {};
  for (const r of cf.rules ?? []) rules[r.ruleId] = r;
  return { nodeId, setId: sub.setId, label, trace: sub, flow: toEditFlow(cf.flow ?? null, cf.ruleIds ?? []), rules, cursor: sub.nodes.length };
}

/** 경로 표시 조각 — ["세트 {최상위}", "{라벨}({노드 ID})", …]. */
export function callPath(rootSetId: string, stack: readonly CallFrame[]): string[] {
  return [`세트 ${rootSetId}`, ...stack.map((f) => `${f.label}(${f.nodeId})`)];
}

/** 같은 SET 노드 경로를 따라 다른 실행 기록에서 하위 기록을 찾는다(실행 비교). 경로가 비면 그 기록, 없으면 null. */
export function subTraceAt(trace: RunTrace, nodePath: readonly string[]): RunTrace | null {
  let cur: RunTrace | null = trace;
  for (const id of nodePath) {
    const n: RunTrace["nodes"][number] | undefined = cur.nodes.find((x) => x.nodeId === id && x.kind === "SET");
    cur = n?.sub ?? null;
    if (!cur) return null;
  }
  return cur;
}

/** 받아 처리한 예외 건수 — 하위 기록에서 실행된 받는 노드 수(그 하위 세트 안만, `RunTrace` 에는 `caught` 가 없다). */
export const caughtCount = (sub: RunTrace): number => sub.nodes.filter((n) => n.kind === "CATCH").length;

/** 프레임 커서 자리의 값 읽기(이름 대소문자 무시) — 캔버스 변수 칩 툴팁. 커서 0(또는 기록 없음)이면 하위 입력이다. */
export function frameValueAt(frame: CallFrame): (name: string) => TypedValue | null | undefined {
  const fr = frames(frame.trace, frame.flow);
  const ctx = fr.length === 0 || frame.cursor <= 0 ? frame.trace.input : fr[Math.min(frame.cursor, fr.length) - 1].ctx;
  return (name: string) => {
    if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
    const lower = name.toLowerCase();
    const k = Object.keys(ctx).find((x) => x.toLowerCase() === lower);
    return k === undefined ? undefined : ctx[k];
  };
}
