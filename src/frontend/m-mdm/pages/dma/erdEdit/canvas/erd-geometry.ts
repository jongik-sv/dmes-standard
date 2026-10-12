/**
 * ERD 캔버스 기하(순수) — 노드 크기, 관계선이 나갈 변, 끝 모양 경로(스펙 2.2: 부모 "1" 이중 막대, 자식 "0..N" 까마귀발).
 * 끝 모양은 선의 끝 점(end, 노드에 닿는 점)과 바로 앞 점(inner)으로 방향을 정한다. 직교 꺾은선이라 끝 구간은 늘 수평이다.
 */
import type { FlowPos } from "@dk-oasis/shared/react-flow";

import type { ErdColumn } from "../types";

export const NODE_WIDTH = 240;
export const HEADER_HEIGHT = 30;
export const ROW_HEIGHT = 20;
/** 이 확대율 미만이면 노드는 이름만 그린다(스펙 8절). */
export const ZOOM_NAMES_ONLY = 0.5;
/** 이 확대율 미만이면 개요 단계 — 노드는 원래 높이 상자에 논리명·물리명 두 줄(U50). ErdViewer FIRST_FIT_MIN_ZOOM 과 같은 값. */
export const ZOOM_OVERVIEW = 0.35;
/** 단계별 그리기(U50) — detail(≥ 0.5) 그대로, names(0.35 이상 0.5 미만) 이름만, overview(0.35 미만) 이름판 상자. */
export type LodTier = "detail" | "names" | "overview";
export function lodTier(zoom: number): LodTier {
  return zoom >= ZOOM_NAMES_ONLY ? "detail" : zoom >= ZOOM_OVERVIEW ? "names" : "overview";
}
/** 개요·이름만 단계 글자의 화면 기준 크기(px). CSS 는 calc(12px / var(--erd-zoom)) 로 쓴다(erd-edit-styles.ts 와 같은 값). */
export const OVERVIEW_FONT_PX = 12;
/** 개요 글자 크기의 흐름 단위 상한(px). 배율 0.2 미만이면 화면 글자가 이보다 작아진다. */
export const OVERVIEW_FONT_MAX_FLOW = 60;
/** 손잡이에서 첫 꺾임까지 거리. 끝 모양(최대 22px)이 꺾임에 걸리지 않게 둔다. */
export const END_STUB = 28;

export type NodeSide = "L" | "R";

/** 노드 높이 추정(측정 전 initialHeight·화면 맞춤용). 테두리 2px 포함. */
export function nodeHeight(rows: number, more: boolean): number {
  return HEADER_HEIGHT + rows * ROW_HEIGHT + (more ? ROW_HEIGHT : 0) + 2;
}

// ── 표 크기(§7.4) ──

/** 서버 범위(resizeNodes) — 정수, 벗어나면 INVALID. */
export const NODE_W_MIN = 160;
export const NODE_W_MAX = 1600;
export const NODE_H_MIN = 52;
export const NODE_H_MAX = 4000;
/** 높이를 자동보다 줄였을 때 가려진 컬럼이 있으면 상자 아래에 붙는 「▾ N개 더」 막대의 높이. */
export const CLIP_BAR_HEIGHT = ROW_HEIGHT;

const clampTo = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(n)));
export const clampNodeW = (w: number): number => clampTo(w, NODE_W_MIN, NODE_W_MAX);
export const clampNodeH = (h: number): number => clampTo(h, NODE_H_MIN, NODE_H_MAX);

/**
 * 저장 높이 h(null = 자동)로 줄였을 때 일반 컬럼 가운데 처음부터 보이는 수와 가려지는 수(스크롤 위치 0 기준).
 * PK 묶음(keyRows)은 머리 아래에 고정이라 늘 보인다. 가려지는 컬럼이 있으면 아래 막대(CLIP_BAR_HEIGHT)가 한 줄을 차지한다.
 * 자동 높이 이상이거나 일반 컬럼이 없으면 가려지는 것이 없다. DOM 을 재지 않는 순수 계산이라 화면·buildFlow 가 같은 답을 낸다.
 */
export function bodyLayout(h: number | null, keyRows: number, bodyRows: number): { visible: number; hidden: number } {
  if (h === null || bodyRows === 0 || h >= nodeHeight(keyRows + bodyRows, false)) return { visible: bodyRows, hidden: 0 };
  const space = h - 2 - HEADER_HEIGHT - keyRows * ROW_HEIGHT - CLIP_BAR_HEIGHT;
  const visible = Math.max(0, Math.min(bodyRows, Math.floor(space / ROW_HEIGHT)));
  return { visible, hidden: bodyRows - visible };
}

/**
 * 이 표를 끌어 줄일 수 있는 가장 낮은 높이. 서버 범위(52)가 바닥이지만, 머리 + 고정된 PK 묶음 + 스크롤 줄 하나 + 「▾ N개 더」 막대 + 테두리가
 * 상자 밖으로 넘치면 안 된다. 일반 컬럼이 없거나 하나뿐이면 줄일 것이 없으니 자동 높이가 바닥이다(막대 없이 넘침 없이).
 */
export function minNodeHeight(keyRows: number, bodyRows: number): number {
  const auto = nodeHeight(keyRows + bodyRows, false);
  return Math.max(NODE_H_MIN, Math.min(auto, nodeHeight(keyRows + 1, false) + CLIP_BAR_HEIGHT));
}

/** 오른쪽 변(e)·아래 변(s)·오른쪽 아래 모서리(se) 손잡이. */
export type SizeGrip = "e" | "s" | "se";
export const SIZE_GRIPS: readonly SizeGrip[] = ["e", "s", "se"];

/** 손잡이 grip 을 흐름 좌표 (dx, dy) 만큼 끈 크기 — 정수로 반올림해 범위로 자른다(높이는 minH 아래로 내리지 않는다). 끌지 않는 방향은 base 그대로. */
export function dragSize(
  base: { w: number; h: number }, grip: SizeGrip, dx: number, dy: number, minH: number = NODE_H_MIN,
): { w: number; h: number } {
  return {
    w: grip.includes("e") ? clampNodeW(base.w + dx) : base.w,
    h: grip.includes("s") ? Math.max(minH, clampNodeH(base.h + dy)) : base.h,
  };
}

/** 끄는 중인 크기. null = 그 방향 자동. */
export interface SizeDraft {
  id: string;
  w: number | null;
  h: number | null;
}

/** 손잡이를 누른 이벤트에서 쓰는 것만(React 의존 없이). */
export interface GripPress {
  button: number;
  clientX: number;
  clientY: number;
  preventDefault(): void;
  stopPropagation(): void;
}

/**
 * 표 크기 버스 — 캔버스(xyflow store)마다 하나. 끄는 동안의 크기(draft)는 여기에만 두고 그 표 노드만 구독한다(캔버스 전체를 다시 그리지 않는다,
 * Local-Rules §19). 노드 데이터에 콜백을 넣지 않으려고 누르기·펴기 처리도 여기로 받는다(useCanvasEditing 이 등록).
 */
export interface SizeBus {
  draft: SizeDraft | null;
  listeners: Set<() => void>;
  start: ((e: GripPress, id: string, grip: SizeGrip) => void) | null;
  expand: ((id: string) => void) | null;
}

const sizeBuses = new WeakMap<object, SizeBus>();

/** 이 캔버스(xyflow store)의 버스. 없으면 만든다. 열쇠는 store.getState 함수(캔버스마다 하나, routeBusOf 와 같다). */
export function sizeBusOf(store: { getState: unknown }): SizeBus {
  const key = store.getState as object;
  let b = sizeBuses.get(key);
  if (!b) {
    b = { draft: null, listeners: new Set(), start: null, expand: null };
    sizeBuses.set(key, b);
  }
  return b;
}

/** 끄는 중 크기를 바꾸고 구독자에게 알린다. 같으면 아무것도 하지 않는다(참조도 그대로). */
export function setSizeDraft(bus: SizeBus, draft: SizeDraft | null): void {
  const cur = bus.draft;
  if (cur === draft || (cur && draft && cur.id === draft.id && cur.w === draft.w && cur.h === draft.h)) return;
  bus.draft = draft;
  for (const l of bus.listeners) l();
}

/**
 * 표 손잡이 점이 상자 변에서 바깥으로 나온 거리(px). 손잡이가 4px 이고 변에 걸쳐 있어(erd-styles.ts .erd-handle) 왼쪽 점은 상자 왼쪽 -2,
 * 오른쪽 점은 상자 오른쪽 +2 에 선다.
 */
export const HANDLE_REACH = 2;
/**
 * 두 상자 사이 빈 가로 폭이 이 값을 넘어야 마주 보는 변을 쓴다. 이 값 이하(0 포함)는 맞닿거나 거의 붙은 상태라 마주 보는 선이 그릴 자리가 없다.
 * 좁은 틈(이 값 초과)은 마주 보게 두고 끝 꼬리(END_STUB)를 틈에 맞춰 줄인다(endStub). 같은 변으로 돌리면 ㄷ 모양이 이웃 상자를 가로지르기 때문이다.
 * 끄는 칸이 격자 10px 이라 이 값(8) 이하는 사실상 빈 폭 0(맞닿음)뿐이다.
 */
export const FACING_MIN_GAP = 8;

/**
 * 마주 보는 두 끝의 곧은 꼬리 길이. 두 손잡이 점 사이 폭(handleGap)의 절반에서 HANDLE_REACH 를 빼 두 꼬리 사이에 가운데 꺾임 자리를 남긴다.
 * 넉넉하면 END_STUB, 좁으면 줄어들고, 0 아래로는 내려가지 않는다. 같은 변(ㄷ 모양)에는 쓰지 않는다.
 */
export function endStub(handleGap: number): number {
  return Math.max(0, Math.min(END_STUB, handleGap / 2 - HANDLE_REACH));
}

/**
 * 관계선이 붙는 변(상자 왼쪽 x 와 너비로 정한다, 너비를 주지 않으면 NODE_WIDTH).
 * - 띠 ① 빈 폭 > FACING_MIN_GAP(8): 마주 보는 변 — 왼쪽 표는 오른쪽 변, 오른쪽 표는 왼쪽 변. 자식이 어느 쪽이든 같다.
 *   틈이 END_STUB 두 개와 손잡이 두 개(2 * (END_STUB + HANDLE_REACH) = 60)보다 좁아도 마주 보고, 꼬리를 endStub 으로 줄여 겹침을 피한다.
 * - 띠 ② 가로로 겹치거나 빈 폭이 FACING_MIN_GAP 이하(위아래로 쌓인 표)면 둘 다 오른쪽 변 — 선이 ㄷ 모양으로 상자 밖을 돌아 들어간다.
 *   너비가 같아 왼쪽 변을 쓰나 오른쪽 변을 쓰나 돌아가는 길이가 같다(둘 다 |x 차이|). 고르는 기준이 없으니 한 쪽으로 고정한다.
 *   x 부호로 고르면 x 가 같은 자리(자동 배치 뒤 같은 열)에서 선이 갑자기 거울상으로 뒤집힌다.
 * - 경계 띠: 판정은 빈 폭만 보는 상태 없는 함수라 끄는 동안 FACING_MIN_GAP 을 지나며 바뀌는 곳은 한 군데뿐이고 되돌아 떨리지 않는다.
 * - 자기 참조는 둘 다 오른쪽(시안).
 */
export function relationSides(
  childX: number, parentX: number, self: boolean, childW: number = NODE_WIDTH, parentW: number = NODE_WIDTH,
): { child: NodeSide; parent: NodeSide } {
  if (self) return { child: "R", parent: "R" };
  // 두 상자 사이 빈 폭 = 왼쪽 상자 오른쪽 변에서 오른쪽 상자 왼쪽 변까지(표 크기를 바꾸면 너비가 다르다, §7.4). 너비가 같으면 |x 차이| - 너비.
  const gap = childX < parentX ? parentX - (childX + childW) : childX - (parentX + parentW);
  if (gap <= FACING_MIN_GAP) return { child: "R", parent: "R" };
  return childX < parentX ? { child: "R", parent: "L" } : { child: "L", parent: "R" };
}

/** 사용자가 고른 끝점 변(§7.5). 키가 없는 끝은 자동(relationSides). */
export interface FixedSides {
  child?: NodeSide;
  parent?: NodeSide;
}

/** 자동 변에 고른 변을 덮는다. 자기 참조는 고를 수 없어 자동 그대로다. */
export function withFixedSides(auto: { child: NodeSide; parent: NodeSide }, fixed: FixedSides | null | undefined): { child: NodeSide; parent: NodeSide } {
  if (!fixed || (!fixed.child && !fixed.parent)) return auto;
  return { child: fixed.child ?? auto.child, parent: fixed.parent ?? auto.parent };
}

/** 끝점을 놓은 흐름 x 가 붙을 변 — 표 가운데보다 왼쪽이면 L, 아니면 R(§7.5). */
export function sideAt(x: number, left: number, width: number = NODE_WIDTH): NodeSide {
  return x < left + width / 2 ? "L" : "R";
}

/**
 * 끝점 하나를 dropped 변에 놓은 뒤 저장할 변 — 자동 변과 같으면 그 끝은 지정 해제(키 없음), 다르면 그 변으로 지정한다.
 * 지금 저장 값과 같으면 null(명령 없음).
 */
export function nextFixedSides(
  fixed: FixedSides, end: "child" | "parent", dropped: NodeSide, auto: { child: NodeSide; parent: NodeSide },
): FixedSides | null {
  const value = dropped === auto[end] ? undefined : dropped;
  if (fixed[end] === value) return null;
  const out: FixedSides = { ...fixed };
  if (value) out[end] = value;
  else delete out[end];
  return out;
}

/**
 * 변을 바꾼 끝에 맞춰 저장 꺾임점을 고친다(§7.5). src·tgt = 새 변 기준 양 끝(자식 끝·부모 끝), side = 바꾼 끝의 새 변.
 * 그 끝에 가장 가까운 점(자식 = 첫 점, 부모 = 끝 점)이 새 변의 바깥쪽(END_STUB 이상)에 있으면 점을 두고, 높이가 다르면 끝에서 수평으로 나가 꺾이는
 * 모서리 점을 하나 끼운다. 바깥쪽이 아니면(선이 표를 가로지른다) null = 점을 비운다. 모서리 점을 끼우면 상한(max)을 넘으면 끼우지 않는다
 * (끝 마디가 비스듬해진다 — 점을 잃는 것보다 낫다).
 */
export function refitRouteEnd(
  points: readonly FlowPos[], end: "child" | "parent", side: NodeSide, src: FlowPos, tgt: FlowPos, max: number,
): FlowPos[] | null {
  if (points.length === 0) return null;
  const at = end === "child" ? src : tgt;
  const near = end === "child" ? points[0] : points[points.length - 1];
  const outward = side === "L" ? near.x <= at.x - END_STUB : near.x >= at.x + END_STUB;
  if (!outward) return null;
  const y = Math.round(at.y);
  const corner = near.y === y || points.length + 1 > max ? [] : [{ x: near.x, y }];
  const out = end === "child" ? [...corner, ...points] : [...points, ...corner];
  return out.map((p) => ({ x: p.x, y: p.y }));
}

export interface LiveEnd {
  /** 손잡이 점의 흐름 x. */
  x: number;
  position: "left" | "right";
}

/** 노드 가운데를 기준으로 x 를 접는다 — 같은 높이의 반대편 손잡이 점. */
const mirrorX = (x: number, left: number, width: number = NODE_WIDTH): number => 2 * (left + width / 2) - x;

/**
 * 끄는 동안 관계선 양 끝(원천 = 자식, 대상 = 부모)을 규칙(relationSides)에 맞춘다. 손잡이 id 는 모델에서 정해진 채라서
 * (buildFlow 는 놓은 뒤에야 다시 짠다) 끄는 중에는 손잡이와 규칙이 어긋날 수 있다. 어긋난 끝은 상자 가운데로 접어 반대편 변에 붙인다 —
 * 높이(y)는 같으므로 손잡이가 없는 쪽도 정확한 점이 된다. x 는 각 끝 노드의 현재 왼쪽 x(srcLeft·tgtLeft)와 손잡이 점이 같은 시점 값이어야 한다.
 * fixed = 고른 끝점 변(§7.5). 고른 끝은 위치와 관계없이 그 변에 붙는다.
 */
export function liveEnds(
  source: LiveEnd, srcLeft: number, target: LiveEnd, tgtLeft: number, srcWidth: number = NODE_WIDTH, tgtWidth: number = NODE_WIDTH,
  fixed?: FixedSides | null,
): { source: LiveEnd; target: LiveEnd } {
  const sides = withFixedSides(relationSides(srcLeft, tgtLeft, false, srcWidth, tgtWidth), fixed);
  const fit = (end: LiveEnd, left: number, width: number, side: NodeSide): LiveEnd => {
    const position = side === "R" ? "right" : "left";
    return end.position === position ? end : { x: mirrorX(end.x, left, width), position };
  };
  return { source: fit(source, srcLeft, srcWidth, sides.child), target: fit(target, tgtLeft, tgtWidth, sides.parent) };
}

/** 소수 둘째 자리까지. -0 은 0 으로 쓴다. */
const num = (n: number): string => String(Math.round(n * 100) / 100 || 0);

function frame(end: FlowPos, inner: FlowPos): { u: FlowPos; n: FlowPos } {
  const dx = end.x - inner.x;
  const dy = end.y - inner.y;
  const len = Math.hypot(dx, dy) || 1;
  const u = { x: dx / len, y: dy / len };
  return { u, n: { x: -u.y, y: u.x } };
}

/** 자식 끝 까마귀발(N) — 끝에서 depth 안쪽 한 점에서 끝의 양옆 size 로 벌어지는 두 선. */
export function crowFootPath(end: FlowPos, inner: FlowPos, size = 6, depth = 12): string {
  const { u, n } = frame(end, inner);
  const b = { x: end.x - u.x * depth, y: end.y - u.y * depth };
  return `M ${num(b.x)} ${num(b.y)} L ${num(end.x + n.x * size)} ${num(end.y + n.y * size)} `
    + `M ${num(b.x)} ${num(b.y)} L ${num(end.x - n.x * size)} ${num(end.y - n.y * size)}`;
}

/** 부모 끝 이중 막대("1") — 끝에서 6px·10px 안쪽을 가로지르는 선 둘. */
export function oneBarsPath(end: FlowPos, inner: FlowPos, size = 6): string {
  const { u, n } = frame(end, inner);
  return [6, 10]
    .map((d) => {
      const p = { x: end.x - u.x * d, y: end.y - u.y * d };
      return `M ${num(p.x + n.x * size)} ${num(p.y + n.y * size)} L ${num(p.x - n.x * size)} ${num(p.y - n.y * size)}`;
    })
    .join(" ");
}

/** 자식 쪽 "0"(선택) 원의 가운데 — 까마귀발 바로 바깥. */
export function zeroCirclePos(end: FlowPos, inner: FlowPos, gap = 18): FlowPos {
  const { u } = frame(end, inner);
  return { x: Number(num(end.x - u.x * gap)), y: Number(num(end.y - u.y * gap)) };
}

/** 타입 글자 — VARCHAR2(30), NUMBER(10,2), DATE. */
export function typeText(c: Pick<ErdColumn, "dataType" | "length" | "scale">): string {
  if (!c.dataType) return "";
  if (c.length == null) return c.dataType;
  return c.scale == null ? `${c.dataType}(${c.length})` : `${c.dataType}(${c.length},${c.scale})`;
}
