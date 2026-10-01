/**
 * 블록 접기 보기(3단계 계획 D16, implicit-join spec §8.4) — 접힌 분기의 안쪽 노드를 감추고 선을 다시 잇는 캔버스용 흐름을 만든다(저장 흐름은 그대로).
 * 병렬(과 옛 형식 IF)은 짝 합류를 감추고 합류에서 나가던 선(같은 ID)이 분기에서 나간다. 새 형식 IF 는 모이는 자리가 블록 밖이라 남고, 블록에서 모이는 자리로 가는
 * 꼬리·빈 갈래와 끝 선을 빼는 대신 그리기 전용 대표 선 `fold:{분기}` 하나를 첫 꼬리 자리에 둔다(J-D14 — 캔버스는 이 선에 손잡이를 주지 않는다). React 의존이 없다.
 */
import type { FlowEdge } from "@/contract/engine-contract.generated";

import { blockMembers, type EditFlow } from "../flow-edit";
import { joinOf } from "../flow-model";

/** 접힌 새 형식 IF 의 대표 선 ID 접두어(R20). */
export const FOLD_EDGE_PREFIX = "fold:";

export interface CollapsedView {
  /** 캔버스에 그릴 흐름. */
  flow: EditFlow;
  /** 감춘 노드 ID. */
  hidden: ReadonlySet<string>;
  /** 접힌 분기 ID → 안쪽 노드 수·멤버. */
  blocks: Readonly<Record<string, { count: number; members: string[] }>>;
}

const NONE: ReadonlySet<string> = new Set<string>();
const NO_BLOCKS: Readonly<Record<string, { count: number; members: string[] }>> = {};

const foldEdge = (s: string, to: string): FlowEdge => ({ id: `${FOLD_EDGE_PREFIX}${s}`, from: s, to, order: null, cond: null, otherwise: false, label: null });

/**
 * 접힌 분기 가운데 다른 접힌 분기 안에 있지 않은 것(바깥이 이긴다)만 쓴다. 닫히지 않은 블록·없는 ID 는 무시한다.
 * `blocks[분기].members` 는 분기 자신을 포함한 블록 멤버 전체(초점 이동 대상 찾기용), `count` 는 IF 가 멤버 − 1(분기), 병렬·옛 IF 가 − 2(분기·합류)다.
 */
export function collapseView(flow: EditFlow, collapsed: ReadonlySet<string>): CollapsedView {
  if (collapsed.size === 0) return { flow, hidden: NONE, blocks: NO_BLOCKS };
  const closed = new Map<string, string[]>();
  for (const id of collapsed) {
    const members = blockMembers(flow, id);
    if (members) closed.set(id, members);
  }
  const top: string[] = [];
  for (const [id] of closed) {
    let inside = false;
    for (const [other, members] of closed) if (other !== id && members.includes(id)) inside = true;
    if (!inside) top.push(id);
  }
  if (top.length === 0) return { flow, hidden: NONE, blocks: NO_BLOCKS };

  const hidden = new Set<string>();
  const blocks: Record<string, { count: number; members: string[] }> = {};
  const mergeToSplit = new Map<string, string>();
  /** 접힌 새 IF 멤버(분기 포함) → [분기, 모이는 자리]. */
  const foldOf = new Map<string, readonly [string, string]>();
  for (const id of top) {
    const members = closed.get(id)!;
    for (const m of members) if (m !== id) hidden.add(m);
    const merge = flow.nodes.find((n) => n.kind === "MERGE" && n.splitId === id && members.includes(n.id));
    blocks[id] = { count: members.length - (merge ? 2 : 1), members };
    if (merge) mergeToSplit.set(merge.id, id);
    else {
      const join = joinOf(flow, id);
      if (join != null) for (const m of members) foldOf.set(m, [id, join]);
    }
  }
  const edges: FlowEdge[] = [];
  const folded = new Set<string>();
  for (const e of flow.edges) {
    const split = mergeToSplit.get(e.from);
    if (split) {
      if (!hidden.has(e.to)) edges.push({ ...e, from: split });
      continue;
    }
    const fold = foldOf.get(e.from);
    if (fold) {
      // 블록 멤버에서 나가는 선 — 꼬리(모이는 자리로)는 대표 선 하나로, 갈래·안쪽·끝 선은 뺀다.
      if (e.to === fold[1] && !folded.has(fold[0])) {
        folded.add(fold[0]);
        edges.push(foldEdge(fold[0], fold[1]));
      }
      continue;
    }
    if (!hidden.has(e.from) && !hidden.has(e.to)) edges.push(e);
  }
  return { flow: { ...flow, nodes: flow.nodes.filter((n) => !hidden.has(n.id)), edges }, hidden, blocks };
}
