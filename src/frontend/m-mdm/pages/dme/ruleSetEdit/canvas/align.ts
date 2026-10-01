/**
 * 고른 노드·메모 정렬·간격 고르게·화살표 옮기기(추가 Task A1, Figma 식) — 순수 함수. React 의존이 없다.
 * 모두 입력을 바꾸지 않고, 움직일 것이 없으면(개수 모자람·이미 맞음) 입력 그대로를 돌려준다(편집 기록 없음).
 *
 * - drawn: 지금 그린 위치(겹침을 푼 것) — 보이는 노드는 그린 상자 좌상단(접힌 분기는 접힌 상자), 숨은 멤버는 블록과 맞춘 전체 흐름 자리.
 *   캔버스가 `alignSourceRef` 로 올린다(공간 넓히기의 `spaceDrawn` 과 같다). 메모는 drawn 이 아니라 `view.notes` 의 자기 위치를 쓴다.
 * - 상자 크기: 흐름 노드는 종류별 `NODE_SIZE`(접힌 분기는 룰 크기), 메모는 자기 w×h. 그룹 틀은 멤버에서 계산하므로 다루지 않는다.
 * - 노드 위치는 `view.positions` 에, 메모는 `view.notes` 에 적는다. 하나라도 움직이면 고른 노드 전부를 그린 위치로 적어 고정한다.
 *   접힌 분기는 제 크기 기준 좌표(+foldOffsetX)로 적는다. 분기(접힘·펼침 모두)가 움직이면 블록 멤버·합류가 같은 만큼 함께 간다(끌기와 같다).
 *   맞춤 기준 상자는 고른 노드 상자 그대로다(블록 경계로 넓히지 않는다). 정렬·간격은 선의 꺾는 점을 옮기지 않는다.
 * - 화살표 옮기기는 그룹 ID 를 소속 노드로 펼치고, 두 끝이 모두 옮겨진 선의 꺾는 점도 같은 만큼 옮긴다(`shiftRoutes`).
 */
import { NODE_SIZE, foldOffsetX, type SpaceBlocks } from "../flow-layout";
import { blockMembers, setPositions, shiftRoutes, type EditFlow, type FlowPos } from "../flow-edit";

export type AlignKind = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type DistributeAxis = "x" | "y";

interface Item {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 접힌 분기면 접힌 상자 → 제 크기 기준 저장 좌표로 바꿀 가로 차이, 아니면 0. */
  fold: number;
  /** 접힌 분기의 안쪽 멤버(분기 자신 제외). */
  members: readonly string[];
  note: boolean;
}

/** 고른 것 중 옮길 수 있는 것만 — 그린 위치가 있는 보이는 흐름 노드와 메모. 숨은 멤버·모르는 ID·중복은 뺀다. */
function itemsOf(f: EditFlow, ids: readonly string[], drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks): Item[] {
  const hidden = new Set<string>();
  for (const [split, b] of Object.entries(blocks)) for (const m of b.members) if (m !== split) hidden.add(m);
  const out: Item[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id) || hidden.has(id)) continue;
    seen.add(id);
    const n = f.nodes.find((x) => x.id === id);
    const p = drawn[id];
    if (n && p) {
      const block = blocks[id];
      const size = NODE_SIZE[block ? "RULE" : n.kind];
      out.push({
        id, x: p.x, y: p.y, w: size.w, h: size.h, fold: block ? foldOffsetX(n.kind) : 0,
        members: (block ? [...block.members] : (["IF", "PARALLEL"].includes(n.kind) ? (blockMembers(f, id) ?? []) : [])).filter((m) => m !== id),
        note: false,
      });
      continue;
    }
    const note = f.view?.notes?.find((x) => x.id === id);
    if (note) out.push({ id, x: note.x, y: note.y, w: note.w, h: note.h, fold: 0, members: [], note: true });
  }
  // 다른 고른 분기의 블록 멤버는 그 분기가 함께 옮기므로 따로 세지 않는다(이중 이동 방지).
  const owned = new Set(out.flatMap((it) => it.members));
  return out.filter((it) => !owned.has(it.id));
}

/** 항목별 이동량을 흐름에 적는다. 모두 0 이면 입력 그대로. */
function apply(f: EditFlow, items: readonly Item[], moves: ReadonlyMap<string, FlowPos>, drawn: Readonly<Record<string, FlowPos>>): EditFlow {
  const moving = items.filter((it) => {
    const d = moves.get(it.id);
    return !!d && (d.x !== 0 || d.y !== 0);
  });
  if (moving.length === 0) return f;
  const pos: Record<string, FlowPos> = {};
  const noteAt = new Map<string, FlowPos>();
  // 하나라도 움직이면 고른 것 전부(안 움직인 기준 노드 포함)를 그린 위치로 적어 고정한다 — 겹침 해소가 기준 노드를 밀어 맞춤이 깨지지 않게.
  for (const it of items) {
    const d = moves.get(it.id) ?? { x: 0, y: 0 };
    if (it.note) {
      if (d.x !== 0 || d.y !== 0) noteAt.set(it.id, { x: it.x + d.x, y: it.y + d.y });
      continue;
    }
    pos[it.id] = { x: it.x + d.x + it.fold, y: it.y + d.y };
    for (const m of it.members) if (drawn[m]) pos[m] = { x: drawn[m].x + d.x, y: drawn[m].y + d.y };
  }
  const g = setPositions(f, pos); // 깊은 복사본 — 아래에서 메모를 고친다
  if (noteAt.size > 0) g.view.notes = g.view.notes.map((n) => (noteAt.has(n.id) ? { ...n, ...noteAt.get(n.id)! } : n));
  return g;
}

/** 고른 것들의 경계 상자에 맞춘다(Figma 와 같다). 2개 이상. */
export function alignNodes(
  f: EditFlow, ids: readonly string[], kind: AlignKind, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks = {},
): EditFlow {
  const items = itemsOf(f, ids, drawn, blocks);
  if (items.length < 2) return f;
  const left = Math.min(...items.map((i) => i.x));
  const right = Math.max(...items.map((i) => i.x + i.w));
  const top = Math.min(...items.map((i) => i.y));
  const bottom = Math.max(...items.map((i) => i.y + i.h));
  const moves = new Map<string, FlowPos>();
  for (const it of items) {
    let dx = 0;
    let dy = 0;
    if (kind === "left") dx = left - it.x;
    else if (kind === "right") dx = right - it.w - it.x;
    else if (kind === "hcenter") dx = (left + right) / 2 - it.w / 2 - it.x;
    else if (kind === "top") dy = top - it.y;
    else if (kind === "bottom") dy = bottom - it.h - it.y;
    else dy = (top + bottom) / 2 - it.h / 2 - it.y;
    moves.set(it.id, { x: Math.round(dx), y: Math.round(dy) });
  }
  return apply(f, items, moves, drawn);
}

/** 양 끝(그 축으로 가장 앞·뒤)을 고정하고 사이 빈 간격을 같게 한다. 3개 이상. */
export function distributeNodes(
  f: EditFlow, ids: readonly string[], axis: DistributeAxis, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks = {},
): EditFlow {
  const items = itemsOf(f, ids, drawn, blocks);
  if (items.length < 3) return f;
  const at = (i: Item) => (axis === "x" ? i.x : i.y);
  const size = (i: Item) => (axis === "x" ? i.w : i.h);
  const sorted = [...items].sort((a, b) => at(a) - at(b));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const gap = (at(last) + size(last) - at(first) - sorted.reduce((s, i) => s + size(i), 0)) / (sorted.length - 1);
  const moves = new Map<string, FlowPos>();
  let cursor = at(first) + size(first);
  for (const it of sorted.slice(1, -1)) {
    const next = cursor + gap;
    const d = Math.round(next - at(it));
    moves.set(it.id, axis === "x" ? { x: d, y: 0 } : { x: 0, y: d });
    cursor = next + size(it);
  }
  return apply(f, items, moves, drawn);
}

/** 고른 것 모두를 (dx, dy) 만큼 옮긴다(화살표 옮기기). */
export function nudgeNodes(
  f: EditFlow, ids: readonly string[], dx: number, dy: number, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks = {},
): EditFlow {
  const items = itemsOf(f, withGroupMembers(f, ids), drawn, blocks);
  if (items.length === 0) return f;
  const g = apply(f, items, new Map(items.map((i) => [i.id, { x: dx, y: dy }])), drawn);
  if (g === f) return f;
  const moved = new Set(items.filter((i) => !i.note).flatMap((i) => [i.id, ...i.members]));
  return shiftRoutes(g, moved, dx, dy);
}

/** 그룹 ID 를 소속 노드 ID 로 펼친다(나머지는 그대로). 중복은 itemsOf 가 거른다. */
function withGroupMembers(f: EditFlow, ids: readonly string[]): string[] {
  const groups = new Map((f.view?.groups ?? []).map((g) => [g.id, g.nodeIds] as const));
  return ids.flatMap((id) => groups.get(id) ?? [id]);
}
