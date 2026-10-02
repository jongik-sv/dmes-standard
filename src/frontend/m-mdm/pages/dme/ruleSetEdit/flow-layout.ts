/**
 * 룰 세트 흐름 자동 배치(2단계 계획 P8) — dagre 로 위→아래 쌓는다. React 의존이 없다.
 * 좌표는 노드 좌상단이고 정수다. 저장된 `view.positions` 가 자동 배치를 덮는다.
 * 노드 크기는 모두 `nodeSize`·`nodeSizeOf` 로 잰다 — 종류별 `NODE_SIZE`, RULE·TASK 는 외관(`view.styles`, S1)의 w·h, 접힌 분기는 룰 크기.
 */
import dagre from "@dagrejs/dagre";

import type { FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

import { clearLabels, clearRoutes, setNodeStyle, setPositions, type EditFlow, type EditResult, type FlowPos, type GroupPad } from "./flow-edit";
import { CATCHABLE, isBlankJava, parseFlow, type Guarded, type Seq, type Split } from "./flow-model";
import { STYLED_KINDS, type NodeSize, type NodeStyle, type NodeStylePatch } from "./node-style";

export const NODE_SIZE: Readonly<Record<FlowNodeKind, { w: number; h: number }>> = {
  START: { w: 120, h: 36 },
  END: { w: 120, h: 36 },
  RULE: { w: 232, h: 68 },
  TASK: { w: 232, h: 68 }, // 빈 단계 — 룰과 같은 크기(룰을 지정해도 자리가 흔들리지 않는다, 4단계 spec §1.2)
  IF: { w: 176, h: 44 },
  PARALLEL: { w: 200, h: 14 },
  MERGE: { w: 200, h: 14 }, // 병렬 합류 — 병렬 분기와 같은 크기의 속 빈 막대(implicit-join spec §10)
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
/** dagre 층 사이 세로 간격. */
const RANKSEP = 46;

/** 받는 노드 가로 자리(Ruling R15) — 룰 왼쪽 테두리에서 처음 16, 받는 노드마다 36씩 오른쪽. */
export const CATCH_LEFT = 16;
export const CATCH_STEP = 36;

/** 받는 노드 좌상단 — 룰 아래 테두리에 걸친다(세로 가운데가 테두리). k 는 그 룰의 받는 노드 순번(노드 배열 순서). */
export function catchSpot(rule: FlowPos, ruleSize: NodeSize, k: number): FlowPos {
  return { x: rule.x + CATCH_LEFT + k * CATCH_STEP, y: rule.y + ruleSize.h - Math.round(NODE_SIZE.CATCH.h / 2) };
}

/** 받는 노드 ID → 붙은 노드 ID·순번(노드 배열 순서). 붙은 노드가 없거나 받을 수 없는 종류면 넣지 않는다. */
export function catchSlots(f: RuleSetFlow): Map<string, { attachTo: string; k: number }> {
  const out = new Map<string, { attachTo: string; k: number }>();
  const kindOf = new Map((f.nodes ?? []).map((n) => [n.id, n.kind] as const));
  const count = new Map<string, number>();
  for (const n of f.nodes ?? []) {
    if (n.kind !== "CATCH" || !n.attachTo) continue;
    const k = kindOf.get(n.attachTo);
    if (!k || !CATCHABLE.has(k)) continue;
    const i = count.get(n.attachTo) ?? 0;
    count.set(n.attachTo, i + 1);
    out.set(n.id, { attachTo: n.attachTo, k: i });
  }
  return out;
}

/** 받는 노드 자리를 붙은 룰의 자리·크기에서 다시 정한다. 붙은 룰 자리가 없으면(접힌 블록 안 등) 그 키를 뺀다. 받는 노드가 없으면 입력을 그대로 돌려준다. */
export function placeCatches(
  f: RuleSetFlow & StyledFlow, pos: Readonly<Record<string, FlowPos>>, blocks: Readonly<Record<string, unknown>> = {},
): Record<string, FlowPos> {
  const slots = catchSlots(f);
  if (slots.size === 0) return pos as Record<string, FlowPos>;
  const byId = new Map((f.nodes ?? []).map((n) => [n.id, n] as const));
  const out: Record<string, FlowPos> = { ...pos };
  for (const [id, s] of slots) {
    const at = pos[s.attachTo];
    if (!at) {
      delete out[id];
      continue;
    }
    out[id] = catchSpot(at, nodeSizeOf(f, byId.get(s.attachTo)!, blocks), s.k);
  }
  return out;
}

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
  // 받는 노드 자리는 캐시한 배치가 아니라 이 사본에서 붙은 룰 테두리로 다시 정한다(R15).
  return placeCatches(f, out, blocks);
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
 * 캐시 키 — autoLayout 이 읽는 칸 전부: 노드(순서·ID·종류·룰·짝 분기·이름·붙은 노드·받는 종류), 선(순서·ID·양 끝·갈래 순서·조건식·그 외·이름), 노드별 그린 크기
 * (외관 w·h 와 접힌 블록이 여기로 들어온다). dagre 결과는 노드·선을 넣은 순서에도 달라지므로 배열 순서를 그대로 둔다.
 * 객체를 통째로 직렬화하지 않고 칸을 골라 적는다 — 서버에서 읽은 흐름과 편집으로 만든 흐름은 칸 순서·여분 칸이 달라 같은 흐름이 엇갈린다.
 */
function layoutKey(f: RuleSetFlow, size: ReadonlyMap<string, NodeSize>): string {
  return JSON.stringify([
    (f.nodes ?? []).map((n) => [n.id, n.kind, n.ruleId, n.splitId, n.label, n.attachTo ?? null, n.catches ?? null, size.get(n.id)!.w, size.get(n.id)!.h]),
    (f.edges ?? []).map((e) => [e.id, e.from, e.to, e.order, e.cond, e.otherwise, e.label]),
  ]);
}

/** 룰 → 처리 갈래 몸 첫 노드 가상 선의 무게 — 끝내는 처리 갈래 몸이 END 쪽으로 늘어지지 않고 룰 바로 아래 층에 붙게 한다. */
const CATCH_HEAD_WEIGHT = 2;
/** 분기 → 갈래 첫 노드 선의 무게 — 짧은 갈래가 합류 쪽으로 처지지 않고 분기 바로 아래 층에 붙게 한다(2026-10-02 DESIGN_KEY 자동 정렬). */
const BRANCH_HEAD_WEIGHT = 2;
const SPLIT_KINDS: ReadonlySet<FlowNodeKind> = new Set(["IF", "PARALLEL"]);

function runLayout(f: RuleSetFlow, nodes: NonNullable<RuleSetFlow["nodes"]>, size: ReadonlyMap<string, NodeSize>): Record<string, FlowPos> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: NODESEP, ranksep: RANKSEP });
  g.setDefaultEdgeLabel(() => ({}));
  // 붙은 받는 노드는 dagre 에 넣지 않는다 — 자리는 placeCatches 가 룰 테두리로 다시 정한다. 넣으면 룰과 처리 갈래 사이에 받는 노드 층이 하나 비어
  // 생긴다(browser-check 추가 1 (a)). 대신 처리 갈래 몸이 있으면 룰 → 몸 첫 노드 가상 선을 넣어 몸이 룰 바로 아래 층에 오게 한다(스펙 §8).
  // 빈 처리 갈래(몸 없이 끝·돌아오는 자리로 바로 가는 갈래)는 가상 선을 넣지 않는다 — 룰 → 끝 긴 선이 층마다 자리를 차지해 정상 갈래를 옆으로 민다.
  const tree = parseFlow(layoutCopy(f)).tree;
  /** 빈 처리 갈래(몸 없음)의 받는 노드 — 트리가 없으면 도착이 END 인 것만 빈 갈래로 본다(implicit-join spec §9). */
  const emptyHandlers = new Set<string>();
  if (tree) collectEmptyHandlers(tree.root, emptyHandlers);
  const slots = catchSlots(f);
  const kindOf = new Map(nodes.map((n) => [n.id, n.kind] as const));
  for (const n of nodes) {
    if (slots.has(n.id)) continue;
    const s = size.get(n.id)!;
    g.setNode(n.id, { width: s.w, height: s.h });
  }
  // 끝내는 몸(끝내는 처리 갈래·끝내는 IF 갈래)의 끝 → END 선도 dagre 에 넣지 않는다 — 몸 끝에서 END 까지 층마다 가상 점이 생겨 그 옆 정상 줄기를
  // 오른쪽으로 민다(2026-10-02 DESIGN_KEY 자동 정렬). 몸은 pushRight 가 오른쪽으로 비켜 놓고, END 로 가는 선은 endingRoutes 가 그린다.
  // END 로 들어가는 선이 이것뿐이면 END 가 떠 버리므로 그때는 그대로 넣는다.
  const endTails = tree ? endingTails(tree.root) : new Set<string>();
  const endId = nodes.find((n) => n.kind === "END")?.id;
  const skipEnd = (e: { from: string; to: string }) => e.to === endId && endTails.has(e.from);
  const keepEnd = (f.edges ?? []).some((e) => e.to === endId && !skipEnd(e) && !slots.has(e.from));
  for (const e of f.edges ?? []) {
    const s = slots.get(e.from);
    if (!s) {
      if (!slots.has(e.to) && !(keepEnd && skipEnd(e))) g.setEdge(e.from, e.to, SPLIT_KINDS.has(kindOf.get(e.from)!) ? { weight: BRANCH_HEAD_WEIGHT } : {});
      continue;
    }
    const to = nodes.find((n) => n.id === e.to);
    const empty = !to || (tree ? emptyHandlers.has(e.from) : to.kind === "END");
    if (!empty && to.id !== s.attachTo && !slots.has(to.id) && kindOf.has(to.id)) g.setEdge(s.attachTo, to.id, { weight: CATCH_HEAD_WEIGHT });
  }
  dagre.layout(g);
  // 끝내는 몸 → END 선을 뺐으므로 dagre 는 END 를 남은 정상 줄기 아래에만 놓는다 — 끝내는 몸이 더 길면 END 가 그 몸보다 위에 선다.
  // END 를 가장 낮은 노드 아래 + 층 간격으로 내린다. END 는 마지막 노드라 옮겨도 다른 노드와 겹치지 않는다(갈래 정리가 이 y 를 읽으므로 그 전에 한다).
  if (endId && keepEnd && endTails.size > 0) {
    const endNode = g.node(endId) as { y: number; height: number };
    const bottom = Math.max(...g.nodes().filter((id) => id !== endId).map((id) => {
      const n = g.node(id) as { y: number; height: number };
      return n.y + n.height / 2;
    }));
    endNode.y = Math.max(endNode.y, bottom + RANKSEP + endNode.height / 2);
  }
  const cx = new Map<string, number>();
  for (const n of nodes) if (!slots.has(n.id)) cx.set(n.id, g.node(n.id).x);
  orderBranches(f, g, cx, (id) => size.get(id)!);
  const out: Record<string, FlowPos> = {};
  for (const n of nodes) {
    if (slots.has(n.id)) continue; // 받는 노드 자리는 autoLayout 이 placeCatches 로 채운다
    const p = g.node(n.id);
    const s = size.get(n.id)!;
    out[n.id] = { x: Math.round(cx.get(n.id)! - s.w / 2), y: Math.round(p.y - s.h / 2) };
  }
  return out;
}

/**
 * 갈래 몸(중첩 분기·합류·받는 룰 블록 포함)의 노드 ID. 받는 노드(CATCH)는 넣지 않는다 — 자리를 `placeCatches` 가 룰 테두리로 다시 정하므로
 * 옮길 까닭이 없고, dagre 가 놓은 자리(룰과 정상 갈래 사이 층)를 갈래 폭에 넣으면 폭이 틀린다.
 */
function bodyIds(seq: Seq, out: string[] = []): string[] {
  for (const b of seq.items) {
    if (b.type === "SEQ") bodyIds(b, out);
    else if (b.type === "SPLIT") {
      out.push(b.nodeId);
      if (b.mergeId) out.push(b.mergeId);
      for (const br of b.branches) bodyIds(br.body, out);
    } else if (b.type === "GUARDED") {
      out.push(b.step.nodeId);
      if (b.mergeId) out.push(b.mergeId);
      bodyIds(b.normal, out);
      for (const h of b.handlers) bodyIds(h.body, out);
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
 * 받는 룰 블록(GUARDED)이 든 몸은 **안쪽부터** 맞춘다(Task 7 고침 1회차) — 처리 갈래를 오른쪽으로 미는 것은 블록 폭을 넓히므로,
 * 바깥 분기·바깥 받는 룰이 갈래 폭을 재기 전에 끝나야 이웃 갈래와 겹치지 않는다. 받는 룰 블록이 없는 몸은 지금처럼 바깥부터 맞춘다
 * (받는 노드 없는 흐름의 좌표가 그대로다).
 */
function orderBranches(f: RuleSetFlow, g: InstanceType<typeof dagre.graphlib.Graph>, cx: Map<string, number>, sizeOf: (id: string) => NodeSize) {
  const tree = parseFlow(layoutCopy(f)).tree;
  if (!tree) return;
  const boxOf = (id: string): LaneBox => {
    const s = sizeOf(id);
    const x = cx.get(id)!;
    const y = (g.node(id) as { y: number }).y; // dagre 가 놓은 가운데 y
    return { x1: x - s.w / 2, x2: x + s.w / 2, y1: y - s.h / 2, y2: y + s.h / 2 };
  };
  const shift = (ids: readonly string[], d: number) => {
    if (d !== 0) for (const id of ids) cx.set(id, cx.get(id)! + d);
  };
  const spanOf = (ids: readonly string[]) => {
    const boxes = ids.map(boxOf);
    return { x1: Math.min(...boxes.map((x) => x.x1)), x2: Math.max(...boxes.map((x) => x.x2)), boxes };
  };
  /** 분기 하나의 갈래를 갈래 순서대로 왼쪽부터 놓는다(안쪽은 건드리지 않는다). */
  const placeSplit = (b: Split) => {
    // 끝내는 갈래는 갈래 자리 나누기에서 뺀다 — 몸은 아래 pushRight 가 오른쪽으로 비켜 놓는다(implicit-join spec §9).
    const lanes = b.branches.filter((br) => !br.ends).map((br) => {
      const ids = bodyIds(br.body).filter((id) => cx.has(id));
      if (ids.length > 0) {
        const { x1, x2, boxes } = spanOf(ids);
        return { ids, at: (x1 + x2) / 2, boxes };
      }
      const pts = (g.edge(b.nodeId, b.joinId) as { points?: { x: number }[] } | undefined)?.points ?? [];
      const at = pts.length > 0 ? pts[Math.floor(pts.length / 2)].x : cx.get(b.nodeId)!;
      // 빈 갈래(선만 지나는 자리)도 룰 하나 너비만큼 자리를 둔다 — dagre 는 너비 0 인 점으로 놓아 이웃 갈래 노드가 분기 가운데 아래에 걸친다
      // (사용자 요청 "갈래 1 노드가 조금 더 왼쪽으로"). 세로 범위는 분기~합류라 그 사이 이웃 갈래 노드와 견준다. 옮길 노드는 없다.
      const half = NODE_SIZE.RULE.w / 2;
      const y1 = (g.node(b.nodeId) as { y: number }).y;
      const y2 = (g.node(b.joinId) as { y: number }).y;
      return { ids, at, boxes: [{ x1: at - half, x2: at + half, y1, y2 }] as LaneBox[] };
    });
    const slots = spreadLanes(lanes, lanes.map((l) => l.at).sort((a, c) => a - c), NODESEP);
    lanes.forEach((l, i) => shift(l.ids, slots[i] - l.at));
  };
  /**
   * 받는 룰 블록 하나를 놓는다(받는 노드 spec §8) — 정상 갈래는 첫 노드가 룰 가운데 아래, 처리 갈래는 받는 노드 순서로 그 오른쪽에
   * NODESEP 간격. 갈래 몸은 통째로 옮기므로 안쪽에서 먼저 정한 상대 배치는 그대로다.
   * 정상 갈래를 상자 가운데가 아니라 첫 노드로 맞추는 것은 안쪽 받는 룰의 처리 갈래가 오른쪽으로 넓혀 둔 몸도 줄기가 룰 아래에 오게 하려는 것이다.
   */
  const placeGuarded = (b: Guarded) => {
    const ruleX = cx.get(b.step.nodeId)!;
    const normalIds = bodyIds(b.normal).filter((id) => cx.has(id));
    let right = ruleX + sizeOf(b.step.nodeId).w / 2;
    const head = firstNode(b.normal);
    if (normalIds.length > 0 && head && cx.has(head)) {
      shift(normalIds, ruleX - cx.get(head)!);
      right = Math.max(right, spanOf(normalIds).x2);
    }
    for (const h of b.handlers) {
      const ids = bodyIds(h.body).filter((id) => cx.has(id));
      if (ids.length === 0) continue;
      const { x1, x2 } = spanOf(ids);
      shift(ids, right + NODESEP - x1);
      right += NODESEP + (x2 - x1);
    }
  };
  /** 받는 룰 블록이 없는 몸 — 바깥 분기부터 안쪽으로(고침 전과 같은 순서). */
  const outsideIn = (seq: Seq) => {
    for (const b of seq.items) {
      if (b.type === "SEQ") outsideIn(b);
      else if (b.type === "SPLIT") {
        placeSplit(b);
        for (const br of b.branches) outsideIn(br.body);
      } else if (b.type === "GUARDED") insideOut({ type: "SEQ", items: [b] }); // hasSideBody 가 거른다 — 타입 완결용
    }
  };
  /** 받는 룰 블록이 든 몸 — 안쪽을 먼저 다 놓은 뒤 이 층의 분기·받는 룰 블록이 갈래 폭을 잰다. */
  /**
   * 정상 갈래가 비고 돌아오는 자리도 없는 받는 룰(처리 갈래가 모두 끝낸다) 뒤 줄기를 룰 가운데 아래로 옮긴다(2026-10-02 DESIGN_KEY 자동 정렬).
   * dagre 는 룰을 뒤 줄기 첫 노드와 처리 갈래 몸(가상 선) 사이 가운데에 놓아, 처리 갈래를 오른쪽으로 비킨 뒤에도 룰·그 앞 노드와 뒤 줄기가 어긋난다.
   * 뒤 줄기는 같은 몸의 뒤 블록 전부(맨 바깥 몸이면 END 까지)를 통째로 옮긴다. 처리 갈래 몸은 뒤에 pushRight 가 다시 비켜 놓는다.
   */
  const alignAfterGuarded = (seq: Seq, tail: readonly string[]) => {
    seq.items.forEach((b, i) => {
      if (b.type !== "GUARDED" || b.mergeId || b.normal.items.length > 0) return;
      const rest = seq.items.slice(i + 1);
      const head = firstNode({ type: "SEQ", items: rest }) ?? (rest.length === 0 ? tail[0] : null);
      if (!head || !cx.has(head)) return;
      const ids = [...bodyIds({ type: "SEQ", items: rest }), ...tail].filter((id) => cx.has(id));
      shift(ids, cx.get(b.step.nodeId)! - cx.get(head)!);
    });
  };
  const insideOut = (seq: Seq, tail: readonly string[] = []) => {
    if (!hasSideBody(seq)) return outsideIn(seq);
    for (const b of seq.items) {
      if (b.type === "SEQ") insideOut(b);
      else if (b.type === "SPLIT") {
        for (const br of b.branches) insideOut(br.body);
        placeSplit(b);
      } else if (b.type === "GUARDED") {
        insideOut(b.normal);
        for (const h of b.handlers) insideOut(h.body);
        placeGuarded(b);
      }
    }
    alignAfterGuarded(seq, tail);
  };
  insideOut(tree.root, [tree.endId]);
  if (!hasSideBody(tree.root)) return;
  /**
   * 끝내는 처리 갈래(END 로 가는, Task 7 고침 2회차) — dagre 가 END 바로 위까지 층을 늘리므로 받는 룰 뒤 블록(같은 몸·바깥 몸)과 같은 높이를 차지한다.
   * 몸 세로 범위와 겹치는 다른 노드(받는 노드·자기 몸·같은 룰의 뒤 처리 갈래 제외) 전부의 오른쪽 끝 + NODESEP 너머로 몸을 통째로 민다.
   * 같은 룰의 처리 갈래는 앞 갈래 오른쪽 끝 + NODESEP 을 넘도록 뒤따라 밀어 받는 노드 순서(왼쪽→오른쪽)를 지킨다. 안쪽 블록부터 한다.
   * 민 몸은 그때 놓인 모든 노드의 오른쪽에 서고, 움직이지 않은 노드는 그대로이므로 민 몸끼리·다른 노드와 겹치지 않는다.
   */
  const catchIds = new Set((f.nodes ?? []).filter((n) => n.kind === "CATCH").map((n) => n.id));
  const others = [...cx.keys()].filter((id) => !catchIds.has(id));
  /**
   * 몸들을 순서대로 오른쪽으로 민다 — 앞 몸 오른쪽 끝 + NODESEP 을 넘고, ends 인 몸은 세로 범위가 겹치는 다른 노드(받는 노드·자기 몸·뒤 몸 제외) 전부의
   * 오른쪽 끝 + NODESEP 너머로(끝내는 처리 갈래·끝내는 IF 갈래가 END 바로 위까지 늘어나 뒤 흐름과 겹치지 않게). 움직이지 않은 노드는 그대로다.
   */
  const pushRight = (bodies: readonly string[][], ends: readonly boolean[]) => {
    let prevRight = -Infinity;
    bodies.forEach((ids, k) => {
      if (ids.length === 0) return;
      const { x1, x2, boxes } = spanOf(ids);
      let need = prevRight + NODESEP - x1;
      if (ends[k]) {
        const y1 = Math.min(...boxes.map((x) => x.y1));
        // 몸 끝 → END 선을 dagre 에서 뺐으므로(endingTails) 몸이 END 까지 늘어나지 않는다 — 그 선이 내려갈 END 위까지를 몸 세로 범위로 본다.
        const y2 = Math.max(...boxes.map((x) => x.y2), cx.has(tree.endId) ? boxOf(tree.endId).y1 : -Infinity);
        const skip = new Set([...ids, ...bodies.slice(k + 1).flat()]);
        for (const id of others) {
          if (skip.has(id)) continue;
          const o = boxOf(id);
          if (o.y1 < y2 && y1 < o.y2) need = Math.max(need, o.x2 + NODESEP - x1);
        }
      }
      const d = need > 0.5 ? need : 0; // dagre 좌표의 소수 오차로 움직이지 않게
      shift(ids, d);
      prevRight = x2 + d;
    });
  };
  const clearEnding = (b: Guarded) =>
    pushRight(b.handlers.map((h) => bodyIds(h.body).filter((id) => cx.has(id))), b.handlers.map((h) => h.ends));
  const clearEndingIf = (b: Split) => {
    const ending = b.branches.filter((br) => br.ends);
    pushRight(ending.map((br) => bodyIds(br.body).filter((id) => cx.has(id))), ending.map(() => true));
  };
  const walk = (seq: Seq) => {
    for (const b of seq.items) {
      if (b.type === "SEQ") walk(b);
      else if (b.type === "SPLIT") {
        for (const br of b.branches) walk(br.body);
        if (b.kind === "IF") clearEndingIf(b);
      } else if (b.type === "GUARDED") {
        walk(b.normal);
        for (const h of b.handlers) walk(h.body);
        clearEnding(b);
      }
    }
  };
  walk(tree.root);
}

/** 끝내는 몸(끝내는 처리 갈래·끝내는 IF 갈래, 중첩 포함)에서 END 로 가는 노드 — 몸의 마지막 출구. 빈 끝내는 IF 갈래는 IF 자신, 빈 처리 갈래는 받는 노드(어차피 dagre 밖이다). */
function endingTails(seq: Seq, out = new Set<string>()): Set<string> {
  for (const b of seq.items) {
    if (b.type === "SEQ") endingTails(b, out);
    else if (b.type === "SPLIT") {
      for (const br of b.branches) {
        endingTails(br.body, out);
        if (br.ends) out.add(lastExit(br.body) ?? b.nodeId);
      }
    } else if (b.type === "GUARDED") {
      endingTails(b.normal, out);
      for (const h of b.handlers) {
        endingTails(h.body, out);
        if (h.ends) out.add(lastExit(h.body) ?? h.catchNodeId);
      }
    }
  }
  return out;
}

/** 몸이 빈 처리 갈래의 받는 노드 ID(중첩 포함). */
function collectEmptyHandlers(seq: Seq, out: Set<string>): void {
  for (const b of seq.items) {
    if (b.type === "SEQ") collectEmptyHandlers(b, out);
    else if (b.type === "SPLIT") for (const br of b.branches) collectEmptyHandlers(br.body, out);
    else if (b.type === "GUARDED") {
      collectEmptyHandlers(b.normal, out);
      for (const h of b.handlers) {
        if (h.body.items.length === 0) out.add(h.catchNodeId);
        collectEmptyHandlers(h.body, out);
      }
    }
  }
}

/** 몸에 받는 노드 블록(GUARDED)이나 끝내는 IF 갈래가 하나라도 있는가(중첩 포함) — 있으면 안쪽부터 맞추고 오른쪽으로 비켜 놓는다. */
function hasSideBody(seq: Seq): boolean {
  return seq.items.some(
    (b) => b.type === "GUARDED" || (b.type === "SEQ" && hasSideBody(b)) || (b.type === "SPLIT" && b.branches.some((br) => br.ends || hasSideBody(br.body))),
  );
}

/** 몸의 첫 노드(룰·빈 단계·분기·받는 룰). 빈 몸이면 null. */
function firstNode(seq: Seq): string | null {
  const b = seq.items[0];
  if (!b) return null;
  if (b.type === "SEQ") return firstNode(b);
  if (b.type === "GUARDED") return b.step.nodeId;
  return b.nodeId;
}

/** 몸의 맨 바깥 순차 마지막 출구(룰·빈 단계는 자기, 분기가 있으면 병렬 합류·IF 모이는 자리, 돌아오는 자리가 있는 받는 룰은 그 자리, 그 밖의 받는 룰은 룰). 빈 몸이면 null. */
function lastExit(seq: Seq): string | null {
  for (let i = seq.items.length - 1; i >= 0; i--) {
    const b = seq.items[i];
    if (b.type === "SEQ") {
      const x = lastExit(b);
      if (x) return x;
      continue;
    }
    if (b.type === "SPLIT") return b.mergeId ?? b.joinId;
    if (b.type === "GUARDED") return b.mergeId ?? b.step.nodeId;
    return b.nodeId;
  }
  return null;
}

/** 선 양 끝 연결점의 반 크기 — 캔버스 연결점(nodes.tsx `ANCHOR_PX` 8)의 절반. 선은 나가는 연결점 아래 끝에서 나와 들어오는 연결점 위 끝으로 간다. */
const ANCHOR_HALF = 4;
/** 경로가 연결점에서 곧게 나오고 들어가는 길이(route-path `AUTO_ROUTE_OFFSET` 과 같다). */
const ENDING_STUB = 20;
/** 비켜 가는 세로 줄과 그 왼쪽 노드 사이 간격. */
const LANE_GAP = NODESEP / 2;

/**
 * 끝내는 처리 갈래·끝내는 IF 갈래가 END 로 들어가는 선(빈 갈래면 받는 노드·IF 의 선)의 자동 꺾는 점(browser-check 추가 1 (b)). 저장하지 않고 캔버스가 저장 경로가 없을 때 그린다.
 * 기본 꺾은선(아래로 반 → 가로 → END 위)이 다른 노드 상자를 지날 때만 만든다 — 출발 연결점에서 STUB 만큼 내려와 세로 범위가 겹치는 모든 노드(받는 노드 제외)의
 * 오른쪽 끝 + LANE_GAP 까지 가로로 간 뒤 END 위 STUB 높이까지 내려가 END 가운데로 들어간다. 오른쪽에 걸리는 노드가 없으면 출발점에서 바로 내려간다.
 * pos 는 그린 위치(drawnPositions), blocks 는 접힌 블록. 흐름을 해석하지 못하면 빈 결과다.
 */
export function endingRoutes(
  f: RuleSetFlow & StyledFlow, pos: Readonly<Record<string, FlowPos>>, blocks: Readonly<Record<string, unknown>> = {},
): Record<string, FlowPos[]> {
  const out: Record<string, FlowPos[]> = {};
  if (!(f.nodes ?? []).some((n) => n.kind === "CATCH" || n.kind === "IF")) return out;
  const tree = parseFlow(layoutCopy(f)).tree;
  if (!tree) return out;
  const byId = new Map((f.nodes ?? []).map((n) => [n.id, n] as const));
  const tails: string[] = [];
  const walk = (seq: Seq) => {
    for (const b of seq.items) {
      if (b.type === "SEQ") walk(b);
      else if (b.type === "SPLIT") {
        for (const br of b.branches) {
          walk(br.body);
          if (br.ends) tails.push(lastExit(br.body) ?? b.nodeId); // 끝내는 IF 갈래 끝 선(몸이 없으면 IF 에서 END 로 가는 갈래 선)
        }
      } else if (b.type === "GUARDED") {
        walk(b.normal);
        for (const h of b.handlers) {
          walk(h.body);
          if (h.ends) tails.push(lastExit(h.body) ?? h.catchNodeId);
        }
      }
    }
  };
  walk(tree.root);
  const boxes = (f.nodes ?? [])
    .filter((n) => n.kind !== "CATCH" && pos[n.id])
    .map((n) => {
      const s = nodeSizeOf(f, n, blocks);
      return { id: n.id, x1: pos[n.id].x, y1: pos[n.id].y, x2: pos[n.id].x + s.w, y2: pos[n.id].y + s.h };
    });
  for (const tail of tails) {
    const e = (f.edges ?? []).find((x) => x.from === tail && byId.get(x.to)?.kind === "END");
    const sp = e && pos[e.from];
    const tp = e && pos[e.to];
    if (!e || !sp || !tp) continue;
    const ss = nodeSizeOf(f, byId.get(e.from)!, blocks);
    const ts = nodeSizeOf(f, byId.get(e.to)!, blocks);
    const sx = sp.x + ss.w / 2;
    const sy = sp.y + ss.h + ANCHOR_HALF;
    const tx = tp.x + ts.w / 2;
    const ty = tp.y - ANCHOR_HALF;
    const top = sy + ENDING_STUB;
    const bottom = ty - ENDING_STUB;
    if (bottom <= top) continue;
    const others = boxes.filter((b) => b.id !== e.from && b.id !== e.to);
    const mid = (top + bottom) / 2;
    const plain: FlowPos[] = [{ x: sx, y: sy }, { x: sx, y: mid }, { x: tx, y: mid }, { x: tx, y: ty }];
    if (!others.some((b) => crossesBox(plain, b))) continue;
    const lane = Math.max(sx, ...others.filter((b) => b.y1 < bottom && top < b.y2).map((b) => b.x2 + LANE_GAP));
    // 가로 구간은 그 아래 노드 위 끝까지 틈의 1/4 높이로 — 아래 노드로 들어가는 화살촉과 이웃 받는 노드 선의 가운데 꺾임(틈의 1/2)을 피한다(browser-check2 4).
    const under = others.filter((b) => b.y1 >= sy && b.x1 < Math.max(sx, lane) && Math.min(sx, lane) < b.x2).map((b) => b.y1);
    const escape = under.length > 0 ? Math.min(top, sy + (Math.min(...under) - sy) / 4) : top;
    const pts = lane > sx ? [{ x: sx, y: escape }, { x: lane, y: escape }, { x: lane, y: bottom }] : [{ x: sx, y: bottom }];
    out[e.id] = [...pts, { x: tx, y: bottom }].map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
  }
  return out;
}

/** 가로·세로 선분으로 된 꺾은선이 상자 안을 지나는가(테두리에 닿기만 하는 것은 아니다). */
function crossesBox(pts: readonly FlowPos[], b: Box): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [a, c] = [pts[i - 1], pts[i]];
    const [lx, hx, ly, hy] = [Math.min(a.x, c.x), Math.max(a.x, c.x), Math.min(a.y, c.y), Math.max(a.y, c.y)];
    const xIn = lx === hx ? b.x1 < lx && lx < b.x2 : lx < b.x2 && b.x1 < hx;
    const yIn = ly === hy ? b.y1 < ly && ly < b.y2 : ly < b.y2 && b.y1 < hy;
    if (xIn && yIn) return true;
  }
  return false;
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
 * 받는 노드(CATCH)는 마지막에 붙은 룰 자리에서 다시 정한다(저장 위치를 쓰지 않는다).
 */
export function drawnPositions(f: EditFlow, blocks: Readonly<Record<string, unknown>> = {}): Record<string, FlowPos> {
  const saved = f.view?.positions ?? {};
  const nodes = (f.nodes ?? []).filter((n) => n.kind !== "CATCH"); // 받는 노드는 룰 테두리에 걸친다 — 겹침으로 보지 않는다(R15)
  const pinned = new Set(nodes.filter((n) => saved[n.id]).map((n) => n.id));
  const boxes = nodes.map((n) => ({ id: n.id, ...nodeSizeOf(f, n, blocks) }));
  return placeCatches(f, resolveOverlaps(boxes, positionsOf(f, blocks), pinned), blocks);
}

/** [자동 정렬] — 모든 노드 위치를 자동 배치로 덮고 선 경로(C14)·이름표 오프셋(L1)을 함께 지운다. 그룹 틀과 겹친 메모는 비킨다. 한 번의 편집(이력 한 칸)이다. */
export function autoArrange(f: EditFlow): EditFlow {
  return clearNotesFromGroups(clearLabels(clearRoutes(setPositions(f, autoLayout(f)))));
}

/** 그룹 틀 바깥 여백 — 멤버 바깥 상자에서 이만큼 띄운다. */
export const GROUP_MARGIN = 16;
/** 그룹 틀 — 멤버의 그린 상자(노드별 크기, 접힌 분기는 룰 크기)의 바깥 상자 + 여백 + 더한 여백(pad, G2). 멤버가 하나도 없으면 null. */
export function groupBox(
  nodeIds: readonly string[], pos: Readonly<Record<string, FlowPos>>, sizeOf: (id: string) => NodeSize | undefined, pad: GroupPad | null | undefined,
): { x: number; y: number; w: number; h: number } | null {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const id of nodeIds) {
    const p = pos[id];
    const s = sizeOf(id);
    if (!p || !s) continue;
    x1 = Math.min(x1, p.x);
    y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x + s.w);
    y2 = Math.max(y2, p.y + s.h);
  }
  if (!Number.isFinite(x1)) return null;
  const d = pad ?? { l: 0, t: 0, r: 0, b: 0 };
  return {
    x: x1 - GROUP_MARGIN - d.l,
    y: y1 - GROUP_MARGIN - d.t,
    w: x2 - x1 + GROUP_MARGIN * 2 + d.l + d.r,
    h: y2 - y1 + GROUP_MARGIN * 2 + d.t + d.b,
  };
}

/**
 * 자동 정렬 뒤 그룹 틀과 겹친 메모를 틀 밖으로 비킨다(2026-10-02 사용자 요청 "메모는 같이 안 들어가도록"). 메모는 자동 배치를 받지 않아 제자리에 남는데,
 * 멤버 노드가 새 자리로 가며 틀이 넓어지면 메모가 틀 안에 든다. 겹친 메모만 높이(y)는 그대로 두고, 그 높이에 걸치는 틀·노드·다른 메모의
 * 오른쪽 끝 + 간격으로 옮긴다. 겹치지 않는 메모는 그대로이고 먼저 장애물로 둔다. 붙은 메모(attach)도 같다 — 붙임은 자리를 묶지 않는다.
 */
function clearNotesFromGroups(f: EditFlow): EditFlow {
  if (f.view.notes.length === 0 || f.view.groups.length === 0) return f;
  type Rect = { x: number; y: number; w: number; h: number };
  const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const byId = new Map((f.nodes ?? []).map((n) => [n.id, n] as const));
  const sizeOf = (id: string) => (byId.has(id) ? nodeSizeOf(f, byId.get(id)!) : undefined);
  const pos = placeCatches(f, f.view.positions);
  const groups = f.view.groups.map((g) => groupBox(g.nodeIds, pos, sizeOf, g.pad)).filter((b): b is Rect => !!b);
  const inGroup = (n: Rect) => groups.some((g) => hit(n, g));
  if (!f.view.notes.some(inGroup)) return f;
  const nodes = (f.nodes ?? []).filter((n) => pos[n.id]).map((n) => ({ ...pos[n.id], ...nodeSizeOf(f, n) }));
  const placed: Rect[] = [...groups, ...nodes, ...f.view.notes.filter((n) => !inGroup(n))];
  const notes = f.view.notes.map((n) => {
    if (!inGroup(n)) return n;
    const x = Math.max(n.x, ...placed.filter((o) => o.y < n.y + n.h && n.y < o.y + o.h).map((o) => o.x + o.w + NODESEP));
    const moved = { ...n, x: Math.round(x) };
    placed.push(moved);
    return moved;
  });
  return { ...f, view: { ...f.view, notes } };
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
