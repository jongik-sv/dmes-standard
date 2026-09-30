/**
 * 룰 세트 흐름 자동 배치(2단계 계획 P8) — dagre 로 위→아래 쌓는다. React 의존이 없다.
 * 좌표는 노드 좌상단이고 정수다. 저장된 `view.positions` 가 자동 배치를 덮는다.
 */
import dagre from "@dagrejs/dagre";

import type { FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

import type { EditFlow, FlowPos } from "./flow-edit";

export const NODE_SIZE: Readonly<Record<FlowNodeKind, { w: number; h: number }>> = {
  START: { w: 120, h: 36 },
  END: { w: 120, h: 36 },
  RULE: { w: 232, h: 68 },
  IF: { w: 176, h: 44 },
  PARALLEL: { w: 200, h: 14 },
  MERGE: { w: 28, h: 28 },
};

export function autoLayout(f: RuleSetFlow): Record<string, FlowPos> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 46 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of f.nodes ?? []) {
    const s = NODE_SIZE[n.kind];
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  for (const e of f.edges ?? []) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const out: Record<string, FlowPos> = {};
  for (const n of f.nodes ?? []) {
    const p = g.node(n.id);
    const s = NODE_SIZE[n.kind];
    out[n.id] = { x: Math.round(p.x - s.w / 2), y: Math.round(p.y - s.h / 2) };
  }
  return out;
}

export function positionsOf(f: EditFlow): Record<string, FlowPos> {
  return { ...autoLayout(f), ...(f.view?.positions ?? {}) };
}
