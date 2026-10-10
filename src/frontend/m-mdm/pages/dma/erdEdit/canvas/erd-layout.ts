/**
 * ERD 배치(순수) — 표 크기 어림과 관계 선을 shared autoLayout 에 넘긴다. 업무 규칙(어떤 관계를 선으로 볼지, 접기에 따른 크기)만 여기 둔다.
 * 방향은 왼쪽 → 오른쪽(부모가 왼쪽)이다. 표 노드의 선이 좌우 손잡이에 붙어서다(erd-geometry relationSides).
 * 관계 없는 표는 관계 묶음 아래 격자로 놓는다(dagre 는 첫 층에 한 줄로 길게 늘어놓는다).
 */
import { autoLayout, type FlowPos, type LayoutEdge } from "@dk-oasis/shared/react-flow";

import { nodeKey } from "../state/model-delta";
import type { ErdCommandJson, ErdFoldMode, ErdModelJson, ErdState } from "../types";
import { moveNodesCommand, type PlacedNode } from "./erd-commands";
import { keyMarks } from "./erd-flow";
import { NODE_WIDTH, nodeHeight } from "./erd-geometry";

export const ERD_LAYOUT = { direction: "LR", nodeGap: 40, rankGap: 100, isolated: "grid" } as const;

export type WizardLayout = "auto" | "grid";

export interface Size {
  width: number;
  height: number;
}

/** 키 컬럼(PK·FK·추정 FK·UK) — 접기 KEYS 가 보이는 행. buildFlow 와 같은 규칙이다. */
export function keyColumns(model: ErdModelJson): Set<string> {
  const out = new Set<string>();
  for (const [c, mark] of keyMarks(model)) if (mark !== "") out.add(c);
  for (const k of Object.values(model.keys)) if (k.kind === "UK") for (const c of k.columns) out.add(c);
  return out;
}

/** 그리기 전 노드 크기 어림(buildFlow 의 initialHeight 와 같다). 모르는 표는 머리만. */
export function estimatedSize(model: ErdModelJson, tableId: string, foldMode: ErdFoldMode = "NONE", keys?: ReadonlySet<string>): Size {
  const t = model.tables[tableId];
  if (!t) return { width: NODE_WIDTH, height: nodeHeight(0, false) };
  const cols = t.columnOrder.filter((c) => model.columns[c]);
  const ks = keys ?? keyColumns(model);
  const rows = foldMode === "NAME" ? 0 : foldMode === "KEYS" ? cols.filter((c) => ks.has(c)).length : cols.length;
  return { width: NODE_WIDTH, height: nodeHeight(rows, rows < cols.length) };
}

/** 고른 표 안의 그리는 관계(기각·다른 모델 부모·자기 참조 제외)를 부모 → 자식 선으로. id 순이라 결과가 흔들리지 않는다. */
export function relationEdges(model: ErdModelJson, tables: ReadonlySet<string>): LayoutEdge[] {
  return Object.entries(model.relations)
    .filter(([, r]) => r.state !== "REJECTED" && r.parentRef == null && r.child !== r.parent && tables.has(r.child) && tables.has(r.parent))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, r]) => ({ source: r.parent, target: r.child }));
}

const byPhys = (model: ErdModelJson) => (a: string, b: string): number => model.tables[a].phys.localeCompare(model.tables[b].phys);

/** 표들을 배치한다. 순서는 물리명 순으로 정해 넘긴다(같은 모델이면 같은 결과). */
export function layoutTables(model: ErdModelJson, tables: readonly string[], size: (id: string) => Size, origin: FlowPos = { x: 0, y: 0 }): Record<string, FlowPos> {
  const list = tables.filter((t) => model.tables[t]).sort(byPhys(model));
  const edges = relationEdges(model, new Set(list));
  return autoLayout(list.map((id) => ({ id, ...size(id) })), edges, { ...ERD_LAYOUT, origin });
}

/**
 * 지금 다이어그램의 표 전부를 다시 놓는 moveNodes(바뀐 표만). 그림의 왼쪽 위(지금 노드들의 최소 x·y)를 지킨다.
 * measured 는 캔버스가 잰 크기(없으면 접기 모드로 어림). 옮길 것이 없으면 null.
 */
export function autoLayoutCommand(state: ErdState, diagramId: string, measured: ReadonlyMap<string, Size>): ErdCommandJson | null {
  const placed = Object.values(state.nodes).filter((n) => n.diagram === diagramId && state.model.tables[n.table]);
  if (placed.length === 0) return null;
  const keys = keyColumns(state.model);
  const origin = { x: Math.min(...placed.map((n) => n.x)), y: Math.min(...placed.map((n) => n.y)) };
  const size = (id: string): Size => measured.get(id) ?? estimatedSize(state.model, id, state.nodes[nodeKey(diagramId, id)].foldMode, keys);
  const pos = layoutTables(state.model, placed.map((n) => n.table), size, origin);
  return moveNodesCommand(diagramId, Object.entries(pos).map(([table, p]) => ({ table, x: p.x, y: p.y })), state.nodes);
}

/** 마법사가 고른 표의 자리(물리명 순). auto 는 관계를 따르고, grid 는 관계를 보지 않는 격자다. */
export function wizardPlacement(model: ErdModelJson, tables: readonly string[], mode: WizardLayout): PlacedNode[] {
  const keys = keyColumns(model);
  const list = tables.filter((t) => model.tables[t]).sort(byPhys(model));
  const size = (id: string) => estimatedSize(model, id, "NONE", keys);
  const pos = mode === "auto"
    ? layoutTables(model, list, size)
    : autoLayout(list.map((id) => ({ id, ...size(id) })), [], { ...ERD_LAYOUT, isolated: "grid" });
  return list.map((table) => ({ table, x: pos[table].x, y: pos[table].y }));
}
