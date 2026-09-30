/**
 * 디버거 모델(3단계 계획 P9) — 서버 기록 실행(`execute`) 한 번의 기록 위에서 커서를 옮기는 순수 함수. React 의존이 없다.
 * 커서 k(0 ≤ k ≤ n, n = 기록 노드 수)는 "노드 k 실행 전"이다(P-D13). 기록이 없으면 커서는 -1 이다.
 *
 * Task 0 은 서명만 박는다. 본문은 Task 5(변수·멈춤·여기까지·실행 비교)와 Task 10(툴바 문구·기대값 JSON)이 채운다.
 */
import type { RunTrace, RuleSetFlow, TypedValue } from "@/contract/engine-contract.generated";

import { frames, sameTyped } from "../trace-view";

/** 변수 패널 한 줄 — 커서 자리에서 본 값. created·changed 는 바로 앞 노드가 만들었거나 바꿨는가. */
export interface DebugVar {
  name: string;
  value: TypedValue;
  created: boolean;
  changed: boolean;
}

/** [여기까지 실행] 결과 — 멈출 자리(index) 또는 한 줄 알림. */
export type RunToResult = { index: number } | { notice: string };

export const PASSED_NOTICE = "이 노드는 이미 지났다. [처음부터] 뒤 다시 누른다";
export const NOT_ON_PATH_NOTICE = "이 입력으로는 이 노드를 지나지 않는다";

/** 실행 비교(E7) 값 한 줄. */
export interface ValueDiffRow {
  name: string;
  before: TypedValue | null;
  after: TypedValue | null;
  same: boolean;
}

/** 실행 비교 — 결과 값 차이와 한쪽 실행에만 지난 노드. */
export interface RunDiff {
  values: ValueDiffRow[];
  onlyBefore: string[];
  onlyAfter: string[];
}

/** 커서 k 에서 본 변수(이름 순). k < n 이면 노드 k 실행 전 그 노드 범위의 ctx, k ≥ n 이면 마지막 노드 뒤. */
export function variablesAt(trace: RunTrace, flow: RuleSetFlow, cursor: number): DebugVar[] {
  const n = trace.nodes.length;
  const k = Math.max(0, Math.trunc(cursor));
  const fr = n > 0 ? frames(trace, flow) : [];
  const ctx = n === 0 ? trace.input : k < n ? fr[k].before : fr[n - 1].ctx;
  // created·changed 는 바로 앞 노드가 바꾼 이름 가운데 — 그 노드 실행 전 ctx 에 없었으면 created, 있었으면 changed.
  // 앞 노드가 다른 병렬 갈래에 있으면(둘째 갈래 첫 노드·합류 전) 그 노드가 바꾼 값은 지금 범위에 없으므로, 지금 값이 앞 노드 실행 뒤 값과 같을 때만 표시한다.
  const prevFrame = n === 0 || k === 0 ? null : fr[Math.min(k, n) - 1];
  const touched = new Map<string, { existed: boolean; after: TypedValue | undefined }>();
  if (prevFrame) {
    const had = new Set(Object.keys(prevFrame.before).map((x) => x.toLowerCase()));
    const afterOf = (name: string) => Object.entries(prevFrame.ctx).find(([key]) => key.toLowerCase() === name)?.[1];
    for (const name of prevFrame.changed) {
      const lower = name.toLowerCase();
      touched.set(lower, { existed: had.has(lower), after: afterOf(lower) });
    }
  }
  return Object.entries(ctx)
    .map(([name, value]) => {
      const t = touched.get(name.toLowerCase());
      const mine = !!t && sameTyped(t.after, value);
      return { name, value, created: mine && !t.existed, changed: mine && t.existed };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** from(inclusive 면 포함) 부터 중단점 노드가 있는 첫 커서, 없으면 null. */
export function nextStop(trace: RunTrace, from: number, inclusive: boolean, stops: ReadonlySet<string>): number | null {
  for (let i = Math.max(0, inclusive ? from : from + 1); i < trace.nodes.length; i++) if (stops.has(trace.nodes[i].nodeId)) return i;
  return null;
}

/** [여기까지 실행] — 커서(inclusive 면 포함) 뒤에서 nodeId 를 찾는다. 앞에만 있으면 PASSED_NOTICE, 기록에 없으면 NOT_ON_PATH_NOTICE. */
export function runToIndex(trace: RunTrace, cursor: number, inclusive: boolean, nodeId: string): RunToResult {
  const start = Math.max(0, inclusive ? cursor : cursor + 1);
  const ids = trace.nodes.map((t) => t.nodeId);
  for (let i = start; i < ids.length; i++) if (ids[i] === nodeId) return { index: i };
  return ids.slice(0, Math.min(start, ids.length)).includes(nodeId) ? { notice: PASSED_NOTICE } : { notice: NOT_ON_PATH_NOTICE };
}

/** 두 실행 기록 비교(E7) — 최종 결과 값과 지난 노드 차이. */
export function compareRuns(before: RunTrace, after: RunTrace): RunDiff {
  const a = before.finalValues ?? {};
  const b = after.finalValues ?? {};
  const names = [...Object.keys(a), ...Object.keys(b).filter((x) => !Object.prototype.hasOwnProperty.call(a, x))];
  const values = names.map((name) => {
    const x = Object.prototype.hasOwnProperty.call(a, name) ? a[name] : null;
    const y = Object.prototype.hasOwnProperty.call(b, name) ? b[name] : null;
    return { name, before: x, after: y, same: sameTyped(x, y) };
  });
  const visited = (t: RunTrace) => [...new Set(t.nodes.map((x) => x.nodeId))];
  const va = visited(before);
  const vb = visited(after);
  const inB = new Set(vb);
  const inA = new Set(va);
  return { values, onlyBefore: va.filter((id) => !inB.has(id)), onlyAfter: vb.filter((id) => !inA.has(id)) };
}

/** 디버그 툴바 상태 문구(예: "3/7 r2 실행 전"). 기록이 없으면 빈 글자. */
export function debugStatus(trace: RunTrace | null, cursor: number): string {
  return ""; // SEAM(T10): 툴바 문구(진행·끝·멈춤)
}

/** 케이스 기대값 JSON — 실행 결과의 최종 변수로 채운다(Review Focus 1). */
export function expectedFromFinal(finalValues: Record<string, TypedValue>): string {
  return "{}"; // SEAM(T10): 최종 변수 → 기대값 JSON(숫자 표기·BOOLEAN 왕복)
}
