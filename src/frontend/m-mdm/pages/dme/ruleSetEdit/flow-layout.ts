/**
 * 룰 세트 흐름 자동 배치(2단계 계획 P8) — dagre 로 위→아래 쌓는다. React 의존이 없다.
 * 좌표는 노드 좌상단이고 정수다. 저장된 `view.positions` 가 자동 배치를 덮는다.
 * 노드 크기는 모두 `nodeSize`·`nodeSizeOf` 로 잰다 — 종류별 `NODE_SIZE`, RULE·TASK 는 외관(`view.styles`, S1)의 w·h, 접힌 분기는 룰 크기.
 */
import dagre from "@dagrejs/dagre";

import type { FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

import { clearLabels, clearRoutes, setNodeStyle, setPositions, type EditFlow, type EditResult, type FlowPos } from "./flow-edit";
import { isBlankJava, parseFlow, type Seq } from "./flow-model";
import { STYLED_KINDS, type NodeSize, type NodeStyle, type NodeStylePatch } from "./node-style";

export const NODE_SIZE: Readonly<Record<FlowNodeKind, { w: number; h: number }>> = {
  START: { w: 120, h: 36 },
  END: { w: 120, h: 36 },
  RULE: { w: 232, h: 68 },
  TASK: { w: 232, h: 68 }, // 빈 단계 — 룰과 같은 크기(룰을 지정해도 자리가 흔들리지 않는다, 4단계 spec §1.2)
  IF: { w: 176, h: 44 },
  PARALLEL: { w: 200, h: 14 },
  MERGE: { w: 28, h: 28 },
  CATCH: { w: 28, h: 28 }, // 받는 노드 — 룰 아래 테두리에 걸친 작은 원(받는 노드 spec §8, Ruling R15)
};

/** 외관(view.styles)을 읽을 수 있는 흐름 — EditFlow, 또는 view 없는 RuleSetFlow. */
export type StyledFlow = { view?: { styles?: Readonly<Record<string, NodeStyle>> } };

/**
 * 노드 하나의 그린 크기(S-D5) — 종류별 크기, RULE·TASK 는 외관의 w·h, 접힌 분기(folded)는 룰 기본 크기.
 * 반복문에서 흐름을 다시 찾지 않도록 종류·외관·접힘을 받는다.
 */
export function nodeSize(kind: FlowNodeKind, style?: NodeStyle | null, folded = false): NodeSize {
  if (folded) return NODE_SIZE.RULE;
  const base = NODE_SIZE[kind];
  if (!style || !STYLED_KINDS.has(kind)) return base;
  return { w: style.w ?? base.w, h: style.h ?? base.h };
}
/** 흐름 노드 하나의 그린 크기 — blocks 에 든 분기(접힌 블록)는 룰 기본 크기. */
export function nodeSizeOf(f: StyledFlow, n: { id: string; kind: FlowNodeKind }, blocks: Readonly<Record<string, unknown>> = {}): NodeSize {
  return nodeSize(n.kind, f.view?.styles?.[n.id], !!blocks[n.id]);
}

/** dagre 같은 층 노드 사이 가로 간격 — 갈래를 다시 벌릴 때(spreadLanes)도 같은 값을 쓴다. */
const NODESEP = 40;

/**
 * dagre 자동 배치. blocks 에 든 분기(접힌 블록, D16)는 룰 크기 상자로 그리므로 룰 크기로 배치한다 — 제 크기(병렬 200×14 등)로 배치하면
 * 접힌 상자가 아래 노드와 겹치고, 겹침 풀기가 그 노드를 옆으로 민다(고침 2회차 N1). RULE·TASK 는 외관 크기로 배치한다(S1).
 */
export function autoLayout(f: RuleSetFlow & StyledFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const nodes = f.nodes ?? [];
  const size = new Map(nodes.map((n) => [n.id, nodeSizeOf(f, n, blocks)] as const));
  const key = layoutKey(f, size);
  let hit = layoutCache.get(key);
  if (hit) layoutCache.delete(key); // 가장 최근 칸으로 옮긴다
  else {
    hit = runLayout(f, nodes, size);
    if (layoutCache.size >= LAYOUT_CACHE_SIZE) layoutCache.delete(layoutCache.keys().next().value!);
  }
  layoutCache.set(key, hit);
  // 여러 호출자가 같은 결과를 나눠 쓰므로 사본을 준다(positionsOf 는 좌표 객체를 그대로 펼쳐 넘긴다).
  const out: Record<string, FlowPos> = {};
  for (const [id, p] of Object.entries(hit)) out[id] = { x: p.x, y: p.y };
  return out;
}

/**
 * 자동 배치 결과 캐시(작은 LRU) — 위치·선 경로·이름표·메모·그룹만 바뀐 편집은 dagre 를 다시 돌리지 않는다(362노드 약 28ms).
 * 칸이 하나면 캔버스의 표시 흐름(접힌 보기)과 전체 흐름(블록 끌기)·자동 정렬·메모 자리 계산이 서로를 밀어내므로 몇 칸 둔다.
 */
const LAYOUT_CACHE_SIZE = 4;
const layoutCache = new Map<string, Readonly<Record<string, FlowPos>>>();
/** 자동 배치 캐시를 비운다 — dagre 호출 수를 세는 테스트가 앞 테스트가 남긴 캐시에 기대지 않게 한다. */
export function clearLayoutCache(): void {
  layoutCache.clear();
}
/**
 * 캐시 키 — autoLayout 이 읽는 칸 전부: 노드(순서·ID·종류·룰·짝 분기·이름), 선(순서·ID·양 끝·갈래 순서·조건식·그 외·이름), 노드별 그린 크기
 * (외관 w·h 와 접힌 블록이 여기로 들어온다). dagre 결과는 노드·선을 넣은 순서에도 달라지므로 배열 순서를 그대로 둔다.
 * 객체를 통째로 직렬화하지 않고 칸을 골라 적는다 — 서버에서 읽은 흐름과 편집으로 만든 흐름은 칸 순서·여분 칸이 달라 같은 흐름이 엇갈린다.
 */
function layoutKey(f: RuleSetFlow, size: ReadonlyMap<string, NodeSize>): string {
  return JSON.stringify([
    (f.nodes ?? []).map((n) => [n.id, n.kind, n.ruleId, n.splitId, n.label, size.get(n.id)!.w, size.get(n.id)!.h]),
    (f.edges ?? []).map((e) => [e.id, e.from, e.to, e.order, e.cond, e.otherwise, e.label]),
  ]);
}

function runLayout(f: RuleSetFlow, nodes: NonNullable<RuleSetFlow["nodes"]>, size: ReadonlyMap<string, NodeSize>): Record<string, FlowPos> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: NODESEP, ranksep: 46 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) {
    const s = size.get(n.id)!;
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  for (const e of f.edges ?? []) g.setEdge(e.from, e.to);
  dagre.layout(g);
  const cx = new Map<string, number>();
  for (const n of nodes) cx.set(n.id, g.node(n.id).x);
  orderBranches(f, g, cx, (id) => size.get(id)!);
  const out: Record<string, FlowPos> = {};
  for (const n of nodes) {
    const p = g.node(n.id);
    const s = size.get(n.id)!;
    out[n.id] = { x: Math.round(cx.get(n.id)! - s.w / 2), y: Math.round(p.y - s.h / 2) };
  }
  return out;
}

/** 갈래 몸(중첩 분기·합류 포함)의 노드 ID. */
function bodyIds(seq: Seq, out: string[] = []): string[] {
  for (const b of seq.items) {
    if (b.type === "SEQ") bodyIds(b, out);
    else if (b.type === "SPLIT") {
      out.push(b.nodeId, b.mergeId);
      for (const br of b.branches) bodyIds(br.body, out);
    } else out.push(b.nodeId);
  }
  return out;
}

/**
 * 분기 갈래를 갈래 순서(IF: 조건 갈래 순서 뒤 그 외, 병렬: 갈래 순서)대로 왼쪽부터 놓는다(4단계 브라우저 확인).
 * dagre 는 같은 층에서 갈래 순서를 지키지 않는다(뒤 갈래가 왼쪽에 오기도 한다). 그러면 갈래 라벨(순서대로 왼쪽→오른쪽)과
 * 노드 자리가 어긋나 "갈래 1" 에 넣은 노드가 오른쪽에 그려진다. dagre 가 고른 갈래 자리(가운데 x)는 그대로 쓰고,
 * 그 자리를 왼쪽부터 갈래 순서대로 다시 나눠 갈래 몸을 통째로 옮긴다. 빈 갈래의 자리는 분기→합류 선이 지나는 x 다.
 * 바깥 분기를 먼저 맞추고 안쪽으로 들어간다(갈래 몸은 통째로 움직이므로 안쪽 상대 배치는 그대로다). 흐름을 해석하지 못하면 손대지 않는다.
 * 폭이 다른 갈래를 다른 갈래 자리로 옮기면 겹칠 수 있으므로 옮길 자리를 `spreadLanes` 로 벌린다(외관 S1, 계획 Ruling 10).
 */
function orderBranches(f: RuleSetFlow, g: InstanceType<typeof dagre.graphlib.Graph>, cx: Map<string, number>, sizeOf: (id: string) => NodeSize) {
  const tree = parseFlow(layoutCopy(f)).tree;
  if (!tree) return;
  const visit = (seq: Seq) => {
    for (const b of seq.items) {
      if (b.type === "SEQ") visit(b);
      if (b.type !== "SPLIT") continue;
      const boxOf = (id: string): LaneBox => {
        const s = sizeOf(id);
        const x = cx.get(id)!;
        const y = (g.node(id) as { y: number }).y; // dagre 가 놓은 가운데 y
        return { x1: x - s.w / 2, x2: x + s.w / 2, y1: y - s.h / 2, y2: y + s.h / 2 };
      };
      const lanes = b.branches.map((br) => {
        const ids = bodyIds(br.body).filter((id) => cx.has(id));
        if (ids.length > 0) {
          const boxes = ids.map(boxOf);
          return { ids, at: (Math.min(...boxes.map((x) => x.x1)) + Math.max(...boxes.map((x) => x.x2))) / 2, boxes };
        }
        const pts = (g.edge(b.nodeId, b.mergeId) as { points?: { x: number }[] } | undefined)?.points ?? [];
        const at = pts.length > 0 ? pts[Math.floor(pts.length / 2)].x : cx.get(b.nodeId)!;
        // 빈 갈래(선만 지나는 자리)도 룰 하나 너비만큼 자리를 둔다 — dagre 는 너비 0 인 점으로 놓아 이웃 갈래 노드가 분기 가운데 아래에 걸친다
        // (사용자 요청 "갈래 1 노드가 조금 더 왼쪽으로"). 세로 범위는 분기~합류라 그 사이 이웃 갈래 노드와 견준다. 옮길 노드는 없다.
        const half = NODE_SIZE.RULE.w / 2;
        const y1 = (g.node(b.nodeId) as { y: number }).y;
        const y2 = (g.node(b.mergeId) as { y: number }).y;
        return { ids, at, boxes: [{ x1: at - half, x2: at + half, y1, y2 }] as LaneBox[] };
      });
      const slots = spreadLanes(lanes, lanes.map((l) => l.at).sort((a, c) => a - c), NODESEP);
      lanes.forEach((l, i) => {
        const d = slots[i] - l.at;
        if (d !== 0) for (const id of l.ids) cx.set(id, cx.get(id)! + d);
      });
      for (const br of b.branches) visit(br.body);
    }
  };
  visit(tree.root);
}

/** 배치용 IF 조건식 자리표시 — 갈래 구조만 얻으려 넣고 저장 흐름·검사에는 쓰지 않는다. */
const LAYOUT_COND = "true";
/**
 * 배치 계산에만 쓰는 흐름 사본 — 조건식이 빈 IF 조건 갈래(막 넣은 IF)에 자리표시 조건을 채운다. 조건식이 비면 `parseFlow` 가
 * FLOW_IF_ELSE 로 트리를 만들지 않아 갈래 순서·빈 갈래 자리(L1)가 돌지 않는다(I3). 흐름은 바꾸지 않고, 채울 것이 없으면 그대로 돌려준다.
 * 그 밖의 구조 문제로 트리가 없으면 지금처럼 손대지 않는다.
 */
function layoutCopy(f: RuleSetFlow): RuleSetFlow {
  const ifs = new Set((f.nodes ?? []).filter((n) => n.kind === "IF").map((n) => n.id));
  if (ifs.size === 0) return f;
  let filled = false;
  const edges = (f.edges ?? []).map((e) => {
    if (!ifs.has(e.from) || e.otherwise === true || !isBlankJava(e.cond)) return e;
    filled = true;
    return { ...e, cond: LAYOUT_COND };
  });
  return filled ? { ...f, edges } : f;
}

/** 갈래 겹침 판정용 노드 상자(흐름 좌표, 가운데 x 는 갈래를 옮기기 전 자리). */
export interface LaneBox {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}
/**
 * 갈래(왼쪽부터, 각자 옮기기 전 가운데 at·노드 상자)를 slots 자리로 옮길 때, **세로 범위가 겹치는**(같은 높이의) 두 노드가 gap 보다 가까우면
 * 오른쪽 갈래와 그 뒤 갈래들을 민 뒤 전체 자리 가운데를 처음 자리 가운데로 되돌린다(외관 S1 — 폭이 다른 갈래를 다른 갈래 자리에 옮기면 겹칠 수 있다, 계획 Ruling 10).
 * 갈래 경계 상자끼리가 아니라 노드끼리 견준다 — 중첩 분기가 든 갈래는 아래 층에서만 넓으므로 경계 상자로 견주면 겹치지 않는 기본 배치까지 바뀐다.
 * 상자 없는 갈래는 함께 밀릴 뿐 견주지 않는다(orderBranches 는 빈 갈래에 룰 너비 가상 상자를 준다). 움직일 것이 없으면 slots 를 그대로 돌려준다.
 */
export function spreadLanes(lanes: readonly { at: number; boxes: readonly LaneBox[] }[], slots: readonly number[], gap: number): number[] {
  const out = [...slots];
  let moved = false;
  for (let i = 1; i < lanes.length; i++) {
    if (lanes[i].boxes.length === 0) continue;
    const di = out[i] - lanes[i].at;
    let need = 0;
    for (let j = 0; j < i; j++) {
      const dj = out[j] - lanes[j].at;
      for (const a of lanes[j].boxes) {
        for (const b of lanes[i].boxes) {
          if (a.y1 < b.y2 && b.y1 < a.y2) need = Math.max(need, a.x2 + dj + gap - (b.x1 + di));
        }
      }
    }
    if (need > 0.5) { // dagre 좌표의 소수 오차로 움직이지 않게
      for (let k = i; k < out.length; k++) out[k] += need;
      moved = true;
    }
  }
  if (!moved) return out;
  const mid = (xs: readonly number[]) => (Math.min(...xs) + Math.max(...xs)) / 2;
  const d = mid(slots) - mid(out);
  return out.map((x) => x + d);
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
 * blocks 에 든 분기(접힌 블록)는 룰 크기 상자로 그리므로 그 크기로 본다(D16). RULE·TASK 는 외관 크기로 본다(S1). 위치를 읽는 곳(끌기·블록 끌기·메모 자리)은 모두 이 값을 쓴다.
 */
export function drawnPositions(f: EditFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const saved = f.view?.positions ?? {};
  const pinned = new Set((f.nodes ?? []).filter((n) => saved[n.id]).map((n) => n.id));
  const boxes = (f.nodes ?? []).map((n) => ({ id: n.id, ...nodeSizeOf(f, n, blocks) }));
  return resolveOverlaps(boxes, positionsOf(f, blocks), pinned);
}

/** [자동 정렬] — 모든 노드 위치를 자동 배치로 덮고 선 경로(C14)·이름표 오프셋(L1)을 함께 지운다. 한 번의 편집(이력 한 칸)이다. */
export function autoArrange(f: EditFlow): EditFlow {
  return clearLabels(clearRoutes(setPositions(f, autoLayout(f))));
}

// ───────────────────────── 공간 넓히기(S1) ─────────────────────────

/** 공간 넓히기 방향 — 가로(x, 기준선은 세로선 x = at) 또는 세로(y, 기준선은 가로선 y = at). */
export type SpaceAxis = "x" | "y";
/** 접힌 블록(분기 ID → 분기 자신을 포함한 멤버). `collapseView(...).blocks` 를 그대로 넘긴다. */
export type SpaceBlocks = Readonly<Record<string, { members: readonly string[] }>>;

/** 기준선 너머인가 — 상자 좌상단 기준(가로: x ≥ at, 세로: y ≥ at). 메모·꺾는 점도 같은 규칙이다(꺾는 점은 점 자체). */
export const beyondLine = (axis: SpaceAxis, at: number, p: FlowPos): boolean => (axis === "x" ? p.x : p.y) >= at;
const along = (axis: SpaceAxis, p: FlowPos) => (axis === "x" ? p.x : p.y);

/** 숨은 멤버(분기 자신 제외) → 그 블록의 분기 ID. */
function hiddenOwners(blocks: SpaceBlocks): Map<string, string> {
  const out = new Map<string, string>();
  for (const [split, b] of Object.entries(blocks)) for (const m of b.members) if (m !== split) out.set(m, split);
  return out;
}

/**
 * 기준선 너머에서 그려진 것들(보이는 노드·메모·그려진 선의 꺾는 점)의 좌표 목록 — 줄이기 한계와 미리보기가 쓴다.
 * 숨은 멤버와 숨은(접힌) 선의 꺾는 점은 블록을 따르므로 빼고 본다.
 */
function beyondCoords(f: EditFlow, axis: SpaceAxis, at: number, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks): number[] {
  const hidden = hiddenOwners(blocks);
  const out: number[] = [];
  const see = (p: FlowPos) => {
    if (beyondLine(axis, at, p)) out.push(along(axis, p));
  };
  for (const n of f.nodes ?? []) if (!hidden.has(n.id) && drawn[n.id]) see(drawn[n.id]);
  for (const note of f.view?.notes ?? []) see(note);
  for (const e of f.edges ?? []) {
    if (hidden.has(e.from) || hidden.has(e.to)) continue;
    for (const p of f.view?.routes?.[e.id] ?? []) see(p);
  }
  return out;
}

/**
 * 줄이기(음수 delta) 한계 — 밀리는 것들 중 기준선에 가장 가까운 것이 기준선을 넘어가지 않는 가장 작은 delta(0 이하).
 * 겹침이 아니라 순서 유지가 기준이다. 밀리는 것이 없으면 null(넓혀도 줄여도 바뀌는 것이 없다).
 */
export function spaceMinDelta(
  f: EditFlow, axis: SpaceAxis, at: number, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks = {},
): number | null {
  const coords = beyondCoords(f, axis, at, drawn, blocks);
  return coords.length === 0 ? null : at - Math.min(...coords);
}

/**
 * 공간 넓히기(S1, draw.io 「공간 삽입」) — 기준선 너머의 노드·메모·꺾는 점을 delta 만큼 옮긴 흐름. 한 번의 편집(이력 한 칸)이다.
 * - drawn: 지금 그린(겹침을 푼) 위치 — 보이는 노드는 캔버스가 그린 상자 좌상단(접힌 분기는 접힌 상자), 숨은 멤버는 블록과 맞춘 전체 흐름 자리.
 * - 결과 `view.positions` 는 **모든 노드의 위치**다(그린 위치, 너머는 delta 더함 — 전부 고정). 접힌 분기는 제 크기 기준 좌표로 적는다(foldOffsetX).
 * - 숨은 멤버·숨은 선의 꺾는 점은 자기 블록(접힌 분기)이 너머일 때 같은 delta 로 간다. 그룹 틀은 멤버에서 계산하므로 따로 적지 않는다.
 * - 음수(줄이기)는 spaceMinDelta 로 제한한다. delta 가 0(반올림 뒤)이거나 너머에 아무것도 없으면 입력을 그대로 돌려준다(기록 없음).
 * 입력은 바꾸지 않는다.
 */
export function shiftSpace(
  f: EditFlow, axis: SpaceAxis, at: number, delta: number, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks = {},
): EditFlow {
  const min = spaceMinDelta(f, axis, at, drawn, blocks);
  const d = min === null ? 0 : Math.round(Math.max(delta, min));
  if (d === 0) return f;
  const hidden = hiddenOwners(blocks);
  const move = (p: FlowPos, yes: boolean): FlowPos => (!yes ? { x: p.x, y: p.y } : axis === "x" ? { x: p.x + d, y: p.y } : { x: p.x, y: p.y + d });
  /** 노드(숨은 멤버면 그 블록 분기)가 너머인가. */
  const nodeBeyond = (id: string) => {
    const p = drawn[hidden.get(id) ?? id];
    return !!p && beyondLine(axis, at, p);
  };
  const pos: Record<string, FlowPos> = {};
  for (const n of f.nodes ?? []) {
    const p = drawn[n.id];
    if (!p) continue;
    const q = move(p, nodeBeyond(n.id));
    pos[n.id] = blocks[n.id] ? { x: q.x + foldOffsetX(n.kind), y: q.y } : q;
  }
  const g = setPositions(f, pos); // 깊은 복사본 — 아래에서 메모·경로를 고친다
  g.view.notes = g.view.notes.map((n) => (beyondLine(axis, at, n) ? { ...n, ...move(n, true) } : n));
  const routes: Record<string, FlowPos[]> = {};
  for (const e of g.edges) {
    const r = g.view.routes[e.id];
    if (!r) continue;
    // 숨은(접힌) 선은 블록을 따른다 — 합류에서 나가던 선·안쪽 선은 from 이, 분기에서 나가는 갈래는 to 가 숨은 멤버다.
    const owner = hidden.get(e.from) ?? hidden.get(e.to);
    routes[e.id] = owner ? r.map((p) => move(p, nodeBeyond(owner))) : r.map((p) => move(p, beyondLine(axis, at, p)));
  }
  g.view.routes = routes;
  return g;
}

/** 크기·자리 바꾸기에 쓰는 그린 위치 묶음 — 캔버스가 정렬 출처(alignSourceRef)로 올린다(page 의 layoutSource). */
export interface NodeLayoutSource {
  drawn: Record<string, FlowPos>;
  blocks: SpaceBlocks;
}

/** 그린 위치 전부를 저장 위치로 적는다 — 접힌 분기는 제 크기 기준 좌표(+foldOffsetX). 그린 위치가 없는 노드는 건드리지 않는다. */
export function pinDrawn(f: EditFlow, drawn: Readonly<Record<string, FlowPos>>, blocks: SpaceBlocks = {}): EditFlow {
  const pos: Record<string, FlowPos> = {};
  for (const n of f.nodes ?? []) {
    const p = drawn[n.id];
    if (!p) continue;
    pos[n.id] = blocks[n.id] ? { x: p.x + foldOffsetX(n.kind), y: p.y } : { x: p.x, y: p.y };
  }
  return Object.keys(pos).length > 0 ? setPositions(f, pos) : f;
}

// ───────────────────────── 노드 외관(S1) ─────────────────────────

/**
 * 외관 편집(패널·크기 손잡이 공통, S1). `setNodeStyle` 결과에서 그 노드의 그린 크기가 바뀌었으면 그때 그린 위치 전부를 저장 위치로 적는다(S-D6) —
 * 저장 위치가 없는 노드는 자동 배치가 다시 놓으므로 한 노드 크기만 바꿔도 이웃이 밀리기 때문이다(`shiftSpace` 와 같은 방식).
 * 크기가 그대로면(색·아이콘만, 같은 크기) 위치를 적지 않는다 — 저장 글자가 바뀌지 않아 되돌리기 칸이 헛돌지 않는다. 커져서 이웃과 겹치면 겹친 채 둔다.
 */
export function restyleNode(
  f: EditFlow, nodeId: string, patch: NodeStylePatch | null, drawn: Readonly<Record<string, FlowPos>> = {}, blocks: SpaceBlocks = {},
): EditResult {
  const r = setNodeStyle(f, nodeId, patch);
  if (!r.ok) return r;
  const n = f.nodes.find((x) => x.id === nodeId)!;
  const before = nodeSizeOf(f, n);
  const after = nodeSizeOf(r.flow, n);
  if (before.w === after.w && before.h === after.h) return r;
  return { ok: true, flow: pinDrawn(r.flow, drawn, blocks) };
}
