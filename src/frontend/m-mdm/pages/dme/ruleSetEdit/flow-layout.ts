/**
 * 룰 세트 흐름 자동 배치(2단계 계획 P8) — dagre 로 위→아래 쌓는다. React 의존이 없다.
 * 좌표는 노드 좌상단이고 정수다. 저장된 `view.positions` 가 자동 배치를 덮는다.
 */
import dagre from "@dagrejs/dagre";

import type { FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

import { clearRoutes, setPositions, type EditFlow, type FlowPos } from "./flow-edit";

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

/** 새 노드 자리를 찾을 때 두는 노드 사이 여백(흐름 좌표). 맞닿는 것도 겹침으로 본다. */
export const PLACE_GAP = 16;
/** 비켜 놓을 때 한 번에 옮기는 거리와 좌우로 찾는 횟수(한쪽). 다 막히면 모든 노드 오른쪽 끝에 둔다. */
const PLACE_STEP = 24;
const PLACE_TRIES = 40;

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/** 장애물 상자 — 분기는 접혔을 때 룰 크기 상자로 그려지므로(D16) 둘 중 큰 크기로 잡는다. */
function obstacleSize(kind: FlowNodeKind): { w: number; h: number } {
  const s = NODE_SIZE[kind];
  if (kind !== "IF" && kind !== "PARALLEL") return s;
  return { w: Math.max(s.w, NODE_SIZE.RULE.w), h: Math.max(s.h, NODE_SIZE.RULE.h) };
}

/**
 * 노드를 만드는 편집(끼우기·붙여넣기·복제)의 결과 after 에서, 새 노드(before 에 없던 ID)가 다른 노드와 겹치지 않는 자리를 잡아
 * `view.positions` 에 새 노드 위치만 적는다(브라우저 확인 5번). 저장 위치가 하나도 없는 흐름은 자동 배치가 모두 풀어 주므로 그대로 돌려준다.
 *
 * - 다른 노드의 자리 = `positionsOf(after)`(저장 위치 + 새 흐름의 자동 배치). 자동 배치는 저장 위치를 보지 않으므로 새 노드 위치를 적어도 이 자리는 그대로다.
 * - 새 노드끼리의 모양(분기·합류·안쪽)은 `autoLayout(after)` 의 상대 위치를 쓴다.
 * - 기준점 = 조각으로 들어오는 앞 노드들과 조각에서 나가는 뒤 노드들의 가운데(실제 위치)의 중간. 겹치면 좌우로 PLACE_STEP 씩(오른쪽 먼저) 비켜 보고,
 *   PLACE_TRIES 번 안에 못 찾으면 모든 노드 오른쪽 끝 너머에 둔다(항상 겹치지 않는다).
 * - 입력은 바꾸지 않는다. 한 번의 편집 안에서 부르므로 되돌리기는 한 칸이다.
 */
export function placeNewNodes(before: EditFlow, after: EditFlow): EditFlow {
  if (Object.keys(before.view?.positions ?? {}).length === 0) return after;
  const old = new Set((before.nodes ?? []).map((n) => n.id));
  const fresh = after.nodes.filter((n) => !old.has(n.id));
  if (fresh.length === 0) return after;
  const isNew = new Set(fresh.map((n) => n.id));
  const kind = new Map(after.nodes.map((n) => [n.id, n.kind] as const));
  const all = positionsOf(after);
  const dag = autoLayout(after);

  const center = (id: string) => {
    const p = all[id];
    const s = NODE_SIZE[kind.get(id)!];
    return { x: p.x + s.w / 2, y: p.y + s.h / 2 };
  };
  const mean = (ids: string[]) =>
    ids.length === 0 ? null : { x: ids.reduce((a, id) => a + center(id).x, 0) / ids.length, y: ids.reduce((a, id) => a + center(id).y, 0) / ids.length };

  // 새 노드 조각의 모양(자동 배치 상대 위치)과 바깥 상자.
  let fx1 = Infinity, fy1 = Infinity, fx2 = -Infinity, fy2 = -Infinity;
  for (const n of fresh) {
    const p = dag[n.id];
    const s = NODE_SIZE[n.kind];
    fx1 = Math.min(fx1, p.x);
    fy1 = Math.min(fy1, p.y);
    fx2 = Math.max(fx2, p.x + s.w);
    fy2 = Math.max(fy2, p.y + s.h);
  }
  const preds = [...new Set(after.edges.filter((e) => isNew.has(e.to) && !isNew.has(e.from) && all[e.from]).map((e) => e.from))];
  const succs = [...new Set(after.edges.filter((e) => isNew.has(e.from) && !isNew.has(e.to) && all[e.to]).map((e) => e.to))];
  const a = mean(preds);
  const b = mean(succs);
  const anchor = a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : (a ?? b ?? { x: (fx1 + fx2) / 2, y: (fy1 + fy2) / 2 });
  const baseDx = Math.round(anchor.x - (fx1 + fx2) / 2);
  const baseDy = Math.round(anchor.y - (fy1 + fy2) / 2);

  const obstacles: Box[] = [];
  let right = -Infinity;
  for (const n of after.nodes) {
    if (isNew.has(n.id)) continue;
    const p = all[n.id];
    const s = obstacleSize(n.kind);
    obstacles.push({ x1: p.x - PLACE_GAP, y1: p.y - PLACE_GAP, x2: p.x + s.w + PLACE_GAP, y2: p.y + s.h + PLACE_GAP });
    right = Math.max(right, p.x + s.w);
  }
  const at = (dx: number, dy: number): Record<string, FlowPos> => {
    const out: Record<string, FlowPos> = {};
    for (const n of fresh) out[n.id] = { x: dag[n.id].x + dx, y: dag[n.id].y + dy };
    return out;
  };
  const clear = (pos: Record<string, FlowPos>) =>
    fresh.every((n) => {
      const p = pos[n.id];
      const s = NODE_SIZE[n.kind];
      const box = { x1: p.x, y1: p.y, x2: p.x + s.w, y2: p.y + s.h };
      return obstacles.every((o) => !overlaps(box, o));
    });
  for (let k = 0; k <= PLACE_TRIES; k++) {
    for (const sign of k === 0 ? [1] : [1, -1]) {
      const pos = at(baseDx + sign * k * PLACE_STEP, baseDy);
      if (clear(pos)) return setPositions(after, pos);
    }
  }
  // 좌우가 다 막혔다 — 모든 노드 오른쪽 끝 너머(항상 비어 있다).
  return setPositions(after, at(Math.round(right + PLACE_GAP * 2 - fx1), baseDy));
}

/** [자동 정렬] — 모든 노드 위치를 자동 배치로 덮고 선 경로(C14)를 함께 지운다. 한 번의 편집(이력 한 칸)이다. */
export function autoArrange(f: EditFlow): EditFlow {
  return clearRoutes(setPositions(f, autoLayout(f)));
}
