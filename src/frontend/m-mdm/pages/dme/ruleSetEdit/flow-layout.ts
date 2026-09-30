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

/**
 * dagre 자동 배치. blocks 에 든 분기(접힌 블록, D16)는 룰 크기 상자로 그리므로 룰 크기로 배치한다 — 제 크기(병렬 200×14 등)로 배치하면
 * 접힌 상자가 아래 노드와 겹치고, 겹침 풀기가 그 노드를 옆으로 민다(고침 2회차 N1).
 */
export function autoLayout(f: RuleSetFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const sizeOf = (n: { id: string; kind: FlowNodeKind }) => NODE_SIZE[blocks[n.id] ? "RULE" : n.kind];
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 40, ranksep: 46 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of f.nodes ?? []) {
    const s = sizeOf(n);
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  for (const e of f.edges ?? []) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const out: Record<string, FlowPos> = {};
  for (const n of f.nodes ?? []) {
    const p = g.node(n.id);
    const s = sizeOf(n);
    out[n.id] = { x: Math.round(p.x - s.w / 2), y: Math.round(p.y - s.h / 2) };
  }
  return out;
}

/**
 * 접힌 분기 상자(룰 크기)와 제 크기 분기 상자의 가로 기준 차이 — 접힌 상자는 제 상자와 **가운데를 맞추고 위를 맞춘다**(Minor C).
 * 저장 좌표(`view.positions`)는 늘 제 크기 기준 좌상단이다. 접힌 상자 좌상단 x = 저장 x − foldOffsetX, y 는 같다.
 * dagre 도 같은 기준이다 — 한 층의 노드는 층 위에 맞춰지므로(y 같음) 가운데가 같으면 좌상단 x 만 이만큼 다르다. 분기가 아니면 0.
 */
export function foldOffsetX(kind: FlowNodeKind): number {
  return kind === "IF" || kind === "PARALLEL" ? Math.round((NODE_SIZE.RULE.w - NODE_SIZE[kind].w) / 2) : 0;
}

/**
 * 자동 배치 + 저장 위치. blocks 는 접힌 블록(룰 크기로 배치, autoLayout 참고).
 * 접힌 분기에 저장 위치가 있으면 접힌 상자 좌상단으로 바꿔 돌려준다(가운데 맞춤, `foldOffsetX`) — 펼쳐도 접어도 같은 가운데에 그린다.
 */
export function positionsOf(f: EditFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const saved = f.view?.positions ?? {};
  const out: Record<string, FlowPos> = { ...autoLayout(f, blocks), ...saved };
  for (const n of f.nodes ?? []) {
    const p = saved[n.id];
    if (p && blocks[n.id]) out[n.id] = { x: p.x - foldOffsetX(n.kind), y: p.y };
  }
  return out;
}

/** 겹침 풀기 여백(흐름 좌표) — 맞닿는 것도 겹침으로 본다. dagre 간격(nodesep 40·ranksep 46)보다 작아 자동 배치끼리는 걸리지 않는다. */
export const OVERLAP_GAP = 16;
/** 한 번에 미는 거리와 좌우로 찾는 횟수(한쪽). 상한 안에 빈자리가 없으면 그 자리에 둔다. */
const PUSH_STEP = 24;
const PUSH_TRIES = 40;

interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
const boxAt = (p: FlowPos, s: { w: number; h: number }, gap = 0): Box => ({ x1: p.x - gap, y1: p.y - gap, x2: p.x + s.w + gap, y2: p.y + s.h + gap });
const overlaps = (a: Box, b: Box) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;

/**
 * 그리는 위치의 겹침 풀기(브라우저 확인 5번, Ruling 19). 고정 노드(저장 위치가 있는 노드)는 절대 움직이지 않고, 고정 안 된 노드(자동 배치)만
 * boxes 순서대로 하나씩 가로(x)로 민다 — 오른쪽 먼저, 좌우 번갈아 PUSH_STEP 씩 PUSH_TRIES 번. 먼저 자리 잡은 노드(고정·앞 노드)와
 * OVERLAP_GAP 안으로 가까우면 민다. 상한 안에 빈자리가 없으면 원래 자리에 둔다. 고정 노드가 없으면 pos 를 그대로 돌려준다(자동 배치는 겹치지 않는다).
 * 좌표는 저장하지 않는다 — 한 레이아웃에서 계산한 좌표를 저장해 다른 레이아웃에서 그리면 다시 겹치기 때문이다. 입력은 바꾸지 않는다.
 */
export function resolveOverlaps(
  boxes: readonly { id: string; w: number; h: number }[],
  pos: Readonly<Record<string, FlowPos>>,
  pinned: ReadonlySet<string>,
): Record<string, FlowPos> {
  const live = boxes.filter((b) => pos[b.id]);
  if (!live.some((b) => pinned.has(b.id))) return pos as Record<string, FlowPos>;
  const out: Record<string, FlowPos> = { ...pos };
  const placed: Box[] = live.filter((b) => pinned.has(b.id)).map((b) => boxAt(pos[b.id], b));
  for (const b of live) {
    if (pinned.has(b.id)) continue;
    const p = pos[b.id];
    const free = (x: number) => {
      const me = boxAt({ x, y: p.y }, b, OVERLAP_GAP);
      return placed.every((o) => !overlaps(me, o));
    };
    let x = p.x;
    if (!free(x)) {
      for (let k = 1; k <= PUSH_TRIES; k++) {
        if (free(p.x + k * PUSH_STEP)) {
          x = p.x + k * PUSH_STEP;
          break;
        }
        if (free(p.x - k * PUSH_STEP)) {
          x = p.x - k * PUSH_STEP;
          break;
        }
      }
    }
    if (x !== p.x) out[b.id] = { x, y: p.y };
    placed.push(boxAt(out[b.id], b));
  }
  return out;
}

/**
 * 캔버스가 그리는 위치 — `positionsOf` 에 겹침 풀기를 더한다. 저장 위치가 있는 노드가 고정이다.
 * blocks 에 든 분기(접힌 블록)는 룰 크기 상자로 그리므로 그 크기로 본다(D16). 위치를 읽는 곳(끌기·블록 끌기·메모 자리)은 모두 이 값을 쓴다.
 */
export function drawnPositions(f: EditFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const saved = f.view?.positions ?? {};
  const pinned = new Set((f.nodes ?? []).filter((n) => saved[n.id]).map((n) => n.id));
  const boxes = (f.nodes ?? []).map((n) => ({ id: n.id, ...NODE_SIZE[blocks[n.id] ? "RULE" : n.kind] }));
  return resolveOverlaps(boxes, positionsOf(f, blocks), pinned);
}

/** [자동 정렬] — 모든 노드 위치를 자동 배치로 덮고 선 경로(C14)를 함께 지운다. 한 번의 편집(이력 한 칸)이다. */
export function autoArrange(f: EditFlow): EditFlow {
  return clearRoutes(setPositions(f, autoLayout(f)));
}
