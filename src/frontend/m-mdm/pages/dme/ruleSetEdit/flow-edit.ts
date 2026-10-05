/**
 * 룰 세트 흐름 편집 연산(2단계 계획 P7) — 캔버스가 부르는 순수 함수. React 의존이 없다.
 *
 * 모든 연산은 입력을 바꾸지 않는다. 먼저 노드·선·view 를 칸을 채운 새 객체로 복사한 뒤 복사본만 고친다.
 * 돌려주는 노드는 `{id, kind, ruleId, splitId, label}`, 선은 `{id, from, to, order, cond, otherwise, label}` 칸을
 * 모두 가진다(없는 값은 null, otherwise 는 boolean). 1단계 `parseFlow` 는 입력을 정규화하지 않으므로 이 모양이 곧 계약이다.
 * `flowJsonOf` 는 서버 `RuleSetFlowJson.canonical`(P2)과 같은 키 순서로 써서 dirty 비교가 문자열 비교로 맞게 한다.
 * 3단계(계획 P6)는 옮기기·룰 바꾸기·복사·붙여넣기·복제·분기 종류 바꾸기·분기 풀기·갈래 순서를 더한다(파일 끝).
 * 4단계(계획 Task 9): 빈 단계(TASK) 끼우기·룰 지정, 빈 단계는 지우기·옮기기·복사에서 룰과 같다.
 * 외관(S1): `view.styles` 의 노드 외관은 `stylesFor` 로 toEditFlow·clone·done·dropNodes 에서 정리하고, `setNodeStyle` 이 바꾼다(파일 끝).
 * 설명: `view.descs` 의 노드 설명도 같은 자리에서 `descsFor` 로 정리하고, `updateNodeDesc` 가 바꾼다(`node-desc.ts`).
 * 받는 노드(받는 노드 spec §8): CATCH 노드만 attachTo·catches 를 label 뒤에 갖는다. 만들기 addCatch·종류 setCatchKinds(파일 끝), 룰을 지우면 붙은 받는 노드도
 * 지운다. 위치는 저장하지 않는다(setPositions). 받는 노드는 옮기기·복사·그룹 대상이 아니고, 처리 갈래가 돌아오는 룰은 옮기지 않는다.
 * 받는 노드를 룰 테두리의 다른 자리로 옮기면 `view.catchSpots` 에 변·거리를 적는다(`setCatchSpot`, D-142). 없으면 아래 변 기본 자리(R15)다.
 * 합류 없애기(implicit-join spec §8, D-136): IF 와 처리 갈래는 합류 없이 모이는 자리·돌아오는 자리로 바로 간다. MERGE 는 병렬 합류에만 쓴다.
 * `toEditFlow` 는 옛 형식(IF 합류·돌아오는 합류)을 `upgradeLegacyMerges` 로 바꿔 연다. IF 블록의 출구는 선 하나가 아니라 꼬리 선 목록(`tailsOf`)이고,
 * 끝내는 갈래 몸(END 로 가는 갈래)도 블록에 든다. 연산 결과에 짝 합류 없는 IF 의 같은 from→to 선이 둘 생기면 거부한다(`IF_EMPTY_TWICE`, B2).
 */
import type { CatchKind, FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "@/contract/engine-contract.generated";

import { CATCHABLE, CATCH_KINDS, catchKindsFor, catchesOf, endingBranches, handlerTarget, joinOf, linearFlow, returnOf } from "./flow-model";
import { descsFor, normalizeDesc, trimDesc } from "./node-desc";
import { mergeNodeStyle, normalizeNodeStyle, paintedColor, stylesFor, type NodeColor, type NodeStyle, type NodeStylePatch } from "./node-style";

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
/** 그룹 틀에 더한 여백(흐름 좌표, G2) — 소속 노드 경계 + 기본 여백에 네 변마다 더한다. 0 이상 MAX_GROUP_PAD 이하 정수. */
export interface GroupPad {
  l: number;
  t: number;
  r: number;
  b: number;
}
export interface FlowGroup {
  id: string;
  title: string;
  nodeIds: string[];
  /** 더한 여백(G2). 없으면 기본 크기. 네 값이 모두 0 이면 두지 않는다(저장 글자·dirty 비교가 예전 그룹과 같다). */
  pad?: GroupPad;
  /** 그룹 색(노드 색과 같은 6색, 우클릭 「색상」). 기본이면 두지 않는다(pad 와 같은 원칙 — 색 없는 그룹의 저장 글자가 예전과 같다). */
  color?: NodeColor;
}
export interface FlowView {
  positions: Record<string, FlowPos>;
  notes: FlowNote[];
  groups: FlowGroup[];
  /** 선 ID → 꺾는 점 목록(흐름 좌표, C14). 점이 없는 선은 키가 없다. */
  routes: Record<string, FlowPos[]>;
  /** 선 ID → 조건 라벨·변수 칩 묶음의 기본 자리에서의 오프셋(흐름 좌표, L1). 옮기지 않은 선은 키가 없다. */
  labels: Record<string, EdgeLabelOffsets>;
  /** 노드 ID → 외관(S1, 룰·빈 단계만). 비면 키를 두지 않는다(저장 글자·dirty 비교가 예전 세트와 같다, S-D1). */
  styles?: Record<string, NodeStyle>;
  /** 노드 ID → 설명(RULE·TASK·IF·PARALLEL·START·END, 최대 1000자). 비면 키를 두지 않는다(저장 글자·dirty 비교가 예전 세트와 같다). */
  descs?: Record<string, string>;
  /** 받는 노드 ID → 룰 테두리 위 자리(D-142). 옮기지 않은 받는 노드는 키가 없고 아래 변 기본 자리(R15)에 그린다. 비면 키를 두지 않는다. */
  catchSpots?: Record<string, CatchSpot>;
}
/** 받는 노드가 걸칠 룰 테두리 변. */
export type CatchSide = "top" | "right" | "bottom" | "left";
export const CATCH_SIDES: readonly CatchSide[] = ["top", "right", "bottom", "left"];
/**
 * 받는 노드 자리(D-142) — 걸친 변과, 그 변의 시작(위·아래 변은 왼쪽 끝, 왼·오른 변은 위쪽 끝)에서 원 가운데까지의 거리(흐름 좌표, 정수).
 * 그릴 때 변 길이에 맞춰 자르므로(`catchSpot`) 룰 크기가 줄어도 원이 모서리 밖으로 나가지 않는다.
 */
export interface CatchSpot {
  side: CatchSide;
  at: number;
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
/** 그룹 여백 한계(흐름 좌표, G2) — 넘으면 자른다. */
export const MAX_GROUP_PAD = 2000;
const LABEL_PARTS: readonly LabelPart[] = ["label", "chips"];

/** 새 메모 크기(계약 밖 기본값). */
const NOTE_W = 160;
const NOTE_H = 80;

const IF_BRANCH_LABEL = (order: number) => `갈래 ${order}`;
const OTHERWISE_LABEL = "그 외";
const SPLIT_LABEL: Record<"IF" | "PARALLEL", string> = { IF: "조건", PARALLEL: "병렬" };
const SPLIT_PREFIX: Record<"IF" | "PARALLEL", string> = { IF: "if", PARALLEL: "par" };
/** 룰 노드를 떼어 낼 수 없을 때(지우기·옮기기 같은 문구). */
const RULE_EDGES_NOT_ONE = "룰 노드의 나가는 선이 하나가 아니라 지울 수 없다. 선을 먼저 정리한다";
/** 짝 합류 없는 IF 의 같은 도착 갈래 선 둘(B2, R10). */
export const IF_EMPTY_TWICE = (s: string) => `IF ${s}에 같은 노드로 가는 갈래가 이미 있다. 빈 갈래는 하나만 둔다`;
const NO_JOIN_BRANCH = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못했다`;
const NO_JOIN_REMOVE = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못해 지울 수 없다`;
const NO_JOIN_MOVE = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못해 옮길 수 없다`;
const NO_JOIN_DISSOLVE = (s: string) => `분기 ${s}의 갈래가 모이는 자리를 찾지 못해 풀 수 없다`;
export const KEEP_ENDING = "끝내는 갈래만 남기면 뒤 흐름에 닿을 수 없다";
export const ENDING_TO_PARALLEL = "끝내는 갈래가 있는 IF 는 병렬로 바꿀 수 없다. 병렬 갈래는 모두 합류로 모여야 한다";
export const MERGE_ONLY_BY_SPLIT = "합류 노드는 분기를 지워서 없앤다";
/** 옛 돌아오는 합류(받는 노드 없음)를 걷어 낼 수 없을 때(수정 1회차). */
export const MERGE_EXIT_NOT_ONE = "합류의 나가는 선이 하나가 아니라 지울 수 없다. 선을 먼저 정리한다";
/** 열 때 옛 합류를 바꿨다는 알림(R14). */
export const UPGRADE_NOTICE = (n: number) => `옛 합류 노드 ${n}개를 없앤 형식으로 바꿔 열었다. 저장하면 새 형식으로 남는다.`;
const NO_IDS: ReadonlySet<string> = new Set<string>();

// ───────────────────────── 모양 도우미 ─────────────────────────

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const int = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isSplitKind = (k: FlowNodeKind): k is "IF" | "PARALLEL" => k === "IF" || k === "PARALLEL";
/** 룰처럼 선 하나 들어오고 하나 나가는 단계(4단계 T1 — 빈 단계 포함). */
const isStep = (k: FlowNodeKind): boolean => k === "RULE" || k === "TASK";

/** 모든 칸을 채운 노드. */
function node(id: string, kind: FlowNodeKind, ruleId: string | null = null, splitId: string | null = null, label: string | null = null): FlowNode {
  return { id, kind, ruleId, splitId, label };
}

/** 모든 칸을 채운 선. */
function edge(id: string, from: string, to: string, extra: Partial<Pick<FlowEdge, "order" | "cond" | "otherwise" | "label">> = {}): FlowEdge {
  return { id, from, to, order: extra.order ?? null, cond: extra.cond ?? null, otherwise: extra.otherwise === true, label: extra.label ?? null };
}

/**
 * 모든 칸을 채운 노드 복사. 받는 노드(CATCH)만 attachTo·catches 를 label 뒤에 둔다(서버 정규 JSON 과 같은 키 순서, Ruling R11).
 * 세트 노드(SET)는 setId 를 label 뒤에 남긴다(하위 세트 spec §1 — setId 는 SET 만 쓴다). 디버거 경고·들어가기(ui:9)가 편집 흐름의 setId 를 읽는다.
 */
const copyNode = (n: FlowNode): FlowNode => {
  const base = node(n.id, n.kind, str(n.ruleId), str(n.splitId), str(n.label));
  if (n.kind === "SET") return { ...base, setId: str(n.setId) };
  if (n.kind !== "CATCH") return base;
  return { ...base, attachTo: str(n.attachTo), catches: Array.isArray(n.catches) ? n.catches.filter((k): k is string => typeof k === "string") : null };
};
const copyEdge = (e: FlowEdge): FlowEdge =>
  edge(e.id, e.from, e.to, { order: int(e.order), cond: str(e.cond), otherwise: e.otherwise === true, label: str(e.label) });
const copyPos = (p: FlowPos): FlowPos => ({ x: p.x, y: p.y });
const copyNote = (n: FlowNote): FlowNote => ({ id: n.id, text: n.text, x: n.x, y: n.y, w: n.w, h: n.h, attach: n.attach ?? null });
const clampPad = (n: number) => Math.max(0, Math.min(MAX_GROUP_PAD, Math.round(n)));
/** 네 변 값을 0~2000 정수로 자른 여백. 객체가 아니면 null, 유한하지 않은 칸은 0, 모두 0 이면 null(= 기본 크기). */
export function normalizePad(p: unknown): GroupPad | null {
  if (!isObj(p)) return null;
  const v = (x: unknown) => (finite(x) ? clampPad(x) : 0);
  const pad = { l: v(p.l), t: v(p.t), r: v(p.r), b: v(p.b) };
  return pad.l || pad.t || pad.r || pad.b ? pad : null;
}
/** 그룹 복사(정규화는 이 한 곳) — 키 순서 id·title·nodeIds·pad·color, pad·color 는 있을 때만 둔다. 모르는 색·기본 색은 버린다. */
const copyGroup = (g: FlowGroup): FlowGroup => {
  const out: FlowGroup = { id: g.id, title: g.title, nodeIds: [...g.nodeIds] };
  const pad = normalizePad(g.pad);
  if (pad) out.pad = pad;
  const color = paintedColor(g.color);
  if (color) out.color = color;
  return out;
};

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

/** 받는 노드 자리 하나 — 모양이 맞으면 거리를 정수로 반올림한 사본, 아니면 null. */
function copyCatchSpot(v: unknown): CatchSpot | null {
  if (!isObj(v) || !CATCH_SIDES.includes(v.side as CatchSide) || !finite(v.at)) return null;
  return { side: v.side as CatchSide, at: Math.max(0, Math.round(v.at)) };
}
/** 흐름에 있는 받는 노드의 자리만, 노드 배열 순서로 복사한다(모양이 틀린 항목·없는 노드·받는 노드가 아닌 노드는 버린다). */
function catchSpotsFor(nodes: readonly FlowNode[], spots: Readonly<Record<string, unknown>> | undefined): Record<string, CatchSpot> {
  const out: Record<string, CatchSpot> = {};
  if (!spots) return out;
  for (const n of nodes) {
    if (n.kind !== "CATCH") continue;
    const c = copyCatchSpot(spots[n.id]);
    if (c) out[n.id] = c;
  }
  return out;
}

/**
 * view 에 외관·설명·받는 노드 자리를 싣는다 — 비면 styles·descs·catchSpots 키를 두지 않는다(계획 Ruling 1). 나머지 칸은 그대로(복사하지 않는다).
 * 키 순서는 …labels, styles, descs, catchSpots. catchSpots 를 주지 않으면 v 의 것을 그대로 싣는다(정리는 done·clone 이 한다).
 */
function withStyles(v: FlowView, styles: Record<string, NodeStyle>, descs: Record<string, string> = {}, catchSpots: Record<string, CatchSpot> | undefined = v.catchSpots): FlowView {
  const out: FlowView = { positions: v.positions, notes: v.notes, groups: v.groups, routes: v.routes, labels: v.labels };
  if (Object.keys(styles).length > 0) out.styles = styles;
  if (Object.keys(descs).length > 0) out.descs = descs;
  if (catchSpots && Object.keys(catchSpots).length > 0) out.catchSpots = catchSpots;
  return out;
}

function copyView(v: FlowView | undefined, nodes: readonly FlowNode[], edges: readonly FlowEdge[]): FlowView {
  const positions: Record<string, FlowPos> = {};
  for (const [k, p] of Object.entries(v?.positions ?? {})) positions[k] = copyPos(p);
  const view: FlowView = {
    positions, notes: (v?.notes ?? []).map(copyNote), groups: (v?.groups ?? []).map(copyGroup), routes: routesFor(edges, v?.routes),
    labels: labelsFor(edges, v?.labels),
  };
  return withStyles(view, stylesFor(nodes, v?.styles), descsFor(nodes, v?.descs), catchSpotsFor(nodes, v?.catchSpots));
}

/** 고쳐도 되는 깊은 복사본(칸을 모두 채운다). 흐름에 없는 선의 경로·이름표 오프셋, 흐름에 없는 노드·룰/빈 단계가 아닌 노드의 외관은 버린다. */
function clone(f: EditFlow): EditFlow {
  const nodes = (f.nodes ?? []).map(copyNode);
  const edges = (f.edges ?? []).map(copyEdge);
  return { version: 1, nodes, edges, view: copyView(f.view, nodes, edges) };
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
      view.groups.push(copyGroup({ id: g.id, title: g.title, nodeIds: g.nodeIds as string[], pad: g.pad as GroupPad | undefined, color: g.color as NodeColor | undefined }));
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
  if (isObj(raw.styles)) {
    const styles: Record<string, NodeStyle> = {};
    for (const [k, s] of Object.entries(raw.styles)) {
      const n = normalizeNodeStyle(s);
      if (n) styles[k] = n;
    }
    if (Object.keys(styles).length > 0) view.styles = styles;
  }
  if (isObj(raw.descs)) {
    const descs: Record<string, string> = {};
    for (const [k, d] of Object.entries(raw.descs)) {
      const t = trimDesc(d); // 읽을 때 앞뒤 공백을 지운다(편집 중에는 지우지 않는다)
      if (t !== null) descs[k] = t;
    }
    if (Object.keys(descs).length > 0) view.descs = descs;
  }
  if (isObj(raw.catchSpots)) {
    const spots: Record<string, CatchSpot> = {};
    for (const [k, c] of Object.entries(raw.catchSpots)) {
      const v = copyCatchSpot(c);
      if (v) spots[k] = v;
    }
    if (Object.keys(spots).length > 0) view.catchSpots = spots;
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
/** 결과를 돌려주기 전에 사라진 선의 경로·이름표 오프셋, 사라진 노드의 외관을 버린다(연산이 노드·선을 지우거나 바꿨을 수 있다). */
const done = (flow: EditFlow): EditResult => {
  if (!flow.view) return { ok: true, flow };
  const routes = routesFor(flow.edges, flow.view.routes);
  const labels = labelsFor(flow.edges, flow.view.labels);
  const view = withStyles({ ...flow.view, routes, labels }, stylesFor(flow.nodes, flow.view.styles), descsFor(flow.nodes, flow.view.descs), catchSpotsFor(flow.nodes, flow.view.catchSpots));
  return { ok: true, flow: { ...flow, view } };
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
 * from 들에서 나가는 선을 따라 stop(모이는 자리·짝 합류) 직전까지 닿는 노드 ID. 모은 집합이 닫힌 블록이 아니면 null.
 * - 나가는 쪽: START·END·없는 노드·분기 자신에 닿으면 null(뒤 선으로 앞쪽이나 분기로 돌아가는 순환 포함).
 * - 들어오는 쪽: 모은 노드마다 들어오는 선이 입구 선(entry)이거나 모은 집합 안에서 와야 한다. 블록 밖에서 들어오는 선이
 *   있으면 null — 그 노드를 지우면 블록 밖 흐름까지 끊기기 때문이다.
 * - 받는 노드: 모은 룰에 붙은 받는 노드와 그 처리 갈래도 모은다. 처리 갈래가 END 에 닿으면 그 경로만 멈춘다(블록은 닫힌 것으로 본다).
 *   받는 노드는 들어오는 선이 없어 들어오는 쪽 검사를 그대로 지난다.
 * - ending: 끝내는 IF 갈래의 첫 노드 — 처리 갈래처럼 END 에 닿으면 그 경로만 멈춘다(implicit-join spec §8.1).
 */
function reach(
  f: EditFlow, from: readonly string[], stop: string, splitId: string, entry: (e: FlowEdge) => boolean, ending: ReadonlySet<string> = NO_IDS,
): Set<string> | null {
  const seen = new Set<string>();
  /** handler = 받는 노드에서 시작한 처리 갈래·끝내는 IF 갈래 경로 — END 에 닿으면 그 경로만 멈춘다. */
  const queue: { id: string; handler: boolean }[] = from.map((id) => ({ id, handler: ending.has(id) }));
  while (queue.length > 0) {
    const { id, handler } = queue.shift()!;
    if (id === stop || seen.has(id)) continue;
    if (id === splitId) return null;
    const n = findNode(f, id);
    if (!n || n.kind === "START") return null;
    if (n.kind === "END") {
      if (handler) continue;
      return null;
    }
    seen.add(id);
    for (const e of outOf(f, id)) queue.push({ id: e.to, handler: handler || n.kind === "CATCH" });
    if (CATCHABLE.has(n.kind)) for (const c of catchesOf(f, id)) queue.push({ id: c.id, handler: true });
  }
  for (const id of seen) {
    if (!inOf(f, id).every((e) => entry(e) || seen.has(e.from))) return null;
  }
  return seen;
}

/**
 * 룰에 붙은 받는 노드와 그 처리 갈래 노드 — 받는 노드에서 나가는 선을 따라 stop(돌아오는 자리 `returnOf`) 직전까지. START·END 에서 멈추고,
 * 처리 갈래 안 룰에 붙은 받는 노드도 따라간다.
 */
function handlerNodes(f: EditFlow, ruleNodeId: string, stop: string | null): Set<string> {
  const seen = new Set<string>();
  const queue = catchesOf(f, ruleNodeId).map((c) => c.id);
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === stop || id === ruleNodeId || seen.has(id)) continue;
    const n = findNode(f, id);
    if (!n || n.kind === "START" || n.kind === "END") continue;
    seen.add(id);
    for (const e of outOf(f, id)) queue.push(e.to);
    if (CATCHABLE.has(n.kind)) for (const c of catchesOf(f, id)) queue.push(c.id);
  }
  return seen;
}

const endIdOf = (f: EditFlow): string | null => f.nodes.find((n) => n.kind === "END")?.id ?? null;

/**
 * 분기 안 노드 집합(모이는 자리·짝 합류 제외) — 분기의 나가는 선들에서 joinId 직전까지. 새 형식 IF 의 끝내는 갈래는 END 에서 그 경로만 멈춘다.
 * 병렬·옛 IF 는 합류로 들어오는 선도 분기·안쪽에서만 와야 한다. 새 IF 의 모이는 자리는 블록 밖에서도 선을 받는다(implicit-join spec §8.1).
 */
function blockNodes(f: EditFlow, splitId: string, joinId: string): Set<string> | null {
  const s = findNode(f, splitId);
  if (!s) return null;
  const fromSplit = (e: FlowEdge) => e.from === splitId;
  const outs = outOf(f, splitId);
  const endingIds = new Set(s.kind === "IF" ? (endingBranches(f, splitId) ?? []) : []);
  const endingStarts = new Set(outs.filter((e) => endingIds.has(e.id)).map((e) => e.to));
  const inner = reach(f, outs.map((e) => e.to), joinId, splitId, fromSplit, endingStarts);
  if (!inner) return null;
  const merged = s.kind === "PARALLEL" || mergeOf(f, splitId) !== null;
  return !merged || inOf(f, joinId).every((e) => fromSplit(e) || inner.has(e.from)) ? inner : null;
}

/** 갈래 선 하나의 안쪽 노드 집합(e.to 에서 모이는 자리 전까지, 끝내는 갈래는 END 전까지). 안쪽 노드로는 그 갈래 선과 안쪽 선만 들어와야 한다. */
function branchNodes(f: EditFlow, splitId: string, edgeId: string): Set<string> | null {
  const e = findEdge(f, edgeId);
  const join = joinOf(f, splitId);
  if (!e || join == null) return null;
  const ending = (endingBranches(f, splitId) ?? []).includes(edgeId);
  return reach(f, [e.to], join, splitId, (x) => x.id === edgeId, ending ? new Set([e.to]) : NO_IDS);
}

/** id 가 어떤 받는 노드 블록의 돌아오는 자리인가. */
const isReturnPlace = (f: EditFlow, id: string): boolean =>
  f.nodes.some((n) => CATCHABLE.has(n.kind) && catchesOf(f, n.id).length > 0 && returnOf(f, n.id) === id);

/** 선들의 도착을 to 로 바꾼다(선 ID·칸·이름표 그대로). */
const retarget = (edges: readonly FlowEdge[], to: string) => {
  for (const e of edges) e.to = to;
};

/** 짝 MERGE 없는 IF 의 같은 from→to 선이 둘 이상이면 그 IF ID(B2, R10). */
function emptyTwice(f: EditFlow): string | null {
  for (const s of f.nodes) {
    if (s.kind !== "IF" || f.nodes.some((m) => m.kind === "MERGE" && m.splitId === s.id)) continue;
    const seen = new Set<string>();
    for (const e of outOf(f, s.id)) {
      if (seen.has(e.to)) return s.id;
      seen.add(e.to);
    }
  }
  return null;
}

/** 결과 흐름을 B2 로 확인한 뒤 done. */
const checked = (g: EditFlow): EditResult => {
  const s = emptyTwice(g);
  return s ? fail(IF_EMPTY_TWICE(s)) : done(g);
};

/** 꺾는 점을 지운다(끝점이 바뀐 선). */
function dropRoutes(g: EditFlow, edges: readonly FlowEdge[]): void {
  const routes = { ...g.view.routes };
  for (const e of edges) delete routes[e.id];
  g.view.routes = routes;
}

/** 합류 m 으로 들어오는 선을 모두 m 의 출구 도착으로 옮기고(선 ID·칸·이름표 유지, 꺾는 점 지움) m 과 출구 선을 지운다(§8.1). 출구가 하나가 아니면 null. g 는 복사본이다. */
function dissolveMerge(g: EditFlow, mId: string): EditFlow | null {
  const exits = outOf(g, mId);
  if (exits.length !== 1 || exits[0].to === mId) return null;
  const ins = inOf(g, mId);
  retarget(ins, exits[0].to);
  dropRoutes(g, ins);
  return dropNodes(g, new Set([mId]));
}

/** 합류 m 을 같은 ID 의 빈 단계로 바꾼다(splitId null, 제목 TASK_LABEL, 위치 지움 — END 앞 합류, J-D10). 선은 그대로다. g 는 복사본이다. */
function mergeToTask(g: EditFlow, mId: string): void {
  const m = findNode(g, mId)!;
  m.kind = "TASK";
  m.splitId = null;
  m.label = TASK_LABEL;
  const positions = { ...g.view.positions };
  delete positions[mId];
  g.view.positions = positions;
}

/** 짝 합류 없는 IF s 의 같은 도착 갈래 선이 둘 이상이면 실행 순서 마지막 선만 남기고 나머지마다 빈 단계를 끼운다(B2, R8). g 는 복사본이다. 끼운 수. */
function fillEmptyBranches(g: EditFlow, s: string, taken: Set<string>): number {
  const byTo = new Map<string, FlowEdge[]>();
  for (const e of outOf(g, s)) byTo.set(e.to, [...(byTo.get(e.to) ?? []), e]);
  let added = 0;
  for (const group of byTo.values()) {
    if (group.length < 2) continue;
    const ordered = branchesInOrder(group);
    const keep = ordered[ordered.length - 1];
    for (const e of group) {
      if (e === keep) continue;
      const t = node(fresh(taken, "r"), "TASK", null, null, TASK_LABEL);
      insertAfter(g.nodes, g.nodes.findIndex((n) => n.id === s) + added, t);
      const to = e.to;
      e.to = t.id;
      dropRoutes(g, [e]);
      insertAfter(g.edges, g.edges.indexOf(e), edge(fresh(taken, "e"), t.id, to));
      added++;
    }
  }
  return added;
}

/** 노드들을 지우고, 닿는 선을 모두 지우고, view 흔적(배치·그룹·메모 붙임·외관)을 치운다. f 는 복사본이다. */
function dropNodes(f: EditFlow, ids: ReadonlySet<string>): EditFlow {
  const nodes = f.nodes.filter((n) => !ids.has(n.id));
  const edges = f.edges.filter((e) => !ids.has(e.from) && !ids.has(e.to));
  const positions: Record<string, FlowPos> = {};
  for (const [k, p] of Object.entries(f.view.positions)) if (!ids.has(k)) positions[k] = p;
  const groups = f.view.groups
    .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((x) => !ids.has(x)) }))
    .filter((g) => g.nodeIds.length > 0);
  const notes = f.view.notes.map((n) => (n.attach != null && ids.has(n.attach) ? { ...n, attach: null } : n));
  return {
    version: f.version, nodes, edges,
    view: withStyles(
      { positions, notes, groups, routes: f.view.routes, labels: f.view.labels }, stylesFor(nodes, f.view.styles), descsFor(nodes, f.view.descs),
      catchSpotsFor(nodes, f.view.catchSpots),
    ),
  };
}

function insertAfter<T>(list: T[], index: number, ...items: T[]): void {
  list.splice(index < 0 ? list.length : index + 1, 0, ...items);
}

// ───────────────────────── 공개 연산 ─────────────────────────

/**
 * 옛 형식 합류 없애기(implicit-join spec §12.2) — 순수 함수이고 같은 입력이면 같은 결과다.
 * 대상 = splitId 가 IF 인 MERGE, splitId 가 받는 노드가 붙은 RULE·TASK 인 MERGE. 1) END 로 바로 나가는 대상은 빈 단계로 바꾼다(ID 그대로, 위치 지움, J-D10).
 * 2) 나머지 대상은 노드 배열 순서로 dissolveMerge(나가는 선이 하나가 아니면 둔다). 3) 짝 합류 없는 IF 의 같은 도착 갈래는 빈 단계를 채운다(B2).
 * upgraded = 1) 의 수 + 2) 에서 지운 수.
 */
export function upgradeLegacyMerges(f: EditFlow): { flow: EditFlow; upgraded: number } {
  let g = clone(f);
  const isTarget = (m: FlowNode): boolean => {
    if (m.kind !== "MERGE" || m.splitId == null) return false;
    const s = findNode(g, m.splitId);
    return !!s && (s.kind === "IF" || (CATCHABLE.has(s.kind) && catchesOf(g, s.id).length > 0));
  };
  const targets = g.nodes.filter(isTarget).map((n) => n.id);
  const endId = endIdOf(g);
  let upgraded = 0;
  const rest: string[] = [];
  for (const id of targets) {
    const outs = outOf(g, id);
    if (endId !== null && outs.length === 1 && outs[0].to === endId) {
      mergeToTask(g, id);
      upgraded++;
    } else rest.push(id);
  }
  for (const id of rest) {
    const next = dissolveMerge(g, id);
    if (next) {
      g = next;
      upgraded++;
    }
  }
  const taken = takenIds(g);
  for (const s of g.nodes.filter((n) => n.kind === "IF" && mergeOf(g, n.id) === null).map((n) => n.id)) fillEmptyBranches(g, s, taken);
  const r = done(g);
  return { flow: r.ok ? r.flow : g, upgraded };
}

/** null 이면 `linearFlow(ruleIds)` + 빈 view. raw 가 있으면 칸을 채워 복사하고 모양이 맞는 view 항목만 남긴 뒤 옛 합류를 바꾼다(R15). */
export function toEditFlowCounted(raw: (RuleSetFlow & { view?: unknown }) | null, ruleIds: readonly string[]): { flow: EditFlow; upgraded: number } {
  const src = raw ?? linearFlow(ruleIds);
  const nodes = (Array.isArray(src.nodes) ? src.nodes : []).map(copyNode);
  const edges = (Array.isArray(src.edges) ? src.edges : []).map(copyEdge);
  const view: FlowView = raw ? sanitizeView(raw.view) : { positions: {}, notes: [], groups: [], routes: {}, labels: {} };
  const base: EditFlow = {
    version: 1,
    nodes,
    edges,
    view: withStyles(
      { ...view, routes: routesFor(edges, view.routes), labels: labelsFor(edges, view.labels) }, stylesFor(nodes, view.styles), descsFor(nodes, view.descs),
      catchSpotsFor(nodes, view.catchSpots),
    ),
  };
  return upgradeLegacyMerges(base);
}

/** toEditFlowCounted 의 흐름 — 기준 흐름(baseJson)과 편집 흐름이 같은 변환을 거쳐 열기만 해서는 dirty 가 아니다(J-D12). */
export function toEditFlow(raw: (RuleSetFlow & { view?: unknown }) | null, ruleIds: readonly string[]): EditFlow {
  return toEditFlowCounted(raw, ruleIds).flow;
}

/**
 * P2 정규 JSON 과 같은 키 순서의 문자열. view 항목도 고정 키 순서로 쓴다 — 외관(styles)·설명(descs)·받는 노드 자리(catchSpots)는 있을 때만 이 순서로 뒤에 둔다(S-D1).
 * 설명은 쓸 때 앞뒤 공백을 지운다(편집 중 상태는 공백을 그대로 둔다 — 입력 중 단어 사이 공백이 사라지지 않게).
 */
export function flowJsonOf(f: EditFlow): string {
  const c = clone(f);
  const v = c.view;
  const descs = descsFor(c.nodes, v.descs, true);
  return JSON.stringify({
    version: 1, nodes: c.nodes, edges: c.edges,
    view: {
      positions: v.positions, notes: v.notes, groups: v.groups, routes: v.routes, labels: v.labels, ...(v.styles ? { styles: v.styles } : {}),
      ...(Object.keys(descs).length > 0 ? { descs } : {}), ...(v.catchSpots ? { catchSpots: v.catchSpots } : {}),
    },
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

/** 빈 단계(TASK, 4단계 T1) 기본 제목. */
export const TASK_LABEL = "빈 단계";

/**
 * 선 e(A→B) 위에 빈 단계를 끼운다 — insertRule 과 같은 자리·선 규칙, 룰 ID 없이 제목만.
 * 노드 ID 는 룰과 같은 `r` 접두어다(룰을 지정해도 ID 가 그대로라 한 줄 흐름의 r1…rN 규칙과 맞는다).
 */
export function insertTask(f: EditFlow, edgeId: string, label: string = TASK_LABEL): EditResult {
  const g = clone(f);
  const ei = g.edges.findIndex((e) => e.id === edgeId);
  if (ei < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  const e = g.edges[ei];
  const taken = takenIds(g);
  const t = node(fresh(taken, "r"), "TASK", null, null, label);
  const out = edge(fresh(taken, "e"), t.id, e.to);
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === e.from),
    t,
  );
  e.to = t.id;
  insertAfter(g.edges, ei, out);
  return done(g);
}

/**
 * 선 e(A→B) 위에 분기를 끼운다. IF 는 합류 없이 갈래 `{s→t, 갈래 1}`·`{s→B, 그 외}`·선 `{t→B}`(t = 새 빈 단계)를 e 바로 뒤에, 노드는 A 뒤에 s, t.
 * B 가 END 면 모이는 자리 빈 단계 j 를 하나 더 두어 `{s→t}`·`{s→j, 그 외}`·`{t→j}`·`{j→END}`, 노드는 A 뒤에 s, t, j 다 — 「그 외」 가 끝내는 갈래가
 * 되지 않고 블록이 j 에서 닫혀 지우기·풀기·종류 바꾸기·갈래 더하기·옮기기·접기가 END 아닌 자리와 같게 된다(J-D10 과 같은 근거, 수정 1회차 판정).
 * 병렬은 짝 합류 m 과 갈래 두 개·합류 출구 {m→B} 를 만든다.
 */
export function insertSplit(f: EditFlow, edgeId: string, kind: "IF" | "PARALLEL"): EditResult {
  const g = clone(f);
  const ei = g.edges.findIndex((e) => e.id === edgeId);
  if (ei < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  const e = g.edges[ei];
  const taken = takenIds(g);
  const s = node(fresh(taken, SPLIT_PREFIX[kind]), kind, null, null, SPLIT_LABEL[kind]);
  const at = g.nodes.findIndex((n) => n.id === e.from);
  if (kind === "IF") {
    const t = node(fresh(taken, "r"), "TASK", null, null, TASK_LABEL);
    const toEnd = findNode(g, e.to)?.kind === "END";
    const j = toEnd ? node(fresh(taken, "r"), "TASK", null, null, TASK_LABEL) : null;
    const join = j ? j.id : e.to;
    const b1 = edge(fresh(taken, "e"), s.id, t.id, { order: 1, label: IF_BRANCH_LABEL(1) });
    const bo = edge(fresh(taken, "e"), s.id, join, { otherwise: true, label: OTHERWISE_LABEL });
    const te = edge(fresh(taken, "e"), t.id, join);
    const je = j ? [edge(fresh(taken, "e"), j.id, e.to)] : [];
    insertAfter(g.nodes, at, s, t, ...(j ? [j] : []));
    e.to = s.id;
    insertAfter(g.edges, ei, b1, bo, te, ...je);
    return done(g);
  }
  const m = node(fresh(taken, "m"), "MERGE", null, s.id);
  const branches = [
    edge(fresh(taken, "e"), s.id, m.id, { order: 1, label: IF_BRANCH_LABEL(1) }),
    edge(fresh(taken, "e"), s.id, m.id, { order: 2, label: IF_BRANCH_LABEL(2) }),
  ];
  const exit = edge(fresh(taken, "e"), m.id, e.to);
  insertAfter(g.nodes, at, s, m);
  e.to = s.id;
  insertAfter(g.edges, ei, ...branches, exit);
  return done(g);
}

/**
 * 노드를 지운다(§8.2). RULE·TASK: 들어오는 선이 없으면 나가는 선과 함께, 있으면 모두 나가는 선 도착으로 옮기고(선 ID 유지) 노드·붙은 받는 노드·그 나가는 선을 지운다
 * (처리 갈래 안 노드는 남긴다). 돌아오는 자리이고 다음이 END 면 거부(RETURN_JOIN_END). IF 는 들어오는 선을 모이는 자리로 옮기고 블록(끝내는 갈래 몸 포함)을 지운다.
 * 병렬은 짝 합류까지 지우고 들어오는 선을 합류 출구 도착으로(R9). 합류는 분기로 지운다 — 단 받는 노드가 없는데 룰·빈 단계를 가리키는 옛 돌아오는 합류는
 * 들어오는 선을 출구 도착으로 옮겨 걷어 낸다(수정 1회차, 출구가 하나일 때). 받는 노드는 자기와 나가는 선만. 결과에 빈 갈래가 둘이면 거부(B2).
 */
export function removeNode(f: EditFlow, nodeId: string): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(`노드 ${nodeId}를 찾지 못했다`);
  if (n.kind === "START") return fail("시작 노드는 지울 수 없다");
  if (n.kind === "END") return fail("끝 노드는 지울 수 없다");
  if (n.kind === "MERGE") {
    const host = n.splitId == null ? undefined : findNode(g, n.splitId);
    if (!host || !CATCHABLE.has(host.kind)) return fail(MERGE_ONLY_BY_SPLIT);
    const next = dissolveMerge(g, nodeId);
    return next ? checked(next) : fail(MERGE_EXIT_NOT_ONE);
  }
  if (n.kind === "CATCH") return done(dropNodes(g, new Set([nodeId])));
  const endId = endIdOf(g);
  const ins = inOf(g, nodeId);
  if (isStep(n.kind)) {
    const outs = outOf(g, nodeId);
    const drop = new Set([nodeId, ...catchesOf(g, nodeId).map((c) => c.id)]);
    if (ins.length === 0) return done(dropNodes(g, drop));
    if (outs.length !== 1) return fail(RULE_EDGES_NOT_ONE);
    if (outs[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, outs[0].to);
    g.edges = g.edges.filter((e) => e !== outs[0]);
    return checked(dropNodes(g, drop));
  }
  if (n.kind === "IF" && mergeOf(g, nodeId) === null) {
    const join = joinOf(g, nodeId);
    const members = blockMembers(g, nodeId);
    if (join == null || !members) return fail(NO_JOIN_REMOVE(nodeId));
    if (join === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, join);
    return checked(dropNodes(g, new Set(members)));
  }
  const cannot = `분기 ${nodeId}의 짝 합류를 찾지 못해 지울 수 없다`;
  const m = mergeOf(g, nodeId);
  const exits = m ? outOf(g, m.id) : [];
  const inner = m ? blockNodes(g, nodeId, m.id) : null;
  if (!m || exits.length !== 1 || !inner) return fail(cannot);
  if (exits[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
  retarget(ins, exits[0].to);
  return checked(dropNodes(g, new Set([nodeId, ...inner, m.id])));
}

/** 분기와 그 모이는 자리(병렬은 짝 합류). */
function splitAndJoin(g: EditFlow, splitId: string): { split: FlowNode; join: string } | string {
  const split = findNode(g, splitId);
  if (!split || !isSplitKind(split.kind)) return `노드 ${splitId}는 분기가 아니다`;
  const join = joinOf(g, splitId);
  if (join == null) return split.kind === "IF" ? NO_JOIN_BRANCH(splitId) : `분기 ${splitId}의 짝 합류를 찾지 못했다`;
  return { split, join };
}

function branchEdge(g: EditFlow, splitId: string, edgeId: string): FlowEdge | string {
  const e = findEdge(g, edgeId);
  if (!e) return `선 ${edgeId}를 찾지 못했다`;
  if (e.from !== splitId) return `선 ${edgeId}는 분기 ${splitId}의 갈래가 아니다`;
  return e;
}

const maxOrder = (branches: readonly FlowEdge[]) =>
  branches.filter((e) => !e.otherwise && e.order != null).reduce((m, e) => Math.max(m, e.order as number), 0);

/** 갈래를 더한다. IF 는 새 빈 단계 t 와 `s→t`(order = 최대 + 1)·`t→모이는 자리` 를 "그 외" 앞에(t 는 분기 바로 뒤, R8), 병렬은 빈 갈래 `s→합류` 를 끝 갈래 뒤에. */
export function addBranch(f: EditFlow, splitId: string): EditResult {
  const g = clone(f);
  const sj = splitAndJoin(g, splitId);
  if (typeof sj === "string") return fail(sj);
  const outs = outOf(g, splitId);
  const order = maxOrder(outs) + 1;
  const taken = takenIds(g);
  const after = outs.length > 0 ? g.edges.indexOf(outs[outs.length - 1]) : -1;
  if (sj.split.kind === "IF") {
    const t = node(fresh(taken, "r"), "TASK", null, null, TASK_LABEL);
    const b = edge(fresh(taken, "e"), splitId, t.id, { order, label: IF_BRANCH_LABEL(order) });
    const te = edge(fresh(taken, "e"), t.id, sj.join);
    insertAfter(g.nodes, g.nodes.findIndex((n) => n.id === splitId), t);
    const other = outs.find((e) => e.otherwise);
    if (other) g.edges.splice(g.edges.indexOf(other), 0, b, te);
    else insertAfter(g.edges, after, b, te);
    return done(g);
  }
  insertAfter(g.edges, after, edge(fresh(taken, "e"), splitId, sj.join, { order, label: IF_BRANCH_LABEL(order) }));
  return done(g);
}

/** 갈래 선 e 와 그 안 노드·선을 지운다(이어지는 갈래는 모이는 자리까지, 끝내는 갈래는 END 까지). "그 외" 는 지우지 않고, 갈래는 2개 이상 남긴다. */
export function removeBranch(f: EditFlow, splitId: string, edgeId: string): EditResult {
  const g = clone(f);
  const sj = splitAndJoin(g, splitId);
  if (typeof sj === "string") return fail(sj);
  const e = branchEdge(g, splitId, edgeId);
  if (typeof e === "string") return fail(e);
  if (e.otherwise) return fail('"그 외" 갈래는 지울 수 없다');
  if (outOf(g, splitId).length - 1 < 2) return fail("분기에는 갈래가 2개 이상 있어야 한다");
  const inner = branchNodes(g, splitId, edgeId);
  if (!inner) return fail(sj.split.kind === "IF" ? NO_JOIN_REMOVE(splitId) : `분기 ${splitId}의 짝 합류를 찾지 못해 지울 수 없다`);
  g.edges = g.edges.filter((x) => x !== e);
  return done(dropNodes(g, inner));
}

/** "그 외" 가 아닌 갈래를 order 로 줄 세워 이웃과 order 값을 바꾼다. */
export function moveBranch(f: EditFlow, splitId: string, edgeId: string, dir: -1 | 1): EditResult {
  const g = clone(f);
  const sj = splitAndJoin(g, splitId);
  if (typeof sj === "string") return fail(sj);
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

/**
 * 새 선 {from→to} 을 끝에 더한다. 같은 from·to 선, 받는 노드로 들어가는 선, 이미 나가는 선이 있는 받는 노드에서 나가는 선은 거부한다.
 * 받는 노드·처리 갈래 노드에서 정상 경로 노드로 이으면 그 선이 곧 돌아오는 선이다(implicit-join spec §8.2).
 */
export function connect(f: EditFlow, from: string, to: string): EditResult {
  const g = clone(f);
  if (g.edges.some((e) => e.from === from && e.to === to)) return fail("이미 이어진 선이다");
  const source = findNode(g, from);
  const target = findNode(g, to);
  if (!source) return fail(`노드 ${from}를 찾지 못했다`);
  if (!target) return fail(`노드 ${to}를 찾지 못했다`);
  if (target.kind === "CATCH") return fail(CATCH_NO_IN);
  if (source.kind === "CATCH" && g.edges.some((e) => e.from === from)) return fail(CATCH_ONE_OUT);
  g.edges.push(edge(fresh(takenIds(g), "e"), from, to));
  return done(g);
}

/**
 * 선 하나의 한쪽(또는 양쪽) 끝을 다른 노드로 옮겨 붙인다(다시 잇기, R1). 선 ID·조건식·이름·순서·"그 외" 표시는 그대로이고
 * 그 선의 꺾는 점은 버린다(양 끝이 바뀌면 옛 경로가 맞지 않는다). 이름표 오프셋(L1)은 기본 자리 기준이라 남긴다. 자기 자신으로 잇기·없는 노드·다른 선과 같은 from→to·바뀌는 끝이 없음은 거부한다.
 * 구조가 틀어지는 경우(합류 건너뛰기 등)는 막지 않고 구조 검사가 표시한다. 받는 노드로 들어가게 옮기기와, 이미 다른 나가는 선이 있는
 * 받는 노드에서 나가게 옮기기는 거부한다(처리 갈래 첫 선의 도착 끝 옮기기는 된다).
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
  if (findNode(g, to)!.kind === "CATCH") return fail(CATCH_NO_IN);
  if (from !== e.from && findNode(g, from)!.kind === "CATCH" && g.edges.some((x) => x.id !== edgeId && x.from === from)) return fail(CATCH_ONE_OUT);
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

/**
 * 두 끝이 모두 `ids` 에 든 선의 꺾는 점을 (dx, dy) 만큼 옮긴다 — 노드 여럿·그룹을 같은 만큼 옮길 때 그 사이 선 모양을 지킨다.
 * 한 끝만 든 선은 그대로 둔다. 옮길 것이 없으면 입력 그대로.
 */
export function shiftRoutes(f: EditFlow, ids: ReadonlySet<string>, dx: number, dy: number): EditFlow {
  if (dx === 0 && dy === 0) return f;
  const hit = f.edges.filter((e) => ids.has(e.from) && ids.has(e.to) && f.view.routes[e.id]?.length);
  if (hit.length === 0) return f;
  const g = clone(f);
  const routes = { ...g.view.routes };
  for (const e of hit) routes[e.id] = routes[e.id].map((p) => ({ x: p.x + dx, y: p.y + dy }));
  g.view.routes = routes;
  return g;
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

/**
 * 배치를 덮어쓴다(병합). 흐름에 있는 노드 ID 만 남긴다 — 없는 ID(낡은 캔버스 끌기 등)의 위치 키는 적지 않고, 이미 있던 것도 치운다.
 * 받는 노드(CATCH) 위치는 적지 않는다 — 룰 기준으로 그린다(flow-layout catchSpot).
 */
export function setPositions(f: EditFlow, pos: Readonly<Record<string, FlowPos>>): EditFlow {
  const g = clone(f);
  const ids = new Set(g.nodes.filter((n) => n.kind !== "CATCH").map((n) => n.id)); // 받는 노드 위치는 저장하지 않는다(R14)
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

/** 그룹에 넣을 수 있는 노드만 — 있는 노드, START·END·받는 노드(룰을 따라 그린다) 제외, 중복 제거. */
function groupable(g: EditFlow, ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const n = findNode(g, id);
    if (!n || n.kind === "START" || n.kind === "END" || n.kind === "CATCH" || out.includes(id)) continue;
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
      : { ...x, title: patch.title ?? x.title, nodeIds: patch.nodeIds !== undefined ? groupable(g, patch.nodeIds) : x.nodeIds },
  );
  return g;
}

export function removeGroup(f: EditFlow, id: string): EditFlow {
  const g = clone(f);
  g.view.groups = g.view.groups.filter((x) => x.id !== id);
  return g;
}

/**
 * 그룹 틀 여백을 바꾼다(G2 — 크기 손잡이를 놓을 때 한 번). 0~2000 정수로 자르고, null 이나 모두 0 이면 pad 를 지운다(기본 크기).
 * 크기를 바꿔도 소속은 바뀌지 않는다. 없는 그룹·유한하지 않은 값은 거부한다.
 */
export function setGroupPad(f: EditFlow, id: string, pad: GroupPad | null): EditResult {
  if (!f.view.groups.some((x) => x.id === id)) return fail(`그룹 ${id}를 찾지 못했다`);
  if (pad && ![pad.l, pad.t, pad.r, pad.b].every(finite)) return fail("그룹 크기가 올바르지 않다");
  const g = clone(f);
  const next = normalizePad(pad);
  g.view.groups = g.view.groups.map((x) => {
    if (x.id !== id) return x;
    const base: FlowGroup = { id: x.id, title: x.title, nodeIds: x.nodeIds };
    if (next) base.pad = next;
    if (x.color) base.color = x.color; // 크기를 바꿔도 색은 남는다
    return base;
  });
  return { ok: true, flow: g };
}

/**
 * 그룹 여럿의 색을 한 번에 바꾼다(그룹 우클릭 「색상」, 편집 한 번 — 노드 `setNodesColor` 와 같은 규칙). `default` 는 색 키 지우기.
 * 없는 그룹·모르는 색은 건너뛴다. 크기(pad)·소속은 그대로다. 바뀌는 것이 없으면 같은 흐름 객체를 돌려준다.
 */
export function setGroupsColor(f: EditFlow, groupIds: readonly string[], color: NodeColor): EditFlow {
  const next = paintedColor(color);
  if (next === null && color !== "default") return f;
  const targets = new Set(groupIds);
  if (!f.view.groups.some((x) => targets.has(x.id) && (x.color ?? null) !== next)) return f;
  const g = clone(f);
  g.view.groups = g.view.groups.map((x) => {
    if (!targets.has(x.id)) return x;
    const out: FlowGroup = { id: x.id, title: x.title, nodeIds: x.nodeIds };
    if (x.pad) out.pad = x.pad;
    if (next) out.color = next;
    return out;
  });
  return g;
}

// ───────────────────────── 3단계 편집 연산(계획 P6) ─────────────────────────

/** 복사한 조각 — 노드들과 그 안의 선. entry 로 들어가 exit 로 나온다(룰 하나면 entry = exit, 병렬은 짝 합류). 새 IF 블록은 exit 이 null 이고 꼬리·끝 선을 담는다(R7). */
export interface Fragment {
  nodes: FlowNode[];
  /** 조각 선 — 원래 선 배열 순서. tails·endTails 의 선은 `to` 가 빈 문자열이다. */
  edges: FlowEdge[];
  entry: string;
  exit: string | null;
  /** 새 IF 블록의 꼬리 선 ID(edges 안) — 붙일 때 놓는 선의 도착으로 잇는다. */
  tails?: string[];
  /** 새 IF 블록의 끝 선 ID(edges 안) — 붙일 때 붙여 넣는 흐름의 END 로 잇는다. */
  endTails?: string[];
  /** 조각 노드의 외관(S-D10 — 붙여 넣을 때 새 ID 로 옮긴다). 없으면 키가 없다. */
  styles?: Record<string, NodeStyle>;
  /** 조각 노드의 설명(붙여 넣을 때 새 ID 로 옮긴다). 없으면 키가 없다. */
  descs?: Record<string, string>;
}

/** 붙여 넣을 때 새 ID 접두어(종류별). START·END 는 조각에 들지 않는다. */
const NODE_PREFIX: Partial<Record<FlowNodeKind, string>> = { RULE: "r", TASK: "r", IF: SPLIT_PREFIX.IF, PARALLEL: SPLIT_PREFIX.PARALLEL, MERGE: "m" };
const KIND_NAME: Record<"IF" | "PARALLEL", string> = { IF: "IF", PARALLEL: "병렬" };
const MOVE_FIXED: Partial<Record<FlowNodeKind, string>> = {
  START: "시작 노드는 옮길 수 없다",
  END: "끝 노드는 옮길 수 없다",
  MERGE: "합류 노드는 분기를 옮겨서 옮긴다",
  CATCH: "받는 노드는 룰을 옮겨서 옮긴다",
};
/** 룰 노드를 옮길 수 없을 때(선이 하나씩이 아님) — 지우기 문구와 따로 둔다. */
const RULE_EDGES_NOT_ONE_MOVE = "룰 노드의 나가는 선이 하나가 아니라 옮길 수 없다. 선을 먼저 정리한다";
const MOVE_INTO_SELF = "자기 자리나 자기 블록 안으로는 옮길 수 없다";
const NO_COPY = "시작·끝·합류는 복사하지 않는다. 병렬 분기를 복사하면 합류가 함께 복사된다";
const BAD_FRAGMENT = "붙여 넣을 조각이 올바르지 않다";
const AUTO_BRANCH_LABEL = /^갈래 \d+$/;
const notFound = (id: string) => `노드 ${id}를 찾지 못했다`;

/** 갈래 선의 실행 순서 — "그 외" 아닌 것을 order 오름차순(없으면 뒤, 같으면 배열 순서), "그 외" 는 마지막. */
function branchesInOrder(branches: readonly FlowEdge[]): FlowEdge[] {
  const key = (e: FlowEdge) => e.order ?? Number.POSITIVE_INFINITY;
  return [...branches.filter((e) => !e.otherwise).sort((a, b) => key(a) - key(b)), ...branches.filter((e) => e.otherwise)];
}

/** 분기 + 안쪽(+ 병렬·옛 IF 의 짝 합류) 노드 ID(흐름 노드 배열 순서). 새 IF 의 모이는 자리는 블록 밖이다. 분기가 아니거나 블록이 닫히지 않으면 null. */
export function blockMembers(f: EditFlow, splitId: string): string[] | null {
  const s = findNode(f, splitId);
  if (!s || !isSplitKind(s.kind)) return null;
  const join = joinOf(f, splitId);
  const inner = join == null ? null : blockNodes(f, splitId, join);
  if (join == null || !inner) return null;
  const withMerge = s.kind === "PARALLEL" || mergeOf(f, splitId) !== null;
  const members = new Set([splitId, ...inner, ...(withMerge ? [join] : [])]);
  return f.nodes.filter((n) => members.has(n.id)).map((n) => n.id);
}

/** 새 형식 IF 블록의 꼬리 선 — 블록 멤버(분기 포함)에서 모이는 자리로 가는 선, 선 배열 순서(§8.1). 새 IF 가 아니거나 블록을 못 정하면 null. */
export function tailsOf(f: EditFlow, splitId: string): FlowEdge[] | null {
  const s = findNode(f, splitId);
  if (!s || s.kind !== "IF" || mergeOf(f, splitId) !== null) return null;
  const join = joinOf(f, splitId);
  const members = blockMembers(f, splitId);
  if (join == null || !members) return null;
  const inside = new Set(members);
  return f.edges.filter((e) => inside.has(e.from) && e.to === join);
}

/**
 * 노드를 옮길 때 놓을 대상에서 뺄 선. 룰은 자기로 들어오는·나가는 선과 처리 갈래(받는 노드부터 돌아오는 자리·END 직전까지, 안쪽 블록 포함)
 * 노드에서 나가는 모든 선, 분기는 분기로 들어오는 선과
 * 블록 멤버(분기·안쪽·병렬 합류, 받는 노드 포함)에서 나가는 모든 선(새 IF 의 꼬리·끝 선, 합류 출구·처리 갈래에서 끝으로 가는 선 포함).
 * 그 밖 종류이거나 블록이 닫히지 않으면 빈 집합(옮기기 자체가 거부된다).
 */
export function moveExcludedEdges(f: EditFlow, nodeId: string): ReadonlySet<string> {
  const n = findNode(f, nodeId);
  if (n && isStep(n.kind)) {
    const handler = handlerNodes(f, nodeId, returnOf(f, nodeId)); // 받는 노드 + 처리 갈래 노드(돌아오는 자리·END 직전까지)
    return new Set(f.edges.filter((e) => e.from === nodeId || e.to === nodeId || handler.has(e.from)).map((e) => e.id));
  }
  const members = n && isSplitKind(n.kind) ? blockMembers(f, nodeId) : null;
  if (!members) return new Set();
  const inside = new Set(members);
  return new Set(f.edges.filter((e) => e.to === nodeId || inside.has(e.from)).map((e) => e.id));
}

/**
 * 룰·빈 단계 또는 분기 블록을 선 t(X→Y) 로 옮긴다(§8.2). 떼어 낼 때 들어오는 선(여럿 가능)을 모두 옮긴다 — 룰은 나가는 선 도착, 새 IF 는 모이는 자리,
 * 병렬은 합류 출구 도착(R9). 룰은 새 선 {룰 → Y} 를 t 뒤에, 새 IF 는 꼬리를 모두 Y 로(꺾는 점 지움) 옮기고 새 선을 만들지 않으며, 병렬은 {합류 → Y} 를 t 뒤에.
 * t.to = 노드. t 의 칸은 그대로. 돌아오는 처리 갈래가 있는 룰은 옮기지 않는다(MOVE_GUARDED). 돌아오는 자리이고 다음이 END 면 거부(RETURN_JOIN_END).
 */
export function moveNode(f: EditFlow, nodeId: string, edgeId: string): EditResult {
  const g = clone(f);
  const n = findNode(g, nodeId);
  if (!n) return fail(notFound(nodeId));
  const fixed = MOVE_FIXED[n.kind];
  if (fixed) return fail(fixed);
  if (!findEdge(g, edgeId)) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (isStep(n.kind) && returnOf(g, nodeId) !== null) return fail(MOVE_GUARDED);
  if (moveExcludedEdges(g, nodeId).has(edgeId)) return fail(MOVE_INTO_SELF);
  const endId = endIdOf(g);
  const taken = takenIds(g); // 떼기 전에 모은다 — 방금 지운 선 ID 를 새 선에 다시 쓰지 않는다
  const ins = inOf(g, nodeId);
  const place = (exitId: string, out: FlowEdge | null): EditResult => {
    if (out) g.edges = g.edges.filter((e) => e !== out); // 들어오는 선을 고친 뒤에 나가는 선만 지운다
    const ti = g.edges.findIndex((e) => e.id === edgeId);
    const t = g.edges[ti];
    insertAfter(g.edges, ti, edge(fresh(taken, "e"), exitId, t.to));
    t.to = nodeId;
    return checked(g);
  };
  if (isStep(n.kind)) {
    const outs = outOf(g, nodeId);
    if (outs.length !== 1) return fail(RULE_EDGES_NOT_ONE_MOVE);
    if (outs[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, outs[0].to);
    return place(nodeId, outs[0]);
  }
  if (n.kind === "IF" && mergeOf(g, nodeId) === null) {
    const join = joinOf(g, nodeId);
    const tails = tailsOf(g, nodeId);
    if (join == null || !tails || tails.length === 0) return fail(NO_JOIN_MOVE(nodeId));
    if (join === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
    retarget(ins, join);
    const t = findEdge(g, edgeId)!;
    retarget(tails, t.to);
    dropRoutes(g, tails);
    t.to = nodeId;
    return checked(g);
  }
  const cannot = `분기 ${nodeId}의 짝 합류를 찾지 못해 옮길 수 없다`;
  const m = mergeOf(g, nodeId);
  if (!m || !blockNodes(g, nodeId, m.id)) return fail(cannot);
  const exits = outOf(g, m.id);
  if (exits.length !== 1) return fail(cannot);
  if (exits[0].to === endId && isReturnPlace(g, nodeId)) return fail(RETURN_JOIN_END);
  retarget(ins, exits[0].to);
  return place(m.id, exits[0]);
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

/**
 * 룰 지정(4단계 T1) — 빈 단계면 RULE 로 바꾸고 룰 ID 를 넣고, 룰 노드면 룰만 바꾼다(`replaceRule`).
 * 노드 ID·자리(view.positions)·들어오고 나가는 선·경로·이름표는 그대로다. 사용자가 붙인 제목(노드 라벨)은 룰 노드 이름으로 남는다(D-125 그림 먼저) —
 * 단 새 빈 단계의 기본 제목(`TASK_LABEL`)은 이름이 아니라 자리 표시라 비운다. 편집 한 번이라 되돌리기 한 번에 돌아간다.
 */
export function assignRule(f: EditFlow, nodeId: string, ruleId: string): EditResult {
  const n = findNode(f, nodeId);
  if (!n) return fail(notFound(nodeId));
  if (n.kind === "RULE") return replaceRule(f, nodeId, ruleId);
  if (n.kind !== "TASK") return fail("빈 단계·룰 노드에만 룰을 지정한다");
  if (ruleId.trim() === "") return fail("룰 ID 가 비었다");
  const g = clone(f);
  const m = findNode(g, nodeId)!;
  m.kind = "RULE";
  m.ruleId = ruleId;
  if (m.label === TASK_LABEL) m.label = null; // 기본 제목은 이름이 아니다 — 룰 노드에 「빈 단계」 가 이름으로 남지 않게 비운다
  return done(g);
}

/** 조각 노드의 외관(없으면 undefined — 키를 싣지 않는다). */
function fragmentStyles(f: EditFlow, nodes: readonly FlowNode[]): Record<string, NodeStyle> | undefined {
  const s = stylesFor(nodes, f.view?.styles);
  return Object.keys(s).length > 0 ? s : undefined;
}

/** 조각 노드의 설명(없으면 undefined — 키를 싣지 않는다). */
function fragmentDescs(f: EditFlow, nodes: readonly FlowNode[]): Record<string, string> | undefined {
  const d = descsFor(nodes, f.view?.descs);
  return Object.keys(d).length > 0 ? d : undefined;
}

/** 룰 노드 하나 또는 분기 블록(합류까지)의 깊은 복사(조각 노드의 외관·설명 포함). 문자열이면 거부 사유다. */
export function copyFragment(f: EditFlow, nodeId: string): Fragment | string {
  const n = findNode(f, nodeId);
  if (!n) return notFound(nodeId);
  if (isStep(n.kind)) {
    const nodes = [copyNode(n)];
    const styles = fragmentStyles(f, nodes);
    const descs = fragmentDescs(f, nodes);
    return { nodes, edges: [], entry: nodeId, exit: nodeId, ...(styles ? { styles } : {}), ...(descs ? { descs } : {}) };
  }
  if (n.kind === "CATCH") return NO_COPY_CATCH_NODE;
  if (!isSplitKind(n.kind)) return NO_COPY;
  const members = blockMembers(f, nodeId);
  if (!members) return `분기 ${nodeId}의 블록을 찾지 못해 복사할 수 없다`;
  const inside = new Set(members);
  if (f.nodes.some((x) => inside.has(x.id) && x.kind === "CATCH")) return NO_COPY_CATCH;
  const nodes = f.nodes.filter((x) => inside.has(x.id)).map(copyNode);
  const styles = fragmentStyles(f, nodes);
  const descs = fragmentDescs(f, nodes);
  const extra = { ...(styles ? { styles } : {}), ...(descs ? { descs } : {}) };
  if (n.kind === "IF" && mergeOf(f, nodeId) === null) {
    const join = joinOf(f, nodeId)!;
    const endId = endIdOf(f);
    const tails: string[] = [];
    const endTails: string[] = [];
    const edges = f.edges
      .filter((e) => inside.has(e.from) && (inside.has(e.to) || e.to === join || e.to === endId))
      .map((e) => {
        const c = copyEdge(e);
        if (inside.has(e.to)) return c;
        (e.to === join ? tails : endTails).push(e.id);
        return { ...c, to: "" };
      });
    return { nodes, edges, entry: nodeId, exit: null, tails, endTails, ...extra };
  }
  return {
    nodes,
    edges: f.edges.filter((e) => inside.has(e.from) && inside.has(e.to)).map(copyEdge),
    entry: nodeId,
    exit: mergeOf(f, nodeId)!.id,
    ...extra,
  };
}

/** copyFragment 가 만든 모양인가 — ID 가 겹치지 않고, entry·exit(없으면 꼬리 하나 이상)·선 끝이 조각 안이고(꼬리·끝 선은 to 빈 문자열), MERGE 의 짝은 조각 안 병렬이다. */
function wellFormed(frag: Fragment): boolean {
  const byId = new Map(frag.nodes.map((n) => [n.id, n] as const));
  const loose = new Set([...(frag.tails ?? []), ...(frag.endTails ?? [])]);
  const exitOk = frag.exit === null ? (frag.tails ?? []).length > 0 : byId.has(frag.exit);
  return (
    byId.size === frag.nodes.length &&
    byId.has(frag.entry) &&
    exitOk &&
    frag.nodes.every((n) => NODE_PREFIX[n.kind] !== undefined && (n.kind !== "MERGE" || byId.get(n.splitId ?? "")?.kind === "PARALLEL")) &&
    frag.edges.every((e) => byId.has(e.from) && (loose.has(e.id) ? e.to === "" : byId.has(e.to)))
  );
}

/**
 * 조각을 새 ID 로 g 에 넣는다 — 노드는 nodeIndex 뒤, 선은 edgeIndex 뒤(조각 선 순서 그대로, 출구 선은 끝). 꼬리는 tailTo, 끝 선은 g 의 END,
 * 출구(있으면) {출구 → tailTo}. 라벨·조건식·order·otherwise 를 복사하고 합류 splitId 는 새 분기 ID 로, 외관·설명은 새 ID 로 옮긴다. 새 entry ID. g 는 복사본이다.
 */
function instantiate(g: EditFlow, frag: Fragment, nodeIndex: number, tailTo: string, edgeIndex: number): string {
  const taken = takenIds(g);
  const idOf = new Map<string, string>();
  for (const n of frag.nodes) idOf.set(n.id, fresh(taken, NODE_PREFIX[n.kind]!));
  const nid = (id: string) => idOf.get(id)!;
  const endId = endIdOf(g) ?? "";
  const tails = new Set(frag.tails ?? []);
  const endTails = new Set(frag.endTails ?? []);
  const nodes = frag.nodes.map((n) => node(nid(n.id), n.kind, str(n.ruleId), n.kind === "MERGE" ? nid(n.splitId!) : str(n.splitId), str(n.label)));
  const edges = frag.edges.map((e) =>
    edge(fresh(taken, "e"), nid(e.from), tails.has(e.id) ? tailTo : endTails.has(e.id) ? endId : nid(e.to), {
      order: int(e.order), cond: str(e.cond), otherwise: e.otherwise === true, label: str(e.label),
    }),
  );
  const exit = frag.exit === null ? [] : [edge(fresh(taken, "e"), nid(frag.exit), tailTo)];
  insertAfter(g.nodes, nodeIndex, ...nodes);
  insertAfter(g.edges, edgeIndex, ...edges, ...exit);
  if (frag.styles) {
    const styles: Record<string, NodeStyle> = { ...g.view.styles };
    for (const [oldId, s] of Object.entries(frag.styles)) if (idOf.has(oldId)) styles[nid(oldId)] = s;
    g.view = { ...g.view, styles }; // done 이 노드 순서·정규화로 다시 맞춘다
  }
  if (frag.descs) {
    const descs: Record<string, string> = { ...g.view.descs };
    for (const [oldId, d] of Object.entries(frag.descs)) if (idOf.has(oldId)) descs[nid(oldId)] = d;
    g.view = { ...g.view, descs };
  }
  return nid(frag.entry);
}

/** 조각을 선 t(X→Y) 에 붙여 넣는다. t.to = 새 entry, 꼬리·출구는 Y 로, 끝 선은 END 로. 노드는 X 뒤, 조각 선은 t 바로 뒤. 배치는 넣지 않는다(P-D18). */
export function pasteFragment(f: EditFlow, edgeId: string, frag: Fragment): EditResult {
  if (f.nodes.length + frag.nodes.length > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
  const g = clone(f);
  const ti = g.edges.findIndex((e) => e.id === edgeId);
  if (ti < 0) return fail(`선 ${edgeId}를 찾지 못했다`);
  if (!wellFormed(frag) || ((frag.endTails ?? []).length > 0 && endIdOf(g) === null)) return fail(BAD_FRAGMENT);
  const t = g.edges[ti];
  t.to = instantiate(g, frag, g.nodes.findIndex((n) => n.id === t.from), t.to, ti);
  return done(g);
}

/** 원본 바로 뒤에 복제한다 — 룰은 자기에서 나가는 선, 병렬은 짝 합류에서 나가는 선에 붙여 넣는다. 새 IF 는 원래 꼬리를 복제 분기로, 복제 꼬리를 원래 모이는 자리로(§8.2). */
export function duplicateNode(f: EditFlow, nodeId: string): EditResult {
  const frag = copyFragment(f, nodeId);
  if (typeof frag === "string") return fail(frag);
  if (frag.exit === null) {
    if (f.nodes.length + frag.nodes.length > MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
    const g = clone(f);
    const join = joinOf(g, nodeId);
    const tails = tailsOf(g, nodeId);
    const members = blockMembers(g, nodeId);
    if (join == null || !tails || tails.length === 0 || !members) return fail(`분기 ${nodeId}의 갈래가 모이는 자리를 찾지 못해 복제할 수 없다`);
    const lastMember = g.nodes.findIndex((n) => n.id === members[members.length - 1]);
    const copy = instantiate(g, frag, lastMember, join, g.edges.indexOf(tails[tails.length - 1]));
    retarget(tails, copy);
    dropRoutes(g, tails);
    return checked(g);
  }
  const outs = outOf(f, frag.exit);
  if (outs.length !== 1) {
    return fail(frag.entry === frag.exit ? "룰 노드의 선이 하나씩이 아니라 복제할 수 없다" : `분기 ${nodeId}의 짝 합류를 찾지 못해 복제할 수 없다`);
  }
  return pasteFragment(f, outs[0].id, frag);
}

/**
 * IF ↔ 병렬. 노드 ID·선 배열 순서는 그대로다(§8.2).
 * - 병렬로: 끝내는 갈래가 있으면 거부. 새 합류 m(splitId = s)을 모이는 자리 바로 앞에 넣고 꼬리를 m 으로(꺾는 점 지움), 출구 {m → 모이는 자리} 를 마지막 꼬리 뒤에.
 *   갈래를 실행 순서대로 order 1..n, 조건식·그 외 없앰.
 * - IF 로: 갈래를 order 순으로 두고 마지막을 "그 외"(order·조건식 null), 나머지는 order 1..n-1. 짝 합류를 dissolveMerge 하고 같은 도착 갈래에 빈 단계를 채운다.
 *   합류 출구가 END 면 합류를 지우지 않고 같은 ID 의 빈 단계로 바꿔 모이는 자리로 둔다(J-D10, 수정 1회차 — 끝내는 갈래가 생기지 않아 병렬로 되돌릴 수 있다).
 * - 라벨은 기본 라벨(분기 `조건`·`병렬`, 갈래 `갈래 N`·`그 외`)이거나 비었을 때만 새 규칙으로 다시 붙인다.
 */
export function changeSplitKind(f: EditFlow, splitId: string, kind: "IF" | "PARALLEL"): EditResult {
  let g = clone(f);
  const s = findNode(g, splitId);
  if (!s) return fail(notFound(splitId));
  if (!isSplitKind(s.kind)) return fail("분기 노드만 바꾼다");
  if (s.kind === kind) return fail(`이미 ${KIND_NAME[kind]} 분기다`);
  if (kind === "PARALLEL" && mergeOf(g, splitId) === null) {
    const join = joinOf(g, splitId);
    if (join == null) return fail(NO_JOIN_BRANCH(splitId));
    if ((endingBranches(g, splitId) ?? []).length > 0) return fail(ENDING_TO_PARALLEL);
    const tails = tailsOf(g, splitId);
    if (!tails || tails.length === 0) return fail(NO_JOIN_BRANCH(splitId));
    const taken = takenIds(g);
    const m = node(fresh(taken, "m"), "MERGE", null, splitId);
    g.nodes.splice(g.nodes.findIndex((n) => n.id === join), 0, m);
    retarget(tails, m.id);
    dropRoutes(g, tails);
    insertAfter(g.edges, g.edges.indexOf(tails[tails.length - 1]), edge(fresh(taken, "e"), m.id, join));
  } else if (!mergeOf(g, splitId)) return fail(`분기 ${splitId}의 짝 합류를 찾지 못했다`);
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
  if (kind === "IF") {
    const m = mergeOf(g, splitId)!;
    const exits = outOf(g, m.id);
    const endId = endIdOf(g);
    if (endId !== null && exits.length === 1 && exits[0].to === endId) mergeToTask(g, m.id);
    else {
      const next = dissolveMerge(g, m.id);
      if (!next) return fail(`분기 ${splitId}의 짝 합류를 찾지 못했다`);
      g = next;
    }
    fillEmptyBranches(g, splitId, takenIds(g));
  }
  return done(g);
}

/**
 * 분기를 풀어 고른 갈래만 남긴다(§8.2). 분기로 들어오는 선(여럿 가능, R9)을 남길 갈래 첫 노드(빈 갈래면 모이는 자리)로 옮기고 분기·다른 갈래 안쪽
 * (끝내는 갈래 몸 포함)·다른 갈래 선을 dropNodes 로 지운다. 끝내는 갈래만 남기기는 거부한다. 병렬(과 옛 IF)은 짝 합류도 지우고 남긴 갈래 꼬리를 합류 출구 도착으로 옮긴다.
 */
export function dissolveSplit(f: EditFlow, splitId: string, keepEdgeId: string): EditResult {
  const g = clone(f);
  const s = findNode(g, splitId);
  if (!s) return fail(notFound(splitId));
  if (!isSplitKind(s.kind)) return fail("분기 노드만 푼다");
  const keep = findEdge(g, keepEdgeId);
  if (!keep || keep.from !== splitId) return fail(`분기 ${splitId}의 갈래가 아니다`);
  const ins = inOf(g, splitId);
  if (s.kind === "IF" && mergeOf(g, splitId) === null) {
    const join = joinOf(g, splitId);
    const inner = join == null ? null : blockNodes(g, splitId, join);
    if (join == null || !inner) return fail(NO_JOIN_DISSOLVE(splitId));
    if ((endingBranches(g, splitId) ?? []).includes(keepEdgeId)) return fail(KEEP_ENDING);
    const drop = new Set([splitId, ...inner]);
    if (keep.to !== join) {
      const kept = branchNodes(g, splitId, keep.id);
      if (!kept) return fail(NO_JOIN_DISSOLVE(splitId));
      for (const id of kept) drop.delete(id);
    }
    retarget(ins, keep.to);
    return checked(dropNodes(g, drop));
  }
  const cannot = `분기 ${splitId}의 짝 합류를 찾지 못해 풀 수 없다`;
  const m = mergeOf(g, splitId);
  const inner = m ? blockNodes(g, splitId, m.id) : null;
  if (!m || !inner) return fail(cannot);
  const exits = outOf(g, m.id);
  if (exits.length !== 1) return fail(cannot);
  const drop = new Set([splitId, m.id, ...inner]);
  if (keep.to === m.id) {
    retarget(ins, exits[0].to);
  } else {
    const kept = branchNodes(g, splitId, keep.id);
    if (!kept) return fail(cannot);
    retarget(ins, keep.to);
    for (const e of g.edges) if (e.to === m.id && kept.has(e.from)) e.to = exits[0].to;
    for (const id of kept) drop.delete(id);
  }
  return checked(dropNodes(g, drop));
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

// ───────────────────────── 노드 외관(S1) ─────────────────────────

/**
 * 룰·빈 단계 노드 하나의 외관을 바꾼다(S1). 조각의 값은 그 칸을, null 은 칸 지우기, 조각이 null 이면 전부 지우기([외관 초기화]).
 * 범위 밖 크기는 자르고 기본값과 같은 칸은 두지 않는다. 위치는 건드리지 않는다 — 크기를 바꾸며 그린 위치를 고정하는 것은 `restyleNode`(flow-layout).
 */
export function setNodeStyle(f: EditFlow, nodeId: string, patch: NodeStylePatch | null): EditResult {
  const n = findNode(f, nodeId);
  if (!n) return fail(notFound(nodeId));
  if (!isStep(n.kind)) return fail("룰·빈 단계 노드만 외관을 바꾼다");
  if (patch && [patch.w, patch.h].some((v) => v != null && !finite(v))) return fail("노드 크기가 올바르지 않다");
  const g = clone(f);
  const styles: Record<string, NodeStyle> = { ...g.view.styles };
  const next = mergeNodeStyle(styles[nodeId], patch);
  if (next) styles[nodeId] = next;
  else delete styles[nodeId];
  g.view = { ...g.view, styles };
  return done(g);
}

/**
 * 룰·빈 단계 노드 여럿의 색을 한 번에 바꾼다(우클릭 「색상」, 편집 한 번). `default` 는 색 칸 지우기. 룰·빈 단계가 아닌 노드·없는 노드는 건너뛴다.
 * 위치는 건드리지 않는다(크기가 안 바뀐다). 바뀌는 것이 없으면 같은 흐름 객체를 돌려준다.
 */
export function setNodesColor(f: EditFlow, nodeIds: readonly string[], color: NodeColor): EditFlow {
  let cur = f;
  for (const id of nodeIds) {
    const n = findNode(cur, id);
    if (!n || !isStep(n.kind) || (cur.view.styles?.[id]?.color ?? "default") === color) continue;
    const r = setNodeStyle(cur, id, { color: color === "default" ? null : color });
    if (r.ok) cur = r.flow;
  }
  return cur;
}

// ───────────────────────── 노드 설명 ─────────────────────────

/**
 * 노드 하나의 설명을 바꾼다. 빈 값(null·공백뿐)이면 설명을 지우고, 1000자를 넘으면 자른다. 공백은 다듬지 않는다 — 입력하는 동안 단어 사이·끝 공백이
 * 지워지지 않게 하고, 앞뒤 공백은 `flowJsonOf` 가 쓸 때 지운다. 합류(MERGE)·받는 노드(CATCH, 제목 label 만 둔다)와 없는 노드는 거부한다.
 */
export function updateNodeDesc(f: EditFlow, nodeId: string, text: string | null): EditResult {
  const n = findNode(f, nodeId);
  if (!n) return fail(notFound(nodeId));
  if (n.kind === "MERGE") return fail("합류 노드에는 설명을 달 수 없다");
  if (n.kind === "CATCH") return fail("받는 노드에는 설명을 달 수 없다");
  const g = clone(f);
  const descs: Record<string, string> = { ...g.view.descs };
  const next = normalizeDesc(text);
  if (next !== null) descs[nodeId] = next;
  else delete descs[nodeId];
  g.view = { ...g.view, descs };
  return done(g);
}

// ───────────────────────── 받는 노드(받는 노드 spec §8) ─────────────────────────

/** 새 받는 노드 ID 접두어. */
const CATCH_PREFIX = "c";
export const CATCH_FULL = "이 룰의 예외 종류 네 가지를 모두 받고 있다";
export const CATCH_KINDS_EMPTY = "받을 예외 종류를 하나 이상 고른다";
export const CATCH_ONLY_RULE = "룰·빈 단계·룰 세트 노드에만 예외 받기를 붙인다";
export const CATCH_BAD_TARGET = "처리 갈래는 시작·받는 노드·자기 룰로 갈 수 없다";
export const NO_COPY_CATCH = "받는 노드가 든 블록은 복사하지 않는다";
export const NO_COPY_CATCH_NODE = "받는 노드는 복사하지 않는다";
export const MOVE_GUARDED = "처리 갈래가 돌아오는 룰은 옮길 수 없다";
export const RETURN_JOIN_END = "처리 갈래가 돌아오는 자리라 지우면 그 처리 갈래가 끝내기로 바뀐다. 앞에 빈 단계를 두거나 선을 먼저 정리한다";
export const RETURN_TO_END = "노드 다음이 끝 노드라 흐름으로 돌아올 자리가 없다. 노드 뒤에 빈 단계를 넣은 뒤 다시 한다";
export const CATCH_NO_IN = "받는 노드로 들어가는 선은 둘 수 없다";
export const CATCH_ONE_OUT = "받는 노드에서 나가는 선은 하나다";
export const CATCH_TAKEN = (kind: CatchKind, owner: string) => `예외 종류 ${kind}는 ${owner}가 이미 받는다`;

/**
 * 룰·빈 단계·룰 세트 노드에 받는 노드를 붙인다(연결점 끌기·우클릭 「예외 받기 추가」, Ruling R14). to 는 처리 갈래 첫 노드(null 이면 END).
 * 받는 종류는 그 노드 종류가 고를 수 있는 종류(`catchKindsFor`) 가운데 아직 아무도 받지 않는 첫 종류, label 은 null. 노드는 그 룰의 마지막 받는 노드(없으면 룰) 바로 뒤, 선은 끝에 넣는다.
 * 정상 다음 노드로 놓으면 빈 돌아오는 갈래다.
 */
export function addCatch(f: EditFlow, ruleNodeId: string, to: string | null): EditResult & { id?: string } {
  const g = clone(f);
  const r = findNode(g, ruleNodeId);
  if (!r) return fail(notFound(ruleNodeId));
  if (!CATCHABLE.has(r.kind)) return fail(CATCH_ONLY_RULE);
  if (g.nodes.length >= MAX_NODES) return fail(NODE_LIMIT_MESSAGE);
  const siblings = catchesOf(g, ruleNodeId);
  const taken = new Set(siblings.flatMap((c) => c.catches ?? []));
  const kind = catchKindsFor(r.kind).find((k) => !taken.has(k));
  if (!kind) return fail(CATCH_FULL);
  const targetId = to ?? g.nodes.find((n) => n.kind === "END")?.id ?? null;
  const t = targetId == null ? undefined : findNode(g, targetId);
  if (!t) return fail(notFound(targetId ?? "END"));
  if (t.kind === "START" || t.kind === "CATCH" || t.id === ruleNodeId) return fail(CATCH_BAD_TARGET);
  const usedIds = takenIds(g);
  const c: FlowNode = { ...node(fresh(usedIds, CATCH_PREFIX), "CATCH"), attachTo: ruleNodeId, catches: [kind] };
  const anchor = siblings.length > 0 ? siblings[siblings.length - 1].id : ruleNodeId;
  insertAfter(
    g.nodes,
    g.nodes.findIndex((n) => n.id === anchor),
    c,
  );
  g.edges.push(edge(fresh(usedIds, "e"), c.id, t.id));
  const res = done(g);
  return res.ok ? { ...res, id: c.id } : res;
}

/** 받는 노드의 받는 종류를 바꾼다(속성 패널). CATCH_KINDS 순서로 정렬하고 겹친 것은 하나로. 비거나 같은 룰의 다른 받는 노드가 받는 종류면 거부한다. */
export function setCatchKinds(f: EditFlow, catchId: string, kinds: readonly CatchKind[]): EditResult {
  const g = clone(f);
  const c = findNode(g, catchId);
  if (!c || c.kind !== "CATCH") return fail(`받는 노드 ${catchId}를 찾지 못했다`);
  const sorted = CATCH_KINDS.filter((k) => kinds.includes(k));
  if (sorted.length === 0) return fail(CATCH_KINDS_EMPTY);
  if (c.attachTo) {
    for (const other of catchesOf(g, c.attachTo)) {
      if (other.id === catchId) continue;
      const clash = sorted.find((k) => (other.catches ?? []).includes(k));
      if (clash) return fail(CATCH_TAKEN(clash, other.id));
    }
  }
  c.catches = [...sorted];
  return done(g);
}

/**
 * 받는 노드를 붙은 룰 테두리의 다른 자리로 옮긴다(D-142, 캔버스 끌기). spot 이 null 이면 아래 변 기본 자리(R15)로 되돌린다.
 * 같은 자리면 편집을 만들지 않도록 입력 흐름을 그대로 돌려준다. 겹침 판정은 그린 크기를 아는 캔버스가 한다.
 * 받는 노드에서 나가는 선의 저장 경로(꺾는 점)는 지운다 — 예전 출발 자리에 맞춘 점이라 남기면 첫 구간이 사선이 된다. 지운 선은 자동 경로로 그린다.
 */
export function setCatchSpot(f: EditFlow, catchId: string, spot: CatchSpot | null): EditResult {
  const c = findNode(f, catchId);
  if (!c || c.kind !== "CATCH") return fail(`받는 노드 ${catchId}를 찾지 못했다`);
  const next = spot ? copyCatchSpot(spot) : null;
  const cur = f.view.catchSpots?.[catchId] ?? null;
  if (next?.side === cur?.side && next?.at === cur?.at) return { ok: true, flow: f };
  const g = clone(f);
  const spots = { ...(g.view.catchSpots ?? {}) };
  if (next) spots[catchId] = next;
  else delete spots[catchId];
  g.view = withStyles(g.view, g.view.styles ?? {}, g.view.descs ?? {}, catchSpotsFor(g.nodes, spots));
  dropRoutes(g, outOf(g, catchId));
  return done(g);
}

// ───────────────────────── 돌아오기(받는 노드 spec §8 「돌아오기」) ─────────────────────────

export const RETURN_ALREADY = "이미 흐름으로 돌아오는 처리 갈래다";
export const RETURN_OPEN = "처리 갈래가 끝 노드까지 이어지지 않아 돌아오게 할 수 없다";
export const RETURN_NO_EXIT = "룰의 나가는 선이 하나가 아니라 돌아올 자리를 정할 수 없다";

/**
 * 처리 갈래의 맨 바깥 순차에서 END 로 들어가는 선(빈 갈래면 받는 노드의 선) — 분기는 모이는 자리로(병렬은 합류 출구로), 돌아오는 자리가 있는 단계는 그 자리로
 * 건너뛴다(안쪽 갈래는 보지 않는다). 순환·나가는 선이 하나가 아닌 노드·모이는 자리를 못 정하면 null.
 */
function outerEndEdge(g: EditFlow, c: FlowNode): FlowEdge | null {
  const endId = endIdOf(g);
  const seen = new Set<string>();
  let cur: FlowNode | undefined = c;
  while (cur) {
    if (seen.has(cur.id)) return null;
    seen.add(cur.id);
    let via: FlowEdge | null = null;
    let next: string;
    if (isSplitKind(cur.kind)) {
      const j = joinOf(g, cur.id);
      if (j == null) return null;
      if (cur.kind === "PARALLEL" || mergeOf(g, cur.id) !== null) {
        const exits = outOf(g, j);
        if (exits.length !== 1) return null;
        via = exits[0];
        next = via.to;
      } else next = j;
    } else {
      const back = isStep(cur.kind) ? returnOf(g, cur.id) : null;
      if (back !== null) next = back;
      else {
        const outs = outOf(g, cur.id);
        if (outs.length !== 1) return null;
        via = outs[0];
        next = via.to;
      }
    }
    if (next === endId) return via;
    cur = findNode(g, next);
  }
  return null;
}

/**
 * 받는 노드 우클릭 「흐름으로 돌아오기」(§8.2) — 끝내는 처리 갈래의 맨 바깥 끝 선을 돌아올 자리로 옮긴다. 처리 갈래 안 IF 의 끝내는 갈래 끝 선은 그대로다.
 * 돌아올 자리는 그 노드의 돌아오는 자리(있으면), 없으면 노드의 나가는 선 도착. 그 도착이 END 면 거부(RETURN_TO_END, J-D10). 메뉴는 이 연산이 될 때만 항목을 보인다.
 */
export function returnCatch(f: EditFlow, catchId: string): EditResult {
  const g = clone(f);
  const c = findNode(g, catchId);
  if (!c || c.kind !== "CATCH") return fail(`받는 노드 ${catchId}를 찾지 못했다`);
  const host = c.attachTo == null ? undefined : findNode(g, c.attachTo);
  if (!host || !CATCHABLE.has(host.kind)) return fail(CATCH_ONLY_RULE);
  const endId = endIdOf(g);
  const target = handlerTarget(g, catchId);
  if (target === null) return fail(RETURN_OPEN);
  if (target !== endId) return fail(RETURN_ALREADY);
  const outs = outOf(g, host.id);
  const place = returnOf(g, host.id) ?? (outs.length === 1 ? outs[0].to : null);
  if (place === null) return fail(RETURN_NO_EXIT);
  if (place === endId) return fail(RETURN_TO_END);
  const tail = outerEndEdge(g, c);
  if (!tail) return fail(RETURN_OPEN);
  tail.to = place;
  dropRoutes(g, [tail]);
  return done(g);
}
