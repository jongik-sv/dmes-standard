/**
 * 캔버스 변수 표시(2단계 계획 P8) — 선 변수 칩, 검사 점, 가까운 선. React 의존이 없다.
 */
import type { RuleSetFlow } from "@/contract/engine-contract.generated";

import { blockMembers, moveExcludedEdges, type EditFlow, type FlowPos } from "./flow-edit";
import { NODE_SIZE } from "./flow-layout";
import type { RuleIoMap, RuleSetCheck } from "./types";

/** RULE 노드에서 나가는 선 → 그 룰 결과 이름(순서대로). 결과가 없으면 키를 만들지 않는다. */
export function edgeChips(f: RuleSetFlow, rules: RuleIoMap): Record<string, string[]> {
  const ruleOf = new Map<string, string>();
  for (const n of f.nodes ?? []) if (n.kind === "RULE" && n.ruleId) ruleOf.set(n.id, n.ruleId);
  const out: Record<string, string[]> = {};
  for (const e of f.edges ?? []) {
    const rid = ruleOf.get(e.from);
    if (rid === undefined) continue;
    const names = (rules[rid]?.results ?? []).map((r) => r.name);
    if (names.length > 0) out[e.id] = names;
  }
  return out;
}

function marks(checks: readonly RuleSetCheck[], key: "nodeId" | "edgeId"): Record<string, "REJECT" | "WARN"> {
  const out: Record<string, "REJECT" | "WARN"> = {};
  for (const c of checks) {
    const id = c[key];
    if (!id) continue;
    if (out[id] !== "REJECT") out[id] = c.severity;
  }
  return out;
}

export const nodeMarks = (checks: readonly RuleSetCheck[]) => marks(checks, "nodeId");
export const edgeMarks = (checks: readonly RuleSetCheck[]) => marks(checks, "edgeId");

/**
 * 선 중점(출발 노드 아래 가운데와 도착 노드 위 가운데의 가운데)이 `at` 에서 max 안인 가장 가까운 선. 같으면 앞쪽 선.
 * `exclude` 에 든 선은 후보에서 뺀다(노드를 옮길 때 자기 자리·자기 블록 안 선).
 */
export function nearestEdge(
  f: RuleSetFlow,
  pos: Readonly<Record<string, FlowPos>>,
  at: FlowPos,
  max = 80,
  exclude?: ReadonlySet<string>,
): string | null {
  const kind = new Map((f.nodes ?? []).map((n) => [n.id, n.kind] as const));
  let best: string | null = null;
  let bestD = Infinity;
  for (const e of f.edges ?? []) {
    if (exclude?.has(e.id)) continue;
    const a = pos[e.from];
    const b = pos[e.to];
    const ka = kind.get(e.from);
    const kb = kind.get(e.to);
    if (!a || !b || !ka || !kb) continue;
    const mx = (a.x + NODE_SIZE[ka].w / 2 + b.x + NODE_SIZE[kb].w / 2) / 2;
    const my = (a.y + NODE_SIZE[ka].h + b.y) / 2;
    const d = Math.hypot(mx - at.x, my - at.y);
    if (d <= max && d < bestD) {
      best = e.id;
      bestD = d;
    }
  }
  return best;
}

/** 끌어 놓기 반경: 화면 80px 을 흐름 좌표로(확대 0.5 면 160). FlowCanvas 의 `dropRadius` 와 같은 식이다. */
const DROP_RADIUS_PX = 80;
const radiusAt = (zoom: number) => DROP_RADIUS_PX / (zoom > 0 ? zoom : 1);

/** 놓은 자리(흐름 좌표)의 대상 선 — 확대 배율을 반영한 반경 안 가장 가까운 선. */
export function dropTargetAt(
  f: RuleSetFlow,
  pos: Readonly<Record<string, FlowPos>>,
  at: FlowPos,
  zoom: number,
  exclude?: ReadonlySet<string>,
): string | null {
  return nearestEdge(f, pos, at, radiusAt(zoom), exclude);
}

/** 놓인 노드·블록을 끌다 놓은 자리의 대상 선 — 자기 자리·자기 블록 안 선은 뺀다(A2). `pos` 는 그려진 노드 위치 맵이다. */
export function resolveNodeDrop(f: EditFlow, pos: Readonly<Record<string, FlowPos>>, nodeId: string, pointer: FlowPos, zoom: number): string | null {
  return dropTargetAt(f, pos, pointer, zoom, moveExcludedEdges(f, nodeId));
}

/** 분기를 `delta` 만큼 끌 때 블록 멤버(분기·안쪽·짝 합류)가 가질 위치. 블록이 닫히지 않으면 빈 맵. 위치를 모르는 멤버는 뺀다. */
export function blockDragPositions(
  f: EditFlow,
  splitId: string,
  delta: FlowPos,
  basePos: Readonly<Record<string, FlowPos>>,
): Record<string, FlowPos> {
  const out: Record<string, FlowPos> = {};
  for (const id of blockMembers(f, splitId) ?? []) {
    const p = basePos[id];
    if (p) out[id] = { x: p.x + delta.x, y: p.y + delta.y };
  }
  return out;
}
