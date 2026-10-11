/**
 * 여러 표 동시 처리(UX 1.5) — 명령 만들기(순수).
 * - 맞춤·간격(U58): 고른 표 경계 상자 기준. 결과는 PlacedNode 목록이고, 부른 쪽이 moveNodesCommand 로 한 건을 만든다.
 * - 다른 다이어그램에 넣기(U61): 서버 placeTables 는 upsert(ErdDiagramStore.mergeNode)라 대상에 이미 있는 표를 다시 보내면
 *   자리를 덮어쓴다. 그래서 여기서 뺀다.
 * - 같은 컬럼 여러 표에(U63): 같은 물리명 하나가 묶음 전체를 거절시키므로 미리 거른다. phys·domainId 를 넣어 서버 NEEDS_CHOICE 를 피한다.
 *   명령 모양은 GridInputBar addColumnBatch(pk 아님)와 같다.
 */
import { isAuditColumn } from "../audit-columns";
import { nodeKey } from "../state/model-delta";
import type { ErdCommandJson, ErdModelJson, ErdState } from "../types";
import type { PlacedNode } from "./erd-commands";
import { estimatedSize, keyColumns } from "./erd-layout";

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "x" | "y";
export type ArrangeKind = { align: AlignMode } | { distribute: DistributeAxis };
export interface NodeBox { table: string; x: number; y: number; width: number; height: number }

export const ALIGN_MIN = 2;
export const DISTRIBUTE_MIN = 3;
/** 간격 맞추기에서 표 사이 빈 칸의 하한(px). 겹친 표를 펼 때 쓴다. */
export const DISTRIBUTE_MIN_GAP = 40;
/** 다른 다이어그램에 넣을 때 대상 표들과 띄우는 거리(px). */
export const PLACE_GAP = 80;

export const ALIGN_MODES: readonly AlignMode[] = ["left", "hcenter", "right", "top", "vcenter", "bottom"];
export const ALIGN_LABEL: Readonly<Record<AlignMode, string>> = {
  left: "왼쪽 맞춤", hcenter: "가운데 맞춤", right: "오른쪽 맞춤", top: "위쪽 맞춤", vcenter: "중간 맞춤", bottom: "아래쪽 맞춤",
};
export const DISTRIBUTE_LABEL: Readonly<Record<DistributeAxis, string>> = { x: "가로 간격 같게", y: "세로 간격 같게" };

export function arrangeLabel(kind: ArrangeKind): string {
  return "align" in kind ? ALIGN_LABEL[kind.align] : DISTRIBUTE_LABEL[kind.distribute];
}

export function alignBoxes(boxes: readonly NodeBox[], mode: AlignMode): PlacedNode[] {
  if (boxes.length < ALIGN_MIN) return [];
  const minX = Math.min(...boxes.map((b) => b.x));
  const maxR = Math.max(...boxes.map((b) => b.x + b.width));
  const minY = Math.min(...boxes.map((b) => b.y));
  const maxB = Math.max(...boxes.map((b) => b.y + b.height));
  const cx = (minX + maxR) / 2;
  const cy = (minY + maxB) / 2;
  return boxes.map((b): PlacedNode => {
    switch (mode) {
      case "left": return { table: b.table, x: minX, y: b.y };
      case "hcenter": return { table: b.table, x: Math.round(cx - b.width / 2), y: b.y };
      case "right": return { table: b.table, x: maxR - b.width, y: b.y };
      case "top": return { table: b.table, x: b.x, y: minY };
      case "vcenter": return { table: b.table, x: b.x, y: Math.round(cy - b.height / 2) };
      case "bottom": return { table: b.table, x: b.x, y: maxB - b.height };
    }
  });
}

/** 축 좌표 → 표 id 순. 양 끝 표를 고정하고 빈 칸을 같게. 빈 칸이 minGap 보다 작으면 minGap 으로 첫 표부터 펼친다. */
export function distributeBoxes(boxes: readonly NodeBox[], axis: DistributeAxis, minGap = DISTRIBUTE_MIN_GAP): PlacedNode[] {
  if (boxes.length < DISTRIBUTE_MIN) return [];
  const pos = (b: NodeBox) => (axis === "x" ? b.x : b.y);
  const size = (b: NodeBox) => (axis === "x" ? b.width : b.height);
  const sorted = [...boxes].sort((a, b) => pos(a) - pos(b) || (a.table < b.table ? -1 : a.table > b.table ? 1 : 0));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const free = pos(last) + size(last) - pos(first) - sorted.reduce((s, b) => s + size(b), 0);
  const gap = Math.max(minGap, free / (sorted.length - 1));
  let at = pos(first);
  return sorted.map((b): PlacedNode => {
    const p = Math.round(at);
    at += size(b) + gap;
    return axis === "x" ? { table: b.table, x: p, y: b.y } : { table: b.table, x: b.x, y: p };
  });
}

export interface PlaceIntoPlan { command: ErdCommandJson | null; placed: string[]; skipped: string[] }

export function alreadyIn(state: ErdState, to: string, tables: readonly string[]): number {
  return tables.reduce((k, t) => (state.nodes[nodeKey(to, t)] ? k + 1 : k), 0);
}

export function placeIntoCommand(state: ErdState, from: string, to: string, tables: readonly string[], showAudit: boolean): PlaceIntoPlan {
  const skipped: string[] = [];
  const moving: PlacedNode[] = [];
  for (const t of tables) {
    if (!state.model.tables[t]) continue;
    if (state.nodes[nodeKey(to, t)]) {
      skipped.push(t);
      continue;
    }
    const src = state.nodes[nodeKey(from, t)];
    moving.push({ table: t, x: src?.x ?? 0, y: src?.y ?? 0 });
  }
  if (moving.length === 0) return { command: null, placed: [], skipped };
  const keys = keyColumns(state.model);
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  for (const n of Object.values(state.nodes)) {
    if (n.diagram !== to || !state.model.tables[n.table]) continue;
    right = Math.max(right, n.x + estimatedSize(state.model, n.table, n.foldMode, keys, showAudit).width);
    top = Math.min(top, n.y);
  }
  const baseX = Number.isFinite(right) ? right + PLACE_GAP : 0;
  const baseY = Number.isFinite(top) ? top : 0;
  const minX = Math.min(...moving.map((m) => m.x));
  const minY = Math.min(...moving.map((m) => m.y));
  const nodes = moving.map((m) => ({ table: m.table, x: Math.round(baseX + m.x - minX), y: Math.round(baseY + m.y - minY) }));
  return { command: { op: "placeTables", diagram: to, nodes }, placed: nodes.map((n) => n.table), skipped };
}

export interface BulkColumnPlan { targets: string[]; skipped: string[] }
export interface BulkColumnInput { logical: string; phys: string; domainId: number | null }

export function bulkColumnPlan(model: ErdModelJson, tables: readonly string[], phys: string): BulkColumnPlan {
  const want = phys.trim().toUpperCase();
  const has = new Set<string>();
  for (const c of Object.values(model.columns)) if (c.phys.toUpperCase() === want) has.add(c.table);
  const targets: string[] = [];
  const skipped: string[] = [];
  for (const t of tables) {
    if (!model.tables[t]) continue;
    (has.has(t) ? skipped : targets).push(t);
  }
  return { targets, skipped };
}

const COLUMN_ID = /^[A-Z][A-Z0-9_$#]{0,127}$/;

export function columnPhysError(phys: string): string | null {
  if (!phys) return "물리명을 넣으세요.";
  if (!COLUMN_ID.test(phys)) return "물리명은 영문 대문자로 시작하고 대문자·숫자·_·$·# 만 씁니다(128자 이내).";
  if (isAuditColumn(phys)) return "감사 컬럼은 표마다 저절로 붙습니다. 다른 물리명을 쓰세요.";
  return null;
}

export function bulkColumnCommands(model: ErdModelJson, targets: readonly string[], col: BulkColumnInput, newId: () => string): ErdCommandJson[] {
  return targets.filter((t) => model.tables[t]).map((t) => {
    const add: ErdCommandJson = { op: "addColumn", id: newId(), table: t, logical: col.logical, phys: col.phys };
    if (col.domainId != null) add.domainId = col.domainId;
    return add;
  });
}
