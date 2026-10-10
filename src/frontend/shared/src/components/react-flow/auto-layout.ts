/**
 * 일반 자동 배치(순수, React 의존 없음) — 노드 상자와 선을 받아 dagre 로 층을 나눠 놓고 왼쪽 위 좌표(정수)를 돌려준다.
 * React Flow 의 node.position 은 왼쪽 위다. dagre 는 가운데 좌표를 주므로 여기서 바꾼다.
 * 업무와 무관하다. 업무 규칙(노드 크기 재기, 어떤 선을 넣을지)은 화면이 정해서 넘긴다(Part B §18-1).
 * 선이 없는 노드는 기본으로 dagre 에 그대로 넣는다(isolated "rank"). "grid" 를 주면 선 묶음 아래에 격자로 놓는다 —
 * 관계 없는 표가 많은 ERD 처럼 dagre 가 첫 층에 한 줄로 길게 늘어놓는 것을 막는다.
 */
import dagre from "@dagrejs/dagre";

import type { FlowPos } from "./route-path";

export type LayoutDirection = "TB" | "BT" | "LR" | "RL";

export interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface AutoLayoutOptions {
  /** 층을 쌓는 방향(dagre rankdir). 기본 "TB". */
  direction?: LayoutDirection;
  /** 같은 층 노드 사이(dagre nodesep). 격자 칸 사이도 이 값이다. 기본 40. */
  nodeGap?: number;
  /** 층 사이(dagre ranksep). 격자를 선 묶음 아래에 둘 때 띄우는 거리도 이 값이다. 기본 60. */
  rankGap?: number;
  /** 결과의 가장 왼쪽 위. 기본 {x:0, y:0}. */
  origin?: FlowPos;
  /** 선이 없는 노드: "rank" 는 dagre 에 그대로, "grid" 는 선 묶음 아래 격자. 기본 "rank". */
  isolated?: "rank" | "grid";
  /** "grid" 의 열 수. 기본 ceil(sqrt(선 없는 노드 수)). */
  gridColumns?: number;
}

export const AUTO_LAYOUT_DEFAULTS = { direction: "TB", nodeGap: 40, rankGap: 60, isolated: "rank" } as const;

/** 크기가 0·음수·NaN 이면 1 로 본다(dagre 가 NaN 좌표를 내지 않게). */
const sizeOf = (v: number): number => (Number.isFinite(v) && v > 0 ? v : 1);

export function autoLayout(nodes: readonly LayoutNode[], edges: readonly LayoutEdge[], options: AutoLayoutOptions = {}): Record<string, FlowPos> {
  const direction = options.direction ?? AUTO_LAYOUT_DEFAULTS.direction;
  const nodeGap = options.nodeGap ?? AUTO_LAYOUT_DEFAULTS.nodeGap;
  const rankGap = options.rankGap ?? AUTO_LAYOUT_DEFAULTS.rankGap;
  const isolated = options.isolated ?? AUTO_LAYOUT_DEFAULTS.isolated;
  const origin = options.origin ?? { x: 0, y: 0 };

  // 같은 id 는 처음 것만 쓴다.
  const ids = new Set<string>();
  const list: LayoutNode[] = [];
  for (const n of nodes) {
    if (ids.has(n.id)) continue;
    ids.add(n.id);
    list.push({ id: n.id, width: sizeOf(n.width), height: sizeOf(n.height) });
  }
  if (list.length === 0) return {};

  // 자기 선·모르는 끝·같은 선 반복을 뺀다.
  const pairs: [string, string][] = [];
  const seen = new Set<string>();
  const linked = new Set<string>();
  for (const e of edges) {
    if (e.source === e.target || !ids.has(e.source) || !ids.has(e.target)) continue;
    const key = `${e.source}\u0000${e.target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([e.source, e.target]);
    linked.add(e.source);
    linked.add(e.target);
  }

  const ranked = isolated === "grid" ? list.filter((n) => linked.has(n.id)) : list;
  const loose = isolated === "grid" ? list.filter((n) => !linked.has(n.id)) : [];
  const out: Record<string, FlowPos> = {};
  let gridTop = origin.y;

  if (ranked.length > 0) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({ rankdir: direction, nodesep: nodeGap, ranksep: rankGap, marginx: 0, marginy: 0 });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of ranked) g.setNode(n.id, { width: n.width, height: n.height });
    for (const [s, t] of pairs) g.setEdge(s, t);
    dagre.layout(g);
    // dagre 가운데 좌표 → 왼쪽 위. 가장 왼쪽 위를 origin 에 맞춘다.
    const topLeft = ranked.map((n) => {
      const p = g.node(n.id) as { x: number; y: number };
      return { n, x: p.x - n.width / 2, y: p.y - n.height / 2 };
    });
    const minX = Math.min(...topLeft.map((p) => p.x));
    const minY = Math.min(...topLeft.map((p) => p.y));
    let bottom = origin.y;
    for (const p of topLeft) {
      const x = Math.round(p.x - minX + origin.x);
      const y = Math.round(p.y - minY + origin.y);
      out[p.n.id] = { x, y };
      bottom = Math.max(bottom, y + p.n.height);
    }
    gridTop = bottom + rankGap;
  }

  if (loose.length > 0) {
    // gridColumns 가 NaN·1 미만이면 기본 열 수를 쓴다(NaN 이면 격자 노드가 결과에서 빠진다).
    const given = options.gridColumns;
    const cols = given !== undefined && given >= 1 ? Math.floor(given) : Math.ceil(Math.sqrt(loose.length));
    let y = gridTop;
    for (let i = 0; i < loose.length; i += cols) {
      let x = origin.x;
      let rowHeight = 0;
      for (const n of loose.slice(i, i + cols)) {
        out[n.id] = { x: Math.round(x), y: Math.round(y) };
        x += n.width + nodeGap;
        rowHeight = Math.max(rowHeight, n.height);
      }
      y += rowHeight + nodeGap;
    }
  }
  return out;
}
