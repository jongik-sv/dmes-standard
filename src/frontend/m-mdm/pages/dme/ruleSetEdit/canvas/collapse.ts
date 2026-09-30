/**
 * 블록 접기 보기(3단계 계획 D16) — 접힌 분기의 안쪽 노드를 감추고 분기에서 합류 뒤로 선을 다시 잇는 캔버스용 흐름을 만든다(저장 흐름은 그대로).
 * React 의존이 없다.
 */
import { blockMembers, type EditFlow } from "../flow-edit";

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

/**
 * 접힌 분기 가운데 다른 접힌 분기 안에 있지 않은 것(바깥이 이긴다)만 쓴다. 닫히지 않은 블록·없는 ID 는 무시한다.
 * 숨길 노드 = 분기 자신을 뺀 블록 멤버(안쪽 + 짝 합류). 합류에서 나가는 선은 `from` 을 분기로 바꾼 사본(같은 선 ID),
 * 숨긴 노드에 닿는 나머지 선(분기에서 나가는 갈래·안쪽 선)은 뺀다. 원래 흐름은 바꾸지 않는다.
 * `blocks[분기].members` 는 분기 자신을 포함한 블록 멤버 전체(초점 이동 대상 찾기용), `count` 는 분기·합류를 뺀 안쪽 노드 수다.
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
  for (const id of top) {
    const members = closed.get(id)!;
    for (const m of members) if (m !== id) hidden.add(m);
    blocks[id] = { count: members.length - 2, members };
    const merge = flow.nodes.find((n) => n.kind === "MERGE" && n.splitId === id && members.includes(n.id));
    if (merge) mergeToSplit.set(merge.id, id);
  }
  const edges = flow.edges.flatMap((e) => {
    const split = mergeToSplit.get(e.from);
    if (split) return hidden.has(e.to) ? [] : [{ ...e, from: split }];
    return hidden.has(e.from) || hidden.has(e.to) ? [] : [e];
  });
  // 분기에서 나가는 갈래 선은 위에서 `hidden.has(e.to)` 로 빠졌다(갈래가 곧바로 합류로 가는 빈 갈래도 합류가 숨어 빠진다).
  return { flow: { ...flow, nodes: flow.nodes.filter((n) => !hidden.has(n.id)), edges }, hidden, blocks };
}
