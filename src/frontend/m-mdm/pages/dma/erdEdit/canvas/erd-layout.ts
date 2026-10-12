/**
 * ERD 배치(순수) — 표 크기 어림과 관계 선을 shared autoLayout 에 넘긴다. 업무 규칙(어떤 관계를 선으로 볼지, 접기에 따른 크기)만 여기 둔다.
 * 방향은 왼쪽 → 오른쪽(부모가 왼쪽)이다. 표 노드의 선이 좌우 손잡이에 붙어서다(erd-geometry relationSides).
 * 2-D 배치(U23): 관계 묶음마다 dagre 로 놓고, 높이가 목표를 넘으면 층을 옆 열로 나눈 뒤(wrapRanks),
 * 묶음·외톨이 표를 캔버스 가로세로 비에 맞춰 줄 단위로 포장한다(packShelves). dagre 만 쓰면 모델이 세로 한 줄이 된다.
 */
import { autoLayout, type FlowPos, type LayoutEdge } from "@dk-oasis/shared/react-flow";

import { isAuditColumnId } from "../audit-columns";
import { nodeKey } from "../state/model-delta";
import type { ErdCommandJson, ErdDiagramNode, ErdFoldMode, ErdModelJson, ErdState } from "../types";
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

/**
 * 그리기 전 노드 크기 어림(buildFlow 의 initialHeight 와 같다). 모르는 표는 머리만.
 * stored = 다이어그램에 저장된 표 크기(w·h, §7.4) — 자동 배치·화면 맞춤이 실제 크기를 쓰게 한다.
 * showAudit=false 면 감사 컬럼 행을 뺀다(노드에 빈 자리가 남지 않게). 「접힘」 줄은 접기로 가린 행이 있을 때만이다(buildFlow hiddenCount 와 같다).
 */
export function estimatedSize(
  model: ErdModelJson, tableId: string, foldMode: ErdFoldMode = "NONE", keys?: ReadonlySet<string>, showAudit = true,
  stored?: Pick<ErdDiagramNode, "w" | "h">,
): Size {
  const t = model.tables[tableId];
  const width = stored?.w ?? NODE_WIDTH;
  if (!t) return { width, height: nodeHeight(0, false) };
  const cols = t.columnOrder.filter((c) => model.columns[c]);
  const ks = keys ?? keyColumns(model);
  const fold = foldMode === "NAME" ? [] : foldMode === "KEYS" ? cols.filter((c) => ks.has(c)) : cols;
  const rows = showAudit ? fold.length : fold.filter((c) => !isAuditColumnId(model, c)).length;
  // 저장 높이(§7.4)는 접기가 없을 때만 쓴다 — 접기(KEYS·NAME)는 기존 접기 높이가 우선이다. 너비는 늘 쓴다.
  const height = foldMode === "NONE" && stored?.h ? stored.h : nodeHeight(rows, fold.length < cols.length);
  return { width, height };
}

/** 고른 표 안의 그리는 관계(기각·다른 모델 부모·자기 참조 제외)를 부모 → 자식 선으로. id 순이라 결과가 흔들리지 않는다. */
export function relationEdges(model: ErdModelJson, tables: ReadonlySet<string>): LayoutEdge[] {
  return Object.entries(model.relations)
    .filter(([, r]) => r.state !== "REJECTED" && r.parentRef == null && r.child !== r.parent && tables.has(r.child) && tables.has(r.parent))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, r]) => ({ source: r.parent, target: r.child }));
}

const byPhys = (model: ErdModelJson) => (a: string, b: string): number =>
  model.tables[a].phys.localeCompare(model.tables[b].phys) || a.localeCompare(b);

/** 표 사이 빈틈(같은 열의 위아래·묶음 안 열 사이)과 묶음·외톨이 상자 사이 빈틈, 층 사이 거리. 57개 표가 1018×574 에서 25% 이상으로 보이게 정했다. */
const TABLE_GAP = 40;
const SHELF_GAP = 60;
const RANK_GAP = 100;
/** 캔버스 크기를 모를 때 쓰는 가로세로 비. */
const DEFAULT_ASPECT = 1.6;

/**
 * 관계로 이어진 표 묶음(무방향, BFS). 묶음 안 순서는 ids 순서, 묶음 순서는 첫 표의 ids 순서다.
 * 표 하나짜리도 묶음 하나로 돌려준다(외톨이). ids 에 없는 끝을 가진 선은 무시한다.
 */
export function components(ids: readonly string[], edges: readonly LayoutEdge[]): string[][] {
  const index = new Map(ids.map((id, i) => [id, i] as const));
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) {
    if (!index.has(e.source) || !index.has(e.target) || e.source === e.target) continue;
    adj.get(e.source)!.push(e.target);
    adj.get(e.target)!.push(e.source);
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const start of ids) {
    if (seen.has(start)) continue;
    seen.add(start);
    const members = [start];
    for (let i = 0; i < members.length; i++) {
      for (const next of adj.get(members[i])!) {
        if (seen.has(next)) continue;
        seen.add(next);
        members.push(next);
      }
    }
    out.push(members.sort((a, b) => index.get(a)! - index.get(b)!));
  }
  return out;
}

/**
 * 한 묶음(왼쪽 → 오른쪽 배치 결과)의 층을 높이 상한으로 나눠 옆 열로 쌓는다. 층 = 가운데 x 가 같은 노드들.
 * 층 순서대로, 층 안은 y 순으로 열에 쌓다가 상한을 넘으면 새 열(그 열 최대 폭 + gap)로 간다. 층이 끝나면 rankGap 만큼 띄운다.
 * 앞 층의 모든 열이 다음 층보다 왼쪽이라 "부모 x < 자식 x" 가 유지된다. 결과의 왼쪽 위는 (0, 0).
 */
export function wrapRanks(
  pos: Record<string, FlowPos>, size: (id: string) => Size, maxHeight: number, gap: number, rankGap: number,
): Record<string, FlowPos> {
  const nodes = Object.keys(pos).map((id) => ({ id, ...pos[id], w: size(id).width, h: size(id).height }));
  const center = (n: { x: number; w: number }): number => n.x + n.w / 2;
  nodes.sort((a, b) => center(a) - center(b) || a.y - b.y || a.id.localeCompare(b.id));
  // 가운데 x 가 1 이내로 같으면 한 층(반올림 오차)
  const ranks: (typeof nodes)[] = [];
  for (const n of nodes) {
    const last = ranks[ranks.length - 1];
    if (last && Math.abs(center(last[0]) - center(n)) <= 1) last.push(n);
    else ranks.push([n]);
  }
  const out: Record<string, FlowPos> = {};
  let x = 0;
  for (const rank of ranks) {
    rank.sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
    let y = 0;
    let colWidth = 0;
    let used = false;
    for (const n of rank) {
      if (used && y + n.h > maxHeight) {
        x += colWidth + gap;
        y = 0;
        colWidth = 0;
        used = false;
      }
      out[n.id] = { x: Math.round(x), y: Math.round(y) };
      y += n.h + gap;
      colWidth = Math.max(colWidth, n.w);
      used = true;
    }
    x += colWidth + rankGap;
  }
  return out;
}

/**
 * 상자들을 줄 단위로 포장한다. 면적이 큰 상자 먼저(같으면 id 순), 줄에 놓다 rowWidth 를 넘으면(줄이 비어 있지 않을 때) 다음 줄.
 * 줄 높이는 그 줄 가장 큰 상자다. 돌려주는 값은 상자 왼쪽 위(0, 0 기준).
 */
export function packShelves(boxes: readonly { id: string; w: number; h: number }[], rowWidth: number, gap: number): Record<string, FlowPos> {
  const order = [...boxes].sort((a, b) => b.w * b.h - a.w * a.h || a.id.localeCompare(b.id));
  const out: Record<string, FlowPos> = {};
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const b of order) {
    if (x > 0 && x + b.w > rowWidth) {
      y += rowHeight + gap;
      x = 0;
      rowHeight = 0;
    }
    out[b.id] = { x: Math.round(x), y: Math.round(y) };
    x += b.w + gap;
    rowHeight = Math.max(rowHeight, b.h);
  }
  return out;
}

/**
 * 표들을 2-D 로 배치한다(U23). 순서는 물리명 순으로 정해 넘긴다(같은 모델이면 같은 결과, 입력 순서와 무관).
 * aspect = 목표 가로/세로 비(캔버스 비, 기본 1.6). origin 은 결과의 왼쪽 위다.
 */
export function layoutTables(
  model: ErdModelJson, tables: readonly string[], size: (id: string) => Size, origin: FlowPos = { x: 0, y: 0 }, aspect: number = DEFAULT_ASPECT,
): Record<string, FlowPos> {
  const list = tables.filter((t) => model.tables[t]).sort(byPhys(model));
  if (list.length === 0) return {};
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : DEFAULT_ASPECT;
  const edges = relationEdges(model, new Set(list));
  const sizes = new Map(list.map((id) => [id, size(id)] as const));
  const area = list.reduce((sum, id) => sum + (sizes.get(id)!.width + TABLE_GAP) * (sizes.get(id)!.height + TABLE_GAP), 0);
  const targetH = Math.sqrt(area / ratio);
  const rowWidth = targetH * ratio;

  // 묶음마다 안쪽 자리(왼쪽 위 0,0)와 경계 상자를 만든다
  const inner = new Map<string, Record<string, FlowPos>>();
  const boxes: { id: string; w: number; h: number }[] = [];
  for (const members of components(list, edges)) {
    const key = members[0];
    let pos: Record<string, FlowPos>;
    if (members.length === 1) {
      pos = { [key]: { x: 0, y: 0 } };
    } else {
      const set = new Set(members);
      pos = autoLayout(members.map((id) => ({ id, ...sizes.get(id)! })), edges.filter((e) => set.has(e.source) && set.has(e.target)),
        { direction: "LR", nodeGap: TABLE_GAP, rankGap: RANK_GAP, origin: { x: 0, y: 0 } });
      const height = Math.max(...members.map((id) => pos[id].y + sizes.get(id)!.height));
      const maxH = Math.max(targetH, ...members.map((id) => sizes.get(id)!.height));
      if (height > maxH) pos = wrapRanks(pos, (id) => sizes.get(id)!, maxH, TABLE_GAP, RANK_GAP);
    }
    inner.set(key, pos);
    boxes.push({
      id: key,
      w: Math.max(...members.map((id) => pos[id].x + sizes.get(id)!.width)),
      h: Math.max(...members.map((id) => pos[id].y + sizes.get(id)!.height)),
    });
  }

  const shelf = packShelves(boxes, rowWidth, SHELF_GAP);
  const out: Record<string, FlowPos> = {};
  for (const [key, pos] of inner) {
    for (const [id, p] of Object.entries(pos)) out[id] = { x: Math.round(origin.x + shelf[key].x + p.x), y: Math.round(origin.y + shelf[key].y + p.y) };
  }
  return out;
}

/**
 * 지금 다이어그램의 표 전부를 다시 놓는 moveNodes(바뀐 표만). 그림의 왼쪽 위(지금 노드들의 최소 x·y)를 지킨다.
 * measured 는 캔버스가 잰 크기(없으면 접기 모드로 어림). aspect 는 캔버스 가로/세로 비(없으면 layoutTables 기본). 옮길 것이 없으면 null.
 */
export function autoLayoutCommand(state: ErdState, diagramId: string, measured: ReadonlyMap<string, Size>, showAudit = true, aspect?: number): ErdCommandJson | null {
  const placed = Object.values(state.nodes).filter((n) => n.diagram === diagramId && state.model.tables[n.table]);
  if (placed.length === 0) return null;
  const keys = keyColumns(state.model);
  const origin = { x: Math.min(...placed.map((n) => n.x)), y: Math.min(...placed.map((n) => n.y)) };
  const size = (id: string): Size => {
    const n = state.nodes[nodeKey(diagramId, id)];
    return measured.get(id) ?? estimatedSize(state.model, id, n.foldMode, keys, showAudit, n);
  };
  const pos = layoutTables(state.model, placed.map((n) => n.table), size, origin, aspect);
  return moveNodesCommand(diagramId, Object.entries(pos).map(([table, p]) => ({ table, x: p.x, y: p.y })), state.nodes);
}

/** 마법사가 고른 표의 자리(물리명 순). auto 는 관계를 따르고, grid 는 관계를 보지 않는 격자다. */
export function wizardPlacement(model: ErdModelJson, tables: readonly string[], mode: WizardLayout, showAudit = true): PlacedNode[] {
  const keys = keyColumns(model);
  const list = tables.filter((t) => model.tables[t]).sort(byPhys(model));
  const size = (id: string) => estimatedSize(model, id, "NONE", keys, showAudit);
  const pos = mode === "auto"
    ? layoutTables(model, list, size)
    : autoLayout(list.map((id) => ({ id, ...size(id) })), [], { ...ERD_LAYOUT, isolated: "grid" });
  return list.map((table) => ({ table, x: pos[table].x, y: pos[table].y }));
}
