/**
 * 캔버스 변수 표시(2단계 계획 P8) — 선 변수 칩, 검사 점, 가까운 선. React 의존이 없다.
 */
import type { RuleSetFlow } from "@/contract/engine-contract.generated";

import { blockMembers, moveExcludedEdges, type EditFlow, type FlowPos } from "./flow-edit";
import { nodeSizeOf, type StyledFlow } from "./flow-layout";
import { CATCH_NAMES } from "./flow-model";
import type { RuleIoMap, RuleSetCheck, SetCallIoMap } from "./types";

/**
 * RULE 노드에서 나가는 선 → 그 룰 결과 이름, SET 노드에서 나가는 선 → 하위 세트 출력 이름(겉모양 순서, 하위 세트 spec §9).
 * 받는 노드에서 나가는 선은 처리 갈래가 읽는 CATCH_* 예약 이름. 이름이 없으면(겉모양을 아직 받지 않음 포함) 키를 만들지 않는다.
 */
export function edgeChips(f: RuleSetFlow, rules: RuleIoMap, calls: SetCallIoMap = {}): Record<string, string[]> {
  const namesOf = new Map<string, string[]>();
  const catches = new Set<string>();
  for (const n of f.nodes ?? []) {
    if (n.kind === "RULE" && n.ruleId) namesOf.set(n.id, (rules[n.ruleId]?.results ?? []).map((r) => r.name));
    else if (n.kind === "SET" && n.setId) namesOf.set(n.id, (calls[n.setId]?.outputs ?? []).map((o) => o.name));
    else if (n.kind === "CATCH") catches.add(n.id);
  }
  const out: Record<string, string[]> = {};
  for (const e of f.edges ?? []) {
    // 처리 갈래 첫 선: 받는 노드가 넣는 예약 이름(받는 노드 spec §8)
    if (catches.has(e.from)) {
      out[e.id] = [...CATCH_NAMES];
      continue;
    }
    const names = namesOf.get(e.from);
    if (names && names.length > 0) out[e.id] = names;
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
  f: RuleSetFlow & StyledFlow,
  pos: Readonly<Record<string, FlowPos>>,
  at: FlowPos,
  max = 80,
  exclude?: ReadonlySet<string>,
): string | null {
  const size = new Map((f.nodes ?? []).map((n) => [n.id, nodeSizeOf(f, n)] as const));
  let best: string | null = null;
  let bestD = Infinity;
  for (const e of f.edges ?? []) {
    if (exclude?.has(e.id)) continue;
    const a = pos[e.from];
    const b = pos[e.to];
    const sa = size.get(e.from);
    const sb = size.get(e.to);
    if (!a || !b || !sa || !sb) continue;
    const mx = (a.x + sa.w / 2 + b.x + sb.w / 2) / 2;
    const my = (a.y + sa.h + b.y) / 2;
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
  f: RuleSetFlow & StyledFlow,
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

/**
 * 흐름 좌표 `at` 을 품은 노드(그린 상자 = pos 좌상단 + 노드별 크기 `nodeSizeOf`) 가운데 kinds 에 든 것 — 겹치면 흐름 노드 배열에서 뒤의 것. 없으면 null.
 * 룰 목록 줄을 빈 단계·룰 노드 위에 놓을 때(4단계 T1).
 */
export function nodeAtPoint(f: RuleSetFlow & StyledFlow, pos: Readonly<Record<string, FlowPos>>, at: FlowPos, kinds: ReadonlySet<string>): string | null {
  let hit: string | null = null;
  for (const n of f.nodes ?? []) {
    if (!kinds.has(n.kind)) continue;
    const p = pos[n.id];
    if (!p) continue;
    const s = nodeSizeOf(f, n);
    if (at.x >= p.x && at.x <= p.x + s.w && at.y >= p.y && at.y <= p.y + s.h) hit = n.id;
  }
  return hit;
}
