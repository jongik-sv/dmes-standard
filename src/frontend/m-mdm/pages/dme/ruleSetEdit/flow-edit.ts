/**
 * 룰 세트 흐름 편집 연산(2단계 계획 P7) — 캔버스가 부르는 순수 함수. React 의존이 없다.
 *
 * 모든 연산은 입력을 바꾸지 않는다. 먼저 노드·선·view 를 칸을 채운 새 객체로 복사한 뒤 복사본만 고친다.
 * 돌려주는 노드는 `{id, kind, ruleId, splitId, label}`, 선은 `{id, from, to, order, cond, otherwise, label}` 칸을
 * 모두 가진다(없는 값은 null, otherwise 는 boolean). 1단계 `parseFlow` 는 입력을 정규화하지 않으므로 이 모양이 곧 계약이다.
 * `flowJsonOf` 는 서버 `RuleSetFlowJson.canonical`(P2)과 같은 키 순서로 써서 dirty 비교가 문자열 비교로 맞게 한다.
 * 3단계(계획 P6)는 옮기기·룰 바꾸기·복사·붙여넣기·복제·분기 종류 바꾸기·분기 풀기·갈래 순서를 더한다(파일 끝).
 */
import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

import { linearFlow } from "./flow-model";

export interface FlowPos {
  x: number;
  y: number;
}
export interface FlowNote {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  attach: string | null;
}
export interface FlowGroup {
  id: string;
  title: string;
  nodeIds: string[];
}
export interface FlowView {
  positions: Record<string, FlowPos>;
  notes: FlowNote[];
  groups: FlowGroup[];
  /** 선 ID → 꺾는 점 목록(흐름 좌표, C14). 점이 없는 선은 키가 없다. */
  routes: Record<string, FlowPos[]>;
  /** 선 ID → 조건 라벨·변수 칩 묶음의 기본 자리에서의 오프셋(흐름 좌표, L1). 옮기지 않은 선은 키가 없다. */
  labels: Record<string, EdgeLabelOffsets>;
}
/** 선 이름표 오프셋(흐름 좌표, 정수). 기본 자리(선 끝·경로에서 계산한 자리)에 더한다 — 선 끝이 움직여도 기본 자리를 따라간다. */
export interface LabelOffset {
  dx: number;
  dy: number;
}
/** 옮길 수 있는 이름표 — 조건 라벨·변수 칩 묶음. */
export type LabelPart = "label" | "chips";
export type EdgeLabelOffsets = Partial<Record<LabelPart, LabelOffset>>;
export interface EditFlow extends RuleSetFlow {
  view: FlowView;
}
export type EditResult = { ok: true; flow: EditFlow } | { ok: false; reason: string };

/** 흐름 하나의 노드 상한 — 서버 `RuleSetFlowJson.MAX_NODES` 와 같은 값(P2). */
export const MAX_NODES = 200;
/** 노드 상한을 넘는 끼우기·붙여넣기·복제·끌어 넣기의 거부 문구(3단계 P6). */
export const NODE_LIMIT_MESSAGE = `노드는 흐름 하나에 ${MAX_NODES}개까지 둔다`;

export const EMPTY_VIEW: FlowView = Object.freeze({
  positions: Object.freeze({}) as Record<string, FlowPos>,
  notes: Object.freeze([]) as unknown as FlowNote[],
  groups: Object.freeze([]) as unknown as FlowGroup[],
  routes: Object.freeze({}) as Record<string, FlowPos[]>,
  labels: Object.freeze({}) as Record<string, EdgeLabelOffsets>,
});
/** 꺾는 점은 선 하나에 20개까지(C14). */
export const MAX_ROUTE_POINTS = 20;
export const ROUTE_LIMIT_MESSAGE = `꺾는 점은 선 하나에 ${MAX_ROUTE_POINTS}개까지 둔다`;
/** 이름표 오프셋 한계(흐름 좌표, ±, L1) — 넘으면 자른다. */
export const MAX_LABEL_OFFSET = 600;
const LABEL_PARTS: readonly LabelPart[] = ["label", "chips"];

/** 새 메모 크기(계약 밖 기본값). */
const NOTE_W = 160;
const NOTE_H = 80;

const IF_BRANCH_LABEL = (order: number) => `갈래 ${order}`;
const OTHERWISE_LABEL = "그 외";
const SPLIT_LABEL: Record<"IF" | "PARALLEL", string> = { IF: "조건", PARALLEL: "병렬" };
const SPLIT_PREFIX: Record<"IF" | "PARALLEL", string> = { IF: "if", PARALLEL: "par" };
/** 룰 노드를 떼어 낼 수 없을 때(지우기·옮기기 같은 문구). */
const RULE_EDGES_NOT_ONE = "룰 노드의 선이 하나씩이 아니라 지울 수 없다. 선을 먼저 정리한다";

// ───────────────────────── 모양 도우미 ─────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isSplitKind = (k: FlowNodeKind): k is "IF" | "PARALLEL" => k === "IF" || k === "PARALLEL";

/** 모든 칸을 채운 노드. */
function node(id: string, kind: FlowNodeKind, ruleId: string | null = null, splitId: string | null = null, label: string | null = null): FlowNode {
  return { id, kind, ruleId, splitId, label };
}

/** 모든 칸을 채운 선. */
function edge(id: string, from: string, to: string, extra: Partial<Pick<FlowEdge, "order" | "cond" | "otherwise" | "label">> = {}): FlowEdge {
  return { id, from, to, order: extra.order ?? null, cond: extra.cond ?? null, otherwise: extra.otherwise === true, label: extra.label ?? null };
}

const copyNode = (n: FlowNode): FlowNode => node(n.id, n.kind, str(n.ruleId), str(n.splitId), str(n.label));
const copyEdge = (e: FlowEdge): FlowEdge =>
  edge(e.id, e.from, e.to, { order: int(e.order), cond: str(e.cond), otherwise: e.otherwise === true, label: str(e.label) });
const copyPos = (p: FlowPos): FlowPos => ({ x: p.x, y: p.y });
const copyNote = (n: FlowNote): FlowNote => ({ id: n.id, text: n.text, x: n.x, y: n.y, w: n.w, h: n.h, attach: n.attach ?? null });
const copyGroup = (g: FlowGroup): FlowGroup => ({ id: g.id, title: g.title, nodeIds: [...g.nodeIds] });

/** 흐름에 있는 선의 경로만, 선 배열 순서로 복사한다(빈 경로·없는 선은 버린다). */
function routesFor(edges: readonly FlowEdge[], routes: Readonly<Record<string, readonly FlowPos[]>> | undefined): Record<string, FlowPos[]> {
  const out: Record<string, FlowPos[]> = {};
  if (!routes) return out;
  for (const e of edges) {
    const r = routes[e.id];
    if (Array.isArray(r) && r.length > 0) out[e.id] = r.map(copyPos);
  }
  return out;
}

const clampOffset = (n: number) => Math.max(-MAX_LABEL_OFFSET, Math.min(MAX_LABEL_OFFSET, Math.round(n)));

/** 흐름에 있는 선의 이름표 오프셋만, 선 배열 순서·label→chips 순서로 복사한다(빈 항목·없는 선은 버린다). */
function labelsFor(
  edges: readonly FlowEdge[],
  labels: Readonly<Record<string, Readonly<EdgeLabelOffsets>>> | undefined,
): Record<string, EdgeLabelOffsets> {
  const out: Record<string, EdgeLabelOffsets> = {};
  if (!labels) return out;
  for (const e of edges) {
    const l = labels[e.id];
    if (!l) continue;
    const c: EdgeLabelOffsets = {};
    for (const part of LABEL_PARTS) {
      const o = l[part];
      if (o) c[part] = { dx: o.dx, dy: o.dy };
    }
    if (c.label || c.chips) out[e.id] = c;
  }
  return out;
}

function copyView(v: FlowView | undefined, edges: readonly FlowEdge[]): FlowView {
  const positions: Record<string, FlowPos> = {};
  for (const [k, p] of Object.entries(v?.positions ?? {})) positions[k] = copyPos(p);
  return {
    positions, notes: (v?.notes ?? []).map(copyNote), groups: (v?.groups ?? []).map(copyGroup), routes: routesFor(edges, v?.routes),
    labels: labelsFor(edges, v?.labels),
  };
}

/** 고쳐도 되는 깊은 복사본(칸을 모두 채운다). 흐름에 없는 선의 경로·이름표 오프셋은 버린다. */
function clone(f: EditFlow): EditFlow {
  const edges = (f.edges ?? []).map(copyEdge);
  return { version: 1, nodes: (f.nodes ?? []).map(copyNode), edges, view: copyView(f.view, edges) };
}

/** 모양이 맞는 view 항목만 남긴다(P7 toEditFlow). */
function sanitizeView(raw: unknown): FlowView {
  const view: FlowView = { positions: {}, notes: [], groups: [], routes: {}, labels: {} };
  if (!isObj(raw)) return view;
  if (isObj(raw.positions)) {
    for (const [k, p] of Object.entries(raw.positions)) {
      if (isObj(p) && finite(p.x) && finite(p.y)) view.positions[k] = { x: p.x, y: p.y };
    }
  }
  if (Array.isArray(raw.notes)) {
    for (const n of raw.notes) {
      if (!isObj(n) || typeof n.id !== "string" || typeof n.text !== "string") continue;
      if (!finite(n.x) || !finite(n.y) || !finite(n.w) || !finite(n.h)) continue;
      if (n.attach != null && typeof n.attach !== "string") continue;
      view.notes.push({ id: n.id, text: n.text, x: n.x, y: n.y, w: n.w, h: n.h, attach: (n.attach as string | null | undefined) ?? null });
    }
  }
  if (Array.isArray(raw.groups)) {
    for (const g of raw.groups) {
      if (!isObj(g) || typeof g.id !== "string" || typeof g.title !== "string") continue;
      if (!Array.isArray(g.nodeIds) || !g.nodeIds.every((x) => typeof x === "string")) continue;
      view.groups.push({ id: g.id, title: g.title, nodeIds: [...(g.nodeIds as string[])] });
    }
  }
  if (isObj(raw.routes)) {
    for (const [k, list] of Object.entries(raw.routes)) {
      if (!Array.isArray(list)) continue;
      const pts: FlowPos[] = [];
      for (const p of list) if (isObj(p) && finite(p.x) && finite(p.y)) pts.push({ x: p.x, y: p.y });
      if (pts.length > 0) view.routes[k] = pts.slice(0, MAX_ROUTE_POINTS);
    }
  }
  if (isObj(raw.labels)) {
    for (const [k, l] of Object.entries(raw.labels)) {
      if (!isObj(l)) continue;
      const c: EdgeLabelOffsets = {};
      for (const part of LABEL_PARTS) {
        const o = l[part];
        if (isObj(o) && finite(o.dx) && finite(o.dy)) c[part] = { dx: clampOffset(o.dx), dy: clampOffset(o.dy) };
      }
      if (c.label || c.chips) view.labels[k] = c;
    }
  }
  return view;
}

// ───────────────────────── ID ─────────────────────────

function takenIds(f: EditFlow): Set<string> {
  const s = new Set<string>();
  for (const n of f.nodes ?? []) s.add(n.id);
  for (const e of f.edges ?? []) s.add(e.id);
  for (const n of f.view?.notes ?? []) s.add(n.id);
  for (const g of f.view?.groups ?? []) s.add(g.id);
  return s;
}

function fresh(taken: Set<string>, prefix: string): string {
  for (let i = 1; ; i++) {
    const id = `${prefix}${i}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

/** `p1`, `p2`, … 가운데 노드·선·메모·그룹 ID 어디에도 없는 가장 작은 것. */
export function nextId(f: EditFlow, prefix: string): string {
  return fresh(takenIds(f), prefix);
}

// ───────────────────────── 구조 도우미 ─────────────────────────

const fail = (reason: string): EditResult => ({ ok: false, reason });
/** 결과를 돌려주기 전에 사라진 선의 경로·이름표 오프셋을 버린다(연산이 선을 지우거나 바꿨을 수 있다). */
const done = (flow: EditFlow): EditResult => {
  const routes = routesFor(flow.edges, flow.view?.routes);
  const labels = labelsFor(flow.edges, flow.view?.labels);
  return { ok: true, flow: flow.view ? { ...flow, view: { ...flow.view, routes, labels } } : flow };
};
const findNode = (f: EditFlow, id: string) => f.nodes.find((n) => n.id === id);
const findEdge = (f: EditFlow, id: string) => f.edges.find((e) => e.id === id);
const outOf = (f: EditFlow, id: string) => f.edges.filter((e) => e.from === id);
const inOf = (f: EditFlow, id: string) => f.edges.filter((e) => e.to === id);

/** 짝 합류 — splitId 가 같은 MERGE 가 정확히 하나일 때만. */
function mergeOf(f: EditFlow, splitId: string): FlowNode | null {
  const ms = f.nodes.filter((n) => n.kind === "MERGE" && n.splitId === splitId);
  return ms.length === 1 ? ms[0] : null;
}

/**
 * from 들에서 나가는 선을 따라 stop(짝 합류) 직전까지 닿는 노드 ID. 모은 집합이 닫힌 블록이 아니면 null.
 * - 나가는 쪽: START·END·없는 노드·분기 자신에 닿으면 null(뒤 선으로 앞쪽이나 분기로 돌아가는 순환 포함).
 * - 들어오는 쪽: 모은 노드마다 들어오는 선이 입구 선(entry)이거나 모은 집합 안에서 와야 한다. 블록 밖에서 들어오는 선이
 *   있으면 null — 그 노드를 지우면 블록 밖 흐름까지 끊기기 때문이다.
 */
function reach(f: EditFlow, from: readonly string[], stop: string, splitId: string, entry: (e: FlowEdge) => boolean): Set<string> | null {
  const seen = new Set<string>();
  const queue = [...from];
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === stop || seen.has(id)) continue;
    if (id === splitId) return null;
    const n = findNode(f, id);
    if (!n || n.kind === "START" || n.kind === "END") return null;
    seen.add(id);
    for (const e of outOf(f, id)) queue.push(e.to);
  }
  for (const id of seen) {
    if (!inOf(f, id).every((e) => entry(e) || seen.has(e.from))) return null;
  }
  return seen;
}

/** 분기 안(합류 제외) 노드 집합 — 분기의 나가는 선들에서 합류 직전까지. 합류로 들어오는 선도 분기·안쪽에서만 와야 한다. */
function blockNodes(f: EditFlow, splitId: string, mergeId: string): Set<string> | null {
  const fromSplit = (e: FlowEdge) => e.from === splitId;
  const inner = reach(
    f,
    outOf(f, splitId).map((e) => e.to),
    mergeId,
    splitId,
    fromSplit,
  );
  if (!inner) return null;
  return inOf(f, mergeId).every((e) => fromSplit(e) || inner.has(e.from)) ? inner : null;
}

/** 갈래 선 하나의 안쪽 노드 집합(e.to 에서 합류 전까지). 안쪽 노드로는 그 갈래 선과 안쪽 선만 들어와야 한다. */
function branchNodes(f: EditFlow, splitId: string, edgeId: string, mergeId: string): Set<string> | null {
  const e = findEdge(f, edgeId);
  return e ? reach(f, [e.to], mergeId, splitId, (x) => x.id === edgeId) : null;
}

/** 노드들을 지우고, 닿는 선을 모두 지우고, view 흔적(배치·그룹·메모 붙임)을 치운다. f 는 복사본이다. */
function dropNodes(f: EditFlow, ids: ReadonlySet<string>): EditFlow {
  const nodes = f.nodes.filter((n) => !ids.has(n.id));
  const edges = f.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to));
  const positions: Record<string, FlowPos> = {};
  for (const [k, p] of Object.entries(f.view.positions)) if (!ids.has(k)) positions[k] = p;
  const groups = f.view.groups
    .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((x) => !ids.has(x)) }))
    .filter((g) => g.nodeIds.length > 0);
  const notes = f.view.notes.map((n) => (n.attach != null && ids.has(n.attach) ? { ...n, attach: null } : n));
  return { version: f.version, nodes, edges, view: { positions, notes, groups, routes: f.view.routes, labels: f.view.labels } };
}

function insertAfter<T>(list: T[], index: number, ...items: T[]): void {
  list.splice(index < 0 ? list.length : index + 1, 0, ...items);
}

// ───────────────────────── 공개 연산 ─────────────────────────

/** null 이면 `linearFlow(ruleIds)` + 빈 view. raw 가 있으면 칸을 채워 복사하고 모양이 맞는 view 항목만 남긴다. */
export function toEditFlow(raw: (RuleSetFlow & { view?: unknown }) | null, ruleIds: readonly string[]): EditFlow {
  const src = raw ?? linearFlow(ruleIds);
  const edges = (Array.isArray(src.edges) ? src.edges : []).map(copyEdge);
  const view = raw ? sanitizeView(raw.view) : { positions: {}, notes: [], groups: [], routes: {}, labels: {} };
  return {
    version: 1,
    nodes: (Array.isArray(src.nodes) ? src.nodes : []).map(copyNode),
    edges,
    view: { ...view, routes: routesFor(edges, view.routes), labels: labelsFor(edges, view.labels) },
  };
}

/** P2 정규 JSON 과 같은 키 순서의 문자열. view 항목도 고정 키 순서로 쓴다. */
export function flowJsonOf(f: EditFlow): string {
  const c = clone(f);
  const v = c.view;
  return JSON.stringify({
    version: 1, nodes: c.nodes, edges: c.edges, view: { positions: v.positions, notes: v.notes, groups: v.groups, routes: v.routes, labels: v.labels },
  });
}

/** 선 e(A→B) 위에 룰을 끼운다. e.to = 새 룰, 새 선 {룰→B} 는 e 바로 뒤. 새 노드는 A 뒤(A 가 없으면 끝). */
export function insertRule(f: EditFlow, edgeId: string, ruleId: string): EditResult {
  const g = clone(f);
  const ei = g.edges.findIndex((e) => e.id === edgeId);
  if (ei < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  const e = g.edges[ei];
  const taken = takenIds(g);
  const r = node(fresh(taken, "r"), "RULE", ruleId);
  const out = edge(fresh(taken, "e"), r.id, e.to);
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === e.from),
    r,
  );
  e.to = r.id;
  insertAfter(g.edges, ei, out);
  return done(g);
}

/** 선 e(A→B) 위에 분기 s·짝 합류 m 을 끼운다. 갈래 두 개와 합류 출구 {m→B} 를 만든다. */
export function insertSplit(f: EditFlow, edgeId: string, kind: "IF" | "PARALLEL"): EditResult {
  const g = clone(f);
  const ei = g.edges.findIndex((e) => e.id === edgeId);
  if (ei < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  const e = g.edges[ei];
  const taken = takenIds(g);
  const s = node(fresh(taken, SPLIT_PREFIX[kind]), kind, null, null, SPLIT_LABEL[kind]);
  const m = node(fresh(taken, "m"), "MERGE", null, s.id);
  const branches =
    kind === "IF"
      ? [
          edge(fresh(taken, "e"), s.id, m.id, { order: 1, label: IF_BRANCH_LABEL(1) }),
          edge(fresh(taken, "e"), s.id, m.id, { otherwise: true, label: OTHERWISE_LABEL }),
        ]
      : [
          edge(fresh(taken, "e"), s.id, m.id, { order: 1, label: IF_BRANCH_LABEL(1) }),
          edge(fresh(taken, "e"), s.id, m.id, { order: 2, label: IF_BRANCH_LABEL(2) }),
        ];
  const exit = edge(fresh(taken, "e"), m.id, e.to);
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === e.from),
    s,
    m,
  );
  e.to = s.id;
  insertAfter(g.edges, ei, ...branches, exit);
  return done(g);
}

/** 노드를 지운다. RULE 은 앞뒤 선을 잇고, 분기는 짝 합류까지 안쪽을 통째로 지운다. */
export function removeNode(f: EditFlow, nodeId: string): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(`노드 ${nodeId}를 찾지 못했다`);
  if (n.kind === "START") return fail("시작 노드는 지울 수 없다");
  if (n.kind === "END") return fail("끝 노드는 지울 수 없다");
  if (n.kind === "MERGE") return fail("합류 노드는 분기를 지워서 없앤다");
  const ins = inOf(g, nodeId);
  if (n.kind === "RULE") {
    const outs = outOf(g, nodeId);
    if (ins.length !== 1 || outs.length !== 1) return fail(RULE_EDGES_NOT_ONE);
    ins[0].to = outs[0].to;
    g.edges = g.edges.filter((e) => e !== outs[0]);
    return done(dropNodes(g, new Set([nodeId])));
  }
  const cannot = `분기 ${nodeId}의 짝 합류를 찾지 못해 지울 수 없다`;
  const m = mergeOf(g, nodeId);
  if (!m) return fail(cannot);
  const exits = outOf(g, m.id);
  if (ins.length !== 1 || exits.length !== 1) return fail(cannot);
  const inner = blockNodes(g, nodeId, m.id);
  if (!inner) return fail(cannot);
  ins[0].to = exits[0].to;
  return done(dropNodes(g, new Set([nodeId, ...inner, m.id])));
}

/** 분기 s 와 그 갈래 선 e 를 확인한다. */
function splitAndMerge(g: EditFlow, splitId: string): { split: FlowNode; merge: FlowNode } | string {
  const split = findNode(g, splitId);
  if (!split || !isSplitKind(split.kind)) return `노드 ${splitId}는 분기가 아니다`;
  const merge = mergeOf(g, splitId);
  if (!merge) return `분기 ${splitId}의 짝 합류를 찾지 못했다`;
  return { split, merge };
}

function branchEdge(g: EditFlow, splitId: string, edgeId: string): FlowEdge | string {
  const e = findEdge(g, edgeId);
  if (!e) return `선 ${edgeId}를 찾지 못했다`;
  if (e.from !== splitId) return `선 ${edgeId}는 분기 ${splitId}의 갈래가 아니다`;
  return e;
}

const maxOrder = (branches: readonly FlowEdge[]) =>
  branches.filter((e) => !e.otherwise && e.order != null).reduce((m, e) => Math.max(m, e.order as number), 0);

/** 빈 갈래를 더한다. IF 는 "그 외" 앞, PARALLEL 은 끝 갈래 뒤. order = 최대 order + 1. */
export function addBranch(f: EditFlow, splitId: string): EditResult {
  const g = clone(f);
  const sm = splitAndMerge(g, splitId);
  if (typeof sm === "string") return fail(sm);
  const outs = outOf(g, splitId);
  const order = maxOrder(outs) + 1;
  const b = edge(fresh(takenIds(g), "e"), splitId, sm.merge.id, { order, label: IF_BRANCH_LABEL(order) });
  const other = sm.split.kind === "IF" ? outs.find((e) => e.otherwise) : undefined;
  if (other) g.edges.splice(g.edges.indexOf(other), 0, b);
  else insertAfter(g.edges, outs.length > 0 ? g.edges.indexOf(outs[outs.length - 1]) : -1, b);
  return done(g);
}

/** 갈래 선 e 와 그 안 노드·선을 지운다. "그 외" 는 지우지 않고, 갈래는 2개 이상 남긴다. */
export function removeBranch(f: EditFlow, splitId: string, edgeId: string): EditResult {
  const g = clone(f);
  const sm = splitAndMerge(g, splitId);
  if (typeof sm === "string") return fail(sm);
  const e = branchEdge(g, splitId, edgeId);
  if (typeof e === "string") return fail(e);
  if (e.otherwise) return fail('"그 외" 갈래는 지울 수 없다');
  if (outOf(g, splitId).length - 1 < 2) return fail("분기에는 갈래가 2개 이상 있어야 한다");
  const inner = branchNodes(g, splitId, edgeId, sm.merge.id);
  if (!inner) return fail(`분기 ${splitId}의 짝 합류를 찾지 못해 지울 수 없다`);
  g.edges = g.edges.filter((x) => x !== e);
  return done(dropNodes(g, inner));
}

/** "그 외" 가 아닌 갈래를 order 로 줄 세워 이웃과 order 값을 바꾼다. */
export function moveBranch(f: EditFlow, splitId: string, edgeId: string, dir: -1 | 1): EditResult {
  const g = clone(f);
  const sm = splitAndMerge(g, splitId);
  if (typeof sm === "string") return fail(sm);
  const e = branchEdge(g, splitId, edgeId);
  if (typeof e === "string") return fail(e);
  const sorted = outOf(g, splitId)
    .filter((x) => !x.otherwise)
    .sort((a, b) => (a.order ?? Number.POSITIVE_INFINITY) - (b.order ?? Number.POSITIVE_INFINITY));
  const i = sorted.indexOf(e);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sorted.length) return fail("더 옮길 수 없다");
  const other = sorted[j];
  [e.order, other.order] = [other.order, e.order];
  return done(g);
}

/** 선의 조건식·이름 가운데 주어진 칸만 바꾼다(공백 판정은 파서 몫). */
export function updateEdge(f: EditFlow, edgeId: string, patch: { cond?: string | null; label?: string | null }): EditResult {
  const g = clone(f);
  const e = findEdge(g, edgeId);
  if (!e) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (patch.cond !== undefined) e.cond = patch.cond;
  if (patch.label !== undefined) e.label = patch.label;
  return done(g);
}

export function updateNodeLabel(f: EditFlow, nodeId: string, label: string | null): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(`노드 ${nodeId}를 찾지 못했다`);
  n.label = label;
  return done(g);
}

/** 새 선 {from→to} 을 끝에 더한다. 같은 from·to 선이 있으면 거부한다. */
export function connect(f: EditFlow, from: string, to: string): EditResult {
  const g = clone(f);
  if (g.edges.some((e) => e.from === from && e.to === to)) return fail("이미 이어진 선이다");
  if (!findNode(g, from)) return fail(`노드 ${from}를 찾지 못했다`);
  if (!findNode(g, to)) return fail(`노드 ${to}를 찾지 못했다`);
  g.edges.push(edge(fresh(takenIds(g), "e"), from, to));
  return done(g);
}

/**
 * 선 하나의 한쪽(또는 양쪽) 끝을 다른 노드로 옮겨 붙인다(다시 잇기, R1). 선 ID·조건식·이름·순서·"그 외" 표시는 그대로이고
 * 그 선의 꺾는 점은 버린다(양 끝이 바뀌면 옛 경로가 맞지 않는다). 이름표 오프셋(L1)은 기본 자리 기준이라 남긴다. 자기 자신으로 잇기·없는 노드·다른 선과 같은 from→to·바뀌는 끝이 없음은 거부한다.
 * 구조가 틀어지는 경우(합류 건너뛰기 등)는 막지 않고 구조 검사가 표시한다.
 */
export function reconnectEdge(f: EditFlow, edgeId: string, end: { from?: string; to?: string }): EditResult {
  const g = clone(f);
  const e = findEdge(g, edgeId);
  if (!e) return fail(`선 ${edgeId}를 찾지 못했다`);
  const from = end.from ?? e.from;
  const to = end.to ?? e.to;
  if (from === e.from && to === e.to) return fail("옮길 끝이 없다");
  if (!findNode(g, from)) return fail(`노드 ${from}를 찾지 못했다`);
  if (!findNode(g, to)) return fail(`노드 ${to}를 찾지 못했다`);
  if (from === to) return fail("노드를 자기 자신에게 이을 수 없다");
  if (g.edges.some((x) => x.id !== edgeId && x.from === from && x.to === to)) return fail("이미 이어진 선이다");
  e.from = from;
  e.to = to;
  const routes = { ...g.view.routes };
  delete routes[edgeId];
  g.view.routes = routes;
  return done(g);
}

export function removeEdge(f: EditFlow, edgeId: string): EditResult {
  const g = clone(f);
  if (!findEdge(g, edgeId)) return fail(`선 ${edgeId}를 찾지 못했다`);
  g.edges = g.edges.filter((e) => e.id !== edgeId);
  return done(g);
}

/** 선 하나의 꺾는 점을 통째로 바꾼다(끌기 끝·점 더하기·빼기). 빈 배열이면 그 선의 경로를 지운다. */
export function setRoute(f: EditFlow, edgeId: string, points: readonly FlowPos[]): EditResult {
  if (!f.edges.some((e) => e.id === edgeId)) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (points.length > MAX_ROUTE_POINTS) return fail(ROUTE_LIMIT_MESSAGE);
  if (!points.every((p) => finite(p.x) && finite(p.y))) return fail("꺾는 점의 좌표가 올바르지 않다");
  const g = clone(f);
  const routes = { ...g.view.routes };
  if (points.length === 0) delete routes[edgeId];
  else routes[edgeId] = points.map(copyPos);
  g.view.routes = routes;
  return done(g);
}

/** 모든 선의 경로를 지운다(자동 정렬). */
export function clearRoutes(f: EditFlow): EditFlow {
  const g = clone(f);
  g.view.routes = {};
  return g;
}

/** 모든 선의 이름표 오프셋을 지운다(자동 정렬, L1). */
export function clearLabels(f: EditFlow): EditFlow {
  const g = clone(f);
  g.view.labels = {};
  return g;
}

/**
 * 선 하나의 조건 라벨 또는 변수 칩 묶음 오프셋을 둔다(끌어 놓을 때 한 번, L1). 값은 정수로 반올림하고 ±600 으로 자른다.
 * null 이나 {0,0} 이면 그 부분을 지우고(기본 자리), 두 부분이 모두 없으면 선 키를 지운다. 없는 선·유한하지 않은 값은 거부한다.
 */
export function setLabelOffset(f: EditFlow, edgeId: string, part: LabelPart, off: LabelOffset | null): EditResult {
  if (!f.edges.some((e) => e.id === edgeId)) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (off && !(finite(off.dx) && finite(off.dy))) return fail("이름표 위치가 올바르지 않다");
  const g = clone(f);
  const labels = { ...g.view.labels };
  const cur: EdgeLabelOffsets = { ...labels[edgeId] };
  const next = off ? { dx: clampOffset(off.dx), dy: clampOffset(off.dy) } : null;
  if (next && (next.dx !== 0 || next.dy !== 0)) cur[part] = next;
  else delete cur[part];
  if (cur.label || cur.chips) labels[edgeId] = cur;
  else delete labels[edgeId];
  g.view.labels = labels;
  return done(g);
}

/** 선 하나의 경로와 이름표 오프셋을 함께 지운다(선 우클릭 [경로 초기화], L1). */
export function clearEdgeLayout(f: EditFlow, edgeId: string): EditResult {
  if (!f.edges.some((e) => e.id === edgeId)) return fail(`선 ${edgeId}를 찾지 못했다`);
  const g = clone(f);
  const routes = { ...g.view.routes };
  const labels = { ...g.view.labels };
  delete routes[edgeId];
  delete labels[edgeId];
  g.view.routes = routes;
  g.view.labels = labels;
  return done(g);
}

/** 배치를 덮어쓴다(병합). 흐름에 있는 노드 ID 만 남긴다 — 없는 ID(낡은 캔버스 끌기 등)의 위치 키는 적지 않고, 이미 있던 것도 치운다. */
export function setPositions(f: EditFlow, pos: Readonly<Record<string, FlowPos>>): EditFlow {
  const g = clone(f);
  const ids = new Set(g.nodes.map((n) => n.id));
  const positions: Record<string, FlowPos> = {};
  for (const [k, p] of Object.entries(g.view.positions)) if (ids.has(k)) positions[k] = p;
  for (const [k, p] of Object.entries(pos)) if (ids.has(k)) positions[k] = copyPos(p);
  g.view.positions = positions;
  return g;
}

export function addNote(f: EditFlow, at: FlowPos, attach: string | null): { flow: EditFlow; id: string } {
  const g = clone(f);
  const id = fresh(takenIds(g), "n");
  g.view.notes.push({ id, text: "", x: at.x, y: at.y, w: NOTE_W, h: NOTE_H, attach });
  return { flow: g, id };
}

/** 메모의 주어진 칸만 바꾼다(undefined 칸은 건드리지 않는다 — updateEdge 와 같다). */
export function updateNote(f: EditFlow, id: string, patch: Partial<Omit<FlowNote, "id">>): EditFlow {
  const g = clone(f);
  const given = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<Omit<FlowNote, "id">>;
  g.view.notes = g.view.notes.map((n) => (n.id === id ? copyNote({ ...n, ...given, id }) : n));
  return g;
}

export function removeNote(f: EditFlow, id: string): EditFlow {
  const g = clone(f);
  g.view.notes = g.view.notes.filter((n) => n.id !== id);
  return g;
}

/** 그룹에 넣을 수 있는 노드만 — 있는 노드, START·END 제외, 중복 제거. */
function groupable(g: EditFlow, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const n = findNode(g, id);
    if (!n || n.kind === "START" || n.kind === "END" || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export function addGroup(f: EditFlow, nodeIds: readonly string[], title: string): EditResult & { id?: string } {
  const g = clone(f);
  const ids = groupable(g, nodeIds);
  if (ids.length < 1) return fail("그룹에 넣을 노드를 고른다");
  const id = fresh(takenIds(g), "g");
  g.view.groups.push({ id, title, nodeIds: ids });
  return { ok: true, flow: g, id };
}

/** 그룹 제목·노드를 바꾼다. 노드는 addGroup 과 같이 거른다(비어도 그룹은 남긴다 — 지우기는 removeGroup). */
export function updateGroup(f: EditFlow, id: string, patch: { title?: string; nodeIds?: string[] }): EditFlow {
  const g = clone(f);
  g.view.groups = g.view.groups.map((x) =>
    x.id !== id
      ? x
      : { id: x.id, title: patch.title ?? x.title, nodeIds: patch.nodeIds !== undefined ? groupable(g, patch.nodeIds) : x.nodeIds },
  );
  return g;
}

export function removeGroup(f: EditFlow, id: string): EditFlow {
  const g = clone(f);
  g.view.groups = g.view.groups.filter((x) => x.id !== id);
  return g;
}

// ───────────────────────── 3단계 편집 연산(계획 P6) ─────────────────────────

/** 복사한 조각 — 노드들과 양 끝이 모두 조각 안인 선. entry 로 들어가 exit 로 나온다(룰 하나면 entry = exit). */
export interface Fragment {
  nodes: FlowNode[];
  edges: FlowEdge[];
  entry: string;
  exit: string;
}

/** 붙여 넣을 때 새 ID 접두어(종류별). START·END 는 조각에 들지 않는다. */
const NODE_PREFIX: Partial<Record<FlowNodeKind, string>> = { RULE: "r", IF: SPLIT_PREFIX.IF, PARALLEL: SPLIT_PREFIX.PARALLEL, MERGE: "m" };
const KIND_NAME: Record<"IF" | "PARALLEL", string> = { IF: "IF", PARALLEL: "병렬" };
const MOVE_FIXED: Partial<Record<FlowNodeKind, string>> = {
  START: "시작 노드는 옮길 수 없다",
  END: "끝 노드는 옮길 수 없다",
  MERGE: "합류 노드는 분기를 옮겨서 옮긴다",
};
/** 룰 노드를 옮길 수 없을 때(선이 하나씩이 아님) — 지우기 문구와 따로 둔다. */
const RULE_EDGES_NOT_ONE_MOVE = "룰 노드의 선이 하나씩이 아니라 옮길 수 없다. 선을 먼저 정리한다";
const MOVE_INTO_SELF = "자기 자리나 자기 블록 안으로는 옮길 수 없다";
const NO_COPY = "시작·끝·합류는 복사하지 않는다. 분기를 복사하면 합류가 함께 복사된다";
const BAD_FRAGMENT = "붙여 넣을 조각이 올바르지 않다";
const AUTO_BRANCH_LABEL = /^갈래 \d+$/;
const notFound = (id: string) => `노드 ${id}를 찾지 못했다`;

/** 갈래 선의 실행 순서 — "그 외" 아닌 것을 order 오름차순(없으면 뒤, 같으면 배열 순서), "그 외" 는 마지막. */
function branchesInOrder(branches: readonly FlowEdge[]): FlowEdge[] {
  const key = (e: FlowEdge) => e.order ?? Number.POSITIVE_INFINITY;
  return [...branches.filter((e) => !e.otherwise).sort((a, b) => key(a) - key(b)), ...branches.filter((e) => e.otherwise)];
}

/** 분기 + 안쪽 + 짝 합류의 노드 ID(흐름 노드 배열 순서). 분기가 아니거나 블록이 닫히지 않으면 null. */
export function blockMembers(f: EditFlow, splitId: string): string[] | null {
  const s = findNode(f, splitId);
  if (!s || !isSplitKind(s.kind)) return null;
  const m = mergeOf(f, splitId);
  const inner = m ? blockNodes(f, splitId, m.id) : null;
  if (!m || !inner) return null;
  const members = new Set([splitId, m.id, ...inner]);
  return f.nodes.filter((n) => members.has(n.id)).map((n) => n.id);
}

/**
 * 노드를 옮길 때 놓을 대상에서 뺄 선. 룰은 자기로 들어오는·나가는 선, 분기는 분기로 들어오는 선·짝 합류에서 나가는 선·
 * 블록 안(양 끝이 분기·안쪽·합류) 모든 선. 그 밖 종류이거나 블록이 닫히지 않으면 빈 집합(옮기기 자체가 거부된다).
 */
export function moveExcludedEdges(f: EditFlow, nodeId: string): ReadonlySet<string> {
  const n = findNode(f, nodeId);
  if (n?.kind === "RULE") return new Set(f.edges.filter((e) => e.from === nodeId || e.to === nodeId).map((e) => e.id));
  const members = n && isSplitKind(n.kind) ? blockMembers(f, nodeId) : null;
  if (!members) return new Set();
  const inside = new Set(members);
  const mergeId = mergeOf(f, nodeId)!.id;
  return new Set(
    f.edges.filter((e) => e.to === nodeId || e.from === mergeId || (inside.has(e.from) && inside.has(e.to))).map((e) => e.id),
  );
}

/**
 * 룰 노드 또는 분기 블록을 선 t(X→Y) 로 옮긴다. 떠난 자리는 앞뒤를 잇고(룰은 removeNode 와 같이, 분기는 들어옴 → 합류 나감 도착),
 * t.to = 노드(분기면 분기 노드), 새 선 {출구 → Y}(출구 = 룰 자신 또는 짝 합류)를 t 바로 뒤에 넣는다.
 * t 의 order·cond·otherwise·label 은 그대로라 IF 갈래 선에 넣어도 갈래 뜻이 남는다. 노드 배열 순서·배치는 바꾸지 않는다.
 */
export function moveNode(f: EditFlow, nodeId: string, edgeId: string): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(notFound(nodeId));
  const fixed = MOVE_FIXED[n.kind];
  if (fixed) return fail(fixed);
  if (!findEdge(g, edgeId)) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (moveExcludedEdges(g, nodeId).has(edgeId)) return fail(MOVE_INTO_SELF);
  const taken = takenIds(g); // 떼기 전에 모은다 — 방금 지운 선 ID 를 새 선에 다시 쓰지 않는다
  let exitId: string;
  let out: FlowEdge;
  if (n.kind === "RULE") {
    const ins = inOf(g, nodeId);
    const outs = outOf(g, nodeId);
    if (ins.length !== 1 || outs.length !== 1) return fail(RULE_EDGES_NOT_ONE_MOVE);
    ins[0].to = outs[0].to;
    exitId = nodeId;
    out = outs[0];
  } else {
    const cannot = `분기 ${nodeId}의 짝 합류를 찾지 못해 옮길 수 없다`;
    const m = mergeOf(g, nodeId);
    if (!m || !blockNodes(g, nodeId, m.id)) return fail(cannot);
    const ins = inOf(g, nodeId);
    const exits = outOf(g, m.id);
    if (ins.length !== 1 || exits.length !== 1) return fail(cannot);
    ins[0].to = exits[0].to;
    exitId = m.id;
    out = exits[0];
  }
  g.edges = g.edges.filter((e) => e !== out); // 들어오는 선을 고친 뒤에 나가는 선만 지운다
  const ti = g.edges.findIndex((e) => e.id === edgeId);
  const t = g.edges[ti];
  insertAfter(g.edges, ti, edge(fresh(taken, "e"), exitId, t.to));
  t.to = nodeId;
  return done(g);
}

/** 룰 노드의 ruleId 만 바꾼다(id·선·라벨·배치 그대로). 같은 세트에 같은 룰이 있어도 막지 않는다. */
export function replaceRule(f: EditFlow, nodeId: string, ruleId: string): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(notFound(nodeId));
  if (n.kind !== "RULE") return fail("룰 노드만 룰을 바꾼다");
  if (ruleId.trim() === "") return fail("룰 ID 가 비었다");
  n.ruleId = ruleId;
  return done(g);
}

/** 룰 노드 하나 또는 분기 블록(합류까지)의 깊은 복사. 문자열이면 거부 사유다. */
export function copyFragment(f: EditFlow, nodeId: string): Fragment | string {
  const n = findNode(f, nodeId);
  if (!n) return notFound(nodeId);
  if (n.kind === "RULE") return { nodes: [copyNode(n)], edges: [], entry: nodeId, exit: nodeId };
  if (!isSplitKind(n.kind)) return NO_COPY;
  const members = blockMembers(f, nodeId);
  if (!members) return `분기 ${nodeId}의 블록을 찾지 못해 복사할 수 없다`;
  const inside = new Set(members);
  return {
    nodes: f.nodes.filter((x) => inside.has(x.id)).map(copyNode),
    edges: f.edges.filter((e) => inside.has(e.from) && inside.has(e.to)).map(copyEdge),
    entry: nodeId,
    exit: mergeOf(f, nodeId)!.id,
  };
}

/** copyFragment 가 만든 모양인가 — ID 가 겹치지 않고, entry·exit·선 끝·합류의 splitId 가 조각 안이고, START·END 가 없다. */
function wellFormed(frag: Fragment): boolean {
  const ids = new Set(frag.nodes.map((n) => n.id));
  return (
    ids.size === frag.nodes.length &&
    ids.has(frag.entry) &&
    ids.has(frag.exit) &&
    frag.nodes.every((n) => NODE_PREFIX[n.kind] !== undefined && (n.kind !== "MERGE" || ids.has(n.splitId ?? ""))) &&
    frag.edges.every((e) => ids.has(e.from) && ids.has(e.to))
  );
}

/**
 * 조각을 선 t(X→Y) 에 새 ID 로 붙여 넣는다. t.to = 새 entry, 새 선 {새 exit → Y}. 노드는 X 뒤(없으면 끝), 조각 선·출구 선은 t 바로 뒤.
 * 라벨·조건식·order·otherwise 는 복사하고, 합류의 splitId 는 새 분기 ID 로 바꾼다. 배치는 넣지 않는다(P-D18).
 */
export function pasteFragment(f: EditFlow, edgeId: string, frag: Fragment): EditResult {
  if (f.nodes.length + frag.nodes.length > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
  const g = clone(f);
  const ti = g.edges.findIndex((e) => e.id === edgeId);
  if (ti < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (!wellFormed(frag)) return fail(BAD_FRAGMENT);
  const t = g.edges[ti];
  const taken = takenIds(g);
  const idOf = new Map<string, string>();
  for (const n of frag.nodes) idOf.set(n.id, fresh(taken, NODE_PREFIX[n.kind]!));
  const nid = (id: string) => idOf.get(id)!;
  const nodes = frag.nodes.map((n) => node(nid(n.id), n.kind, str(n.ruleId), n.kind === "MERGE" ? nid(n.splitId!) : str(n.splitId), str(n.label)));
  const edges = frag.edges.map((e) =>
    edge(fresh(taken, "e"), nid(e.from), nid(e.to), { order: int(e.order), cond: str(e.cond), otherwise: e.otherwise === true, label: str(e.label) }),
  );
  const exit = edge(fresh(taken, "e"), nid(frag.exit), t.to);
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === t.from),
    ...nodes,
  );
  t.to = nid(frag.entry);
  insertAfter(g.edges, ti, ...edges, exit);
  return done(g);
}

/** 원본 바로 뒤에 복제한다 — 룰은 자기에서 나가는 선, 분기는 짝 합류에서 나가는 선에 붙여 넣는다. */
export function duplicateNode(f: EditFlow, nodeId: string): EditResult {
  const frag = copyFragment(f, nodeId);
  if (typeof frag === "string") return fail(frag);
  const outs = outOf(f, frag.exit);
  if (outs.length !== 1) {
    return fail(frag.entry === frag.exit ? "룰 노드의 선이 하나씩이 아니라 복제할 수 없다" : `분기 ${nodeId}의 짝 합류를 찾지 못해 복제할 수 없다`);
  }
  return pasteFragment(f, outs[0].id, frag);
}

/**
 * IF ↔ 병렬. 노드 ID·선 배열 순서는 그대로다.
 * - 병렬로: 갈래를 실행 순서대로 order 1..n, 조건식·그 외 없앰.
 * - IF 로: 갈래를 order 순으로 두고 마지막을 "그 외"(order·조건식 null), 나머지는 order 1..n-1(조건식은 비어 FLOW_IF_ELSE 로 드러난다).
 * - 라벨은 기본 라벨(분기 `조건`·`병렬`, 갈래 `갈래 N`·`그 외`)이거나 비었을 때만 새 규칙으로 다시 붙인다.
 */
export function changeSplitKind(f: EditFlow, splitId: string, kind: "IF" | "PARALLEL"): EditResult {
  const g = clone(f);
  const s = findNode(g, splitId);
  if (!s) return fail(notFound(splitId));
  if (!isSplitKind(s.kind)) return fail("분기 노드만 바꾼다");
  if (s.kind === kind) return fail(`이미 ${KIND_NAME[kind]} 분기다`);
  if (!mergeOf(g, splitId)) return fail(`분기 ${splitId}의 짝 합류를 찾지 못했다`);
  const branches = branchesInOrder(outOf(g, splitId));
  branches.forEach((e, i) => {
    const last = i === branches.length - 1;
    if (kind === "PARALLEL") {
      e.order = i + 1;
      e.cond = null;
      e.otherwise = false;
    } else {
      e.order = last ? null : i + 1;
      if (last) e.cond = null;
      e.otherwise = last;
    }
    if (e.label == null || AUTO_BRANCH_LABEL.test(e.label) || e.label === OTHERWISE_LABEL) {
      e.label = e.otherwise ? OTHERWISE_LABEL : IF_BRANCH_LABEL(e.order as number);
    }
  });
  if (s.label == null || s.label === SPLIT_LABEL.IF || s.label === SPLIT_LABEL.PARALLEL) s.label = SPLIT_LABEL[kind];
  s.kind = kind;
  return done(g);
}

/**
 * 분기를 풀어 고른 갈래만 남긴다. 빈 갈래를 고르면 분기 앞뒤를 바로 잇는다. 선을 먼저 고친 뒤 분기·합류·다른 갈래 안 노드를
 * dropNodes 로 지운다(닿는 선·배치·그룹 흔적 함께). 분기로 들어오던 선의 order·cond·otherwise·label 은 그대로다.
 */
export function dissolveSplit(f: EditFlow, splitId: string, keepEdgeId: string): EditResult {
  const g = clone(f);
  const s = findNode(g, splitId);
  if (!s) return fail(notFound(splitId));
  if (!isSplitKind(s.kind)) return fail("분기 노드만 푼다");
  const keep = findEdge(g, keepEdgeId);
  if (!keep || keep.from !== splitId) return fail(`분기 ${splitId}의 갈래가 아니다`);
  const cannot = `분기 ${splitId}의 짝 합류를 찾지 못해 풀 수 없다`;
  const m = mergeOf(g, splitId);
  const inner = m ? blockNodes(g, splitId, m.id) : null;
  if (!m || !inner) return fail(cannot);
  const ins = inOf(g, splitId);
  const exits = outOf(g, m.id);
  if (ins.length !== 1 || exits.length !== 1) return fail(cannot);
  const drop = new Set([splitId, m.id, ...inner]);
  if (keep.to === m.id) {
    ins[0].to = exits[0].to;
  } else {
    const kept = branchNodes(g, splitId, keep.id, m.id);
    if (!kept) return fail(cannot);
    ins[0].to = keep.to;
    for (const e of g.edges) if (e.to === m.id && kept.has(e.from)) e.to = exits[0].to;
    for (const id of kept) drop.delete(id);
  }
  return done(dropNodes(g, drop));
}

/** "그 외" 아닌 갈래 선들의 order 를 ids 순서대로 1..n 으로 매긴다. 라벨·선 배열 순서·"그 외" 는 그대로. */
export function reorderBranches(f: EditFlow, splitId: string, edgeIds: readonly string[]): EditResult {
  const g = clone(f);
  const s = findNode(g, splitId);
  if (!s) return fail(notFound(splitId));
  if (!isSplitKind(s.kind)) return fail(`노드 ${splitId}는 분기가 아니다`);
  const branches = outOf(g, splitId).filter((e) => !e.otherwise);
  const want = new Set(edgeIds);
  if (want.size !== edgeIds.length || want.size !== branches.length || !branches.every((e) => want.has(e.id))) {
    return fail("갈래 목록이 맞지 않는다");
  }
  edgeIds.forEach((id, i) => {
    findEdge(g, id)!.order = i + 1;
  });
  return done(g);
}
