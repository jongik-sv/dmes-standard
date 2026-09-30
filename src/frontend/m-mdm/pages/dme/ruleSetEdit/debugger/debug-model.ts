/**
 * 디버거 모델(3단계 계획 P9) — 서버 기록 실행(`execute`) 한 번의 기록 위에서 커서를 옮기는 순수 함수. React 의존이 없다.
 * 커서 k(0 ≤ k ≤ n, n = 기록 노드 수)는 "노드 k 실행 전"이다(P-D13). 기록이 없으면 커서는 -1 이다.
 *
 * 변수·멈춤·여기까지·실행 비교는 Task 5, 툴바 문구(`debugStatus`)·기대값 JSON(`expectedFromFinal`)은 Task 10 이 채웠다.
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

/** 기록이 없을 때의 디버그 툴바 문구. */
export const NO_RECORD_STATUS = "아직 실행하지 않았다. [한 단계]·[계속]으로 시작한다";
/** 실행 권한(`execute`)이 없을 때 실행 단추·메뉴의 title. */
export const RUN_DENIED_TITLE = "디버거는 편집 권한이 있어야 쓸 수 있다";

/**
 * 디버그 툴바 상태 문구(P-D13 — 커서 k 는 "노드 k 실행 전").
 * 기록 없음 → 시작 안내, 기록 노드 0개 → `실행 전 오류 — {첫 위반}`, k < n → `{k+1}/{n} · {nodeId} 실행 전`,
 * k = n 이고 마지막 노드가 ERROR → `오류로 멈춤 — {nodeId}: {첫 위반}`, 그 밖 k = n → `완료 · {n}단계 · 결과 변수 {m}개`.
 * 첫 위반은 그 노드의 위반, 없으면 세트 전체 위반의 첫 문구다.
 */
export function debugStatus(trace: RunTrace | null, cursor: number): string {
  if (!trace) return NO_RECORD_STATUS;
  const n = trace.nodes.length;
  const firstOf = (own: readonly { message: string }[] | null | undefined) => own?.[0]?.message ?? trace.violations?.[0]?.message ?? "";
  if (n === 0) return `실행 전 오류 — ${firstOf(null)}`;
  const k = Math.max(0, Math.trunc(cursor));
  if (k < n) return `${k + 1}/${n} · ${trace.nodes[k].nodeId} 실행 전`;
  const lastNode = trace.nodes[n - 1];
  if (lastNode.status === "ERROR") return `오류로 멈춤 — ${lastNode.nodeId}: ${firstOf(lastNode.violations)}`;
  return `완료 · ${n}단계 · 결과 변수 ${Object.keys(trace.finalValues ?? {}).length}개`;
}

/** TypedValue → 기대값 JSON 값. 서버 `RuleCaseJudge.sameValue` 가 받는 모양(NUMBER 는 십진 문자열 그대로, LIST 는 items 를 원소마다). */
function expectedValue(v: TypedValue | null | undefined): unknown {
  if (v == null) return null;
  switch (v.type) {
    case "NULL":
      return null;
    case "BOOLEAN":
      return v.value === "true";
    case "LIST":
      return (v.items ?? []).map(expectedValue);
    default:
      return v.value;
  }
}

/**
 * 케이스 기대값 JSON — 실행 결과의 최종 변수로 채운다(Review Focus 1). 키 순서는 finalValues 그대로다.
 * NUMBER 는 글자 그대로(`1.10` 을 `1.1` 로 바꾸지 않는다 — 서버가 BigDecimal 로 견준다), BOOLEAN 은 불린, NULL 은 null,
 * LIST 는 기록의 `items` 를 같은 규칙으로 푼 배열이다(Task 4 ⚠️ — 기록의 LIST 에는 value 가 없다).
 */
export function expectedFromFinal(finalValues: Record<string, TypedValue>): string {
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(finalValues ?? {})) out[name] = expectedValue(v);
  return JSON.stringify(out, null, 2);
}
