/**
 * 선 경로 편집(3단계 계획 Task 15, C14) 순수 함수 — React 의존이 없다.
 * `pts` 는 시작 손잡이 → 꺾는 점들 → 끝 손잡이 전체 꺾은선이다(흐름 좌표).
 * 4단계 W1: 자동 경로 점(xyflow getPoints 이식)·선분 손잡이.
 */
import type { FlowPos } from "../flow-edit";

const dist = (a: FlowPos, b: FlowPos) => Math.hypot(b.x - a.x, b.y - a.y);
const num = (n: number) => String(Math.round(n * 100) / 100);

/**
 * 모서리를 반경 `radius` 로 둥글린 꺾은선 SVG path. 꺾임마다 반경은 앞뒤 구간 길이의 절반을 넘지 않는다.
 * 길이 0 구간이 붙은 꼭짓점은 꺾지 않고 지나간다. 점이 2개 미만이면 빈 문자열.
 */
export function routePath(pts: readonly FlowPos[], radius: number): string {
  if (pts.length < 2) return "";
  const out = [`M ${num(pts[0].x)} ${num(pts[0].y)}`];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const a = dist(pts[i - 1], p);
    const b = dist(p, pts[i + 1]);
    const r = Math.min(radius, a / 2, b / 2);
    if (!(r > 0)) {
      out.push(`L ${num(p.x)} ${num(p.y)}`);
      continue;
    }
    const inX = (p.x - pts[i - 1].x) / a;
    const inY = (p.y - pts[i - 1].y) / a;
    const outX = (pts[i + 1].x - p.x) / b;
    const outY = (pts[i + 1].y - p.y) / b;
    out.push(`L ${num(p.x - inX * r)} ${num(p.y - inY * r)}`, `Q ${num(p.x)} ${num(p.y)} ${num(p.x + outX * r)} ${num(p.y + outY * r)}`);
  }
  const last = pts[pts.length - 1];
  out.push(`L ${num(last.x)} ${num(last.y)}`);
  return out.join(" ");
}

/** 꺾은선 길이의 가운데 점(라벨·[+]·변수 칩 자리). 길이가 0이면 첫 점. */
export function routeMidpoint(pts: readonly FlowPos[]): FlowPos {
  if (pts.length === 0) return { x: 0, y: 0 };
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  if (!(total > 0)) return { x: pts[0].x, y: pts[0].y };
  let left = total / 2;
  for (let i = 1; i < pts.length; i++) {
    const len = dist(pts[i - 1], pts[i]);
    if (left <= len && len > 0) {
      const t = left / len;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    left -= len;
  }
  return { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y };
}

function distToSegment(p: FlowPos, a: FlowPos, b: FlowPos): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** 누른 자리 `at` 에서 가장 가까운 구간(시작→점들→끝)에 꺾는 점을 끼운 새 목록. 같은 거리면 앞 구간. 입력은 바뀌지 않는다. */
export function insertRoutePoint(points: readonly FlowPos[], source: FlowPos, target: FlowPos, at: FlowPos): FlowPos[] {
  const full = [source, ...points, target];
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < full.length - 1; i++) {
    const d = distToSegment(at, full[i], full[i + 1]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const next = points.map((p) => ({ x: p.x, y: p.y }));
  next.splice(best, 0, { x: at.x, y: at.y });
  return next;
}

// ───────────────────────── 4단계 W1 — 자동 경로 점·선분 손잡이 ─────────────────────────

/** 연결점 변 — React Flow `Position` 문자열 값과 같다(`Position` 값을 그대로 넘길 수 있다). */
export type Side = "left" | "top" | "right" | "bottom";
/** 선 경로 모서리 반경 — 자동 경로(`getSmoothStepPath` borderRadius)와 저장 경로(`routePath`)가 같은 값을 쓴다. */
export const ROUTE_RADIUS = 8;
/** 자동 경로가 연결점에서 곧게 나오는 길이 — `getSmoothStepPath` 기본 offset. */
export const AUTO_ROUTE_OFFSET = 20;
/** 노드에 붙은 선분을 옮길 때 노드 쪽에 끼우는 짧은 선분 길이(흐름 좌표, 스펙 §3.2). 선분 길이의 1/3 을 넘지 않는다. */
export const ROUTE_STUB = 20;
/** 선분 손잡이를 두는 가장 짧은 선분(화면 px). */
export const SEGMENT_MIN_PX = 28;
/** 선분 막대·자동 점 손잡이가 라벨·[+] 자리에서 비키는 거리(화면 px). */
export const SEGMENT_CLEAR_PX = 24;
/** 끄는 선분을 이웃과 일직선으로 맞추는 거리(화면 px). */
export const SEGMENT_SNAP_PX = 6;

export interface SmoothStepInput {
  sourceX: number;
  sourceY: number;
  sourcePosition: Side;
  targetX: number;
  targetY: number;
  targetPosition: Side;
  offset?: number;
  stepPosition?: number;
}

/*
 * smoothStepPoints·DIRS·stepDirection 은 @xyflow/system@0.0.83 의 getPoints·handleDirections·getDirection
 * (dist/esm/index.js 1223~1361행)을 옮긴 것이다. MIT License, Copyright (c) 2019-2025 webkid GmbH.
 * getPoints 는 공개 API 가 아니라 그대로 옮겼다. 선 그리기는 여전히 getSmoothStepPath 가 하므로 xyflow 를 올리면
 * route-segment.test.ts 의 64경우 견주기가 어긋남을 잡는다. 라벨 자리(centerX·centerY)와 getEdgeCenter(반환 오프셋에만 쓰인다)는 옮기지 않았다.
 */
const DIRS: Readonly<Record<Side, FlowPos>> = { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } };

function stepDirection(source: FlowPos, sourcePosition: Side, target: FlowPos): FlowPos {
  if (sourcePosition === "left" || sourcePosition === "right") return source.x < target.x ? { x: 1, y: 0 } : { x: -1, y: 0 };
  return source.y < target.y ? { x: 0, y: 1 } : { x: 0, y: -1 };
}

/** 자동 꺾은선의 점 전체(양 끝 포함) — `getSmoothStepPath` 가 꺾임을 그리는 점과 같다. */
export function smoothStepPoints({
  sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, offset = AUTO_ROUTE_OFFSET, stepPosition = 0.5,
}: SmoothStepInput): FlowPos[] {
  const source = { x: sourceX, y: sourceY };
  const target = { x: targetX, y: targetY };
  const sourceDir = DIRS[sourcePosition];
  const targetDir = DIRS[targetPosition];
  const sourceGapped = { x: source.x + sourceDir.x * offset, y: source.y + sourceDir.y * offset };
  const targetGapped = { x: target.x + targetDir.x * offset, y: target.y + targetDir.y * offset };
  const dir = stepDirection(sourceGapped, sourcePosition, targetGapped);
  const acc: "x" | "y" = dir.x !== 0 ? "x" : "y";
  const currDir = dir[acc];
  let points: FlowPos[];
  const sourceGapOffset = { x: 0, y: 0 };
  const targetGapOffset = { x: 0, y: 0 };
  if (sourceDir[acc] * targetDir[acc] === -1) {
    const centerX = acc === "x" ? sourceGapped.x + (targetGapped.x - sourceGapped.x) * stepPosition : (sourceGapped.x + targetGapped.x) / 2;
    const centerY = acc === "x" ? (sourceGapped.y + targetGapped.y) / 2 : sourceGapped.y + (targetGapped.y - sourceGapped.y) * stepPosition;
    const verticalSplit = [{ x: centerX, y: sourceGapped.y }, { x: centerX, y: targetGapped.y }];
    const horizontalSplit = [{ x: sourceGapped.x, y: centerY }, { x: targetGapped.x, y: centerY }];
    if (sourceDir[acc] === currDir) points = acc === "x" ? verticalSplit : horizontalSplit;
    else points = acc === "x" ? horizontalSplit : verticalSplit;
  } else {
    const sourceTarget = [{ x: sourceGapped.x, y: targetGapped.y }];
    const targetSource = [{ x: targetGapped.x, y: sourceGapped.y }];
    if (acc === "x") points = sourceDir.x === currDir ? targetSource : sourceTarget;
    else points = sourceDir.y === currDir ? sourceTarget : targetSource;
    if (sourcePosition === targetPosition) {
      const diff = Math.abs(source[acc] - target[acc]);
      if (diff <= offset) {
        const gapOffset = Math.min(offset - 1, offset - diff);
        if (sourceDir[acc] === currDir) sourceGapOffset[acc] = (sourceGapped[acc] > source[acc] ? -1 : 1) * gapOffset;
        else targetGapOffset[acc] = (targetGapped[acc] > target[acc] ? -1 : 1) * gapOffset;
      }
    } else {
      const opp: "x" | "y" = acc === "x" ? "y" : "x";
      const isSameDir = sourceDir[acc] === targetDir[opp];
      const gt = sourceGapped[opp] > targetGapped[opp];
      const lt = sourceGapped[opp] < targetGapped[opp];
      const flip = (sourceDir[acc] === 1 && ((!isSameDir && gt) || (isSameDir && lt))) || (sourceDir[acc] !== 1 && ((!isSameDir && lt) || (isSameDir && gt)));
      if (flip) points = acc === "x" ? sourceTarget : targetSource;
    }
  }
  const gs = { x: sourceGapped.x + sourceGapOffset.x, y: sourceGapped.y + sourceGapOffset.y };
  const gt2 = { x: targetGapped.x + targetGapOffset.x, y: targetGapped.y + targetGapOffset.y };
  const first = points[0];
  const last = points[points.length - 1];
  return [
    source,
    ...(gs.x !== first.x || gs.y !== first.y ? [gs] : []),
    ...points,
    ...(gt2.x !== last.x || gt2.y !== last.y ? [gt2] : []),
    target,
  ];
}

const SAME_EPS = 0.01;
const LINE_EPS = 0.01;
/** 가로·세로 판정 허용치(흐름 좌표). dagre 좌표의 0.5 반올림 차이를 가로·세로로 본다. */
const AXIS_EPS = 0.5;
const copyPt = (p: FlowPos): FlowPos => ({ x: p.x, y: p.y });
const samePoint = (a: FlowPos, b: FlowPos) => Math.abs(a.x - b.x) < SAME_EPS && Math.abs(a.y - b.y) < SAME_EPS;
/** a·b·c 가 한 직선 위인가(b 가 a·c 사이가 아니어도 — 같은 직선으로 되돌아가는 점도 뺀다). */
const collinear = (a: FlowPos, b: FlowPos, c: FlowPos) =>
  Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <= LINE_EPS * Math.max(1, dist(a, c));
const lerp = (a: FlowPos, b: FlowPos, t: number): FlowPos => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
const nearest = (p: FlowPos, avoid: readonly FlowPos[]) => avoid.reduce((m, q) => Math.min(m, dist(p, q)), Infinity);

export const roundPoint = (p: FlowPos): FlowPos => ({ x: Math.round(p.x), y: Math.round(p.y) });

/** 양 끝을 남기고 겹친 점·한 직선 위 가운데 점을 뺀 새 목록(스펙 §3.2 합치기). 입력은 바뀌지 않는다. */
export function simplifyRoute(full: readonly FlowPos[]): FlowPos[] {
  if (full.length <= 2) return full.map(copyPt);
  const out: FlowPos[] = [copyPt(full[0])];
  for (let k = 1; k < full.length; k++) {
    const p = full[k];
    const end = k === full.length - 1;
    if (samePoint(out[out.length - 1], p)) {
      if (!end) continue;
      if (out.length > 1) out.pop(); // 끝점과 겹친 안쪽 점을 빼고 끝점을 넣는다
    }
    while (out.length >= 2 && collinear(out[out.length - 2], out[out.length - 1], p)) out.pop();
    out.push(copyPt(p));
  }
  return out;
}

/** 자동 경로의 꺾는 점(양 끝 제외) — 손잡이와 저장 경로 바꾸기에 쓴다. 그리기는 여전히 getSmoothStepPath 다. */
export function autoRoute(p: SmoothStepInput): FlowPos[] {
  return simplifyRoute(smoothStepPoints(p)).slice(1, -1);
}

/** 놓을 때 저장할 꺾는 점 — 꺾는 점을 정수로 반올림한 뒤 정리한다(양 끝은 노드 연결점이라 반올림하지 않는다). */
export function finishRoute(source: FlowPos, points: readonly FlowPos[], target: FlowPos): FlowPos[] {
  return simplifyRoute([source, ...points.map(roundPoint), target]).slice(1, -1);
}

export type SegmentAxis = "h" | "v";
export interface SegmentHandle {
  /** `full[index] → full[index + 1]` 선분. */
  index: number;
  axis: SegmentAxis;
  /** 막대 가운데(흐름 좌표). */
  at: FlowPos;
}

/** 가로(h)·세로(v) 선분인가. 대각선·길이 0 은 null. */
export function segmentAxis(a: FlowPos, b: FlowPos): SegmentAxis | null {
  const h = Math.abs(a.y - b.y) < AXIS_EPS;
  const v = Math.abs(a.x - b.x) < AXIS_EPS;
  if (h === v) return null;
  return h ? "h" : "v";
}

/** 점 p 가 비킬 자리들(라벨·[+])에서 화면 SEGMENT_CLEAR_PX 이상 떨어졌는가. */
export function isClear(p: FlowPos, avoid: readonly FlowPos[], zoom: number): boolean {
  return nearest(p, avoid) >= SEGMENT_CLEAR_PX / (zoom > 0 ? zoom : 1);
}

/**
 * 선분 손잡이 자리(스펙 §3.1) — 가로·세로이고 화면 SEGMENT_MIN_PX 이상인 선분의 가운데. 가운데가 라벨·[+] 에서 가까우면
 * 1/4 지점(비킬 자리에서 먼 쪽, 같으면 출발 쪽)으로 옮기고, 그 자리도 가까우면 그 선분에는 막대를 두지 않는다.
 */
export function segmentHandles(full: readonly FlowPos[], zoom: number, avoid: readonly FlowPos[]): SegmentHandle[] {
  const k = zoom > 0 ? zoom : 1;
  const out: SegmentHandle[] = [];
  for (let i = 0; i < full.length - 1; i++) {
    const a = full[i];
    const b = full[i + 1];
    const axis = segmentAxis(a, b);
    if (!axis || dist(a, b) * k < SEGMENT_MIN_PX) continue;
    let at = lerp(a, b, 0.5);
    if (!isClear(at, avoid, k)) {
      const q1 = lerp(a, b, 0.25);
      const q3 = lerp(a, b, 0.75);
      at = nearest(q3, avoid) > nearest(q1, avoid) ? q3 : q1;
      if (!isClear(at, avoid, k)) continue;
    }
    out.push({ index: i, axis, at });
  }
  return out;
}

/**
 * 선분 index 를 선분에 수직으로 delta 만큼 옮긴 꺾는 점(스펙 §3.2). 양 끝 점이 따라가 이웃 선분은 길이만 바뀐다.
 * 노드에 붙은 첫·끝 선분은 노드 쪽 끝이 고정이라 노드에서 stub(선분 길이의 1/3 을 넘지 않게) 나온 짧은 선분과 꺾임을 끼운다.
 * 가로·세로가 아닌 선분·없는 선분은 null. 입력은 바뀌지 않는다.
 */
export function moveSegment(full: readonly FlowPos[], index: number, delta: number, stub = ROUTE_STUB): { points: FlowPos[]; seg: number } | null {
  const a = full[index];
  const b = full[index + 1];
  if (!a || !b) return null;
  const axis = segmentAxis(a, b);
  if (!axis) return null;
  const shift = (p: FlowPos): FlowPos => (axis === "h" ? { x: p.x, y: p.y + delta } : { x: p.x + delta, y: p.y });
  const len = dist(a, b);
  const s = Math.min(stub, len / 3);
  const last = full.length - 1;
  const pts = full.map(copyPt);
  let seg = index;
  // 끝 쪽을 먼저 고친다(앞쪽에 점을 끼우면 뒤 번호가 밀린다).
  if (index + 1 === last) {
    const t1 = lerp(b, a, s / len);
    pts.splice(last, 0, shift(t1), t1);
  } else pts[index + 1] = shift(pts[index + 1]);
  if (index === 0) {
    const s1 = lerp(a, b, s / len);
    pts.splice(1, 0, s1, shift(s1));
    seg += 2;
  } else pts[index] = shift(pts[index]);
  return { points: pts.slice(1, -1), seg };
}

/** 꺾는 점 끌기 맞춤 안내선 — axis "x" 는 x = at 세로선(from~to 는 y), "y" 는 y = at 가로선(from~to 는 x). snap.ts 의 Guide 와 같은 모양. */
export interface RoutePointGuide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

/**
 * 꺾는 점 끌기 맞춤 — 끄는 점의 x·y 를 따로, 앞 이웃(앞 꺾는 점이나 시작 손잡이)·뒤 이웃(뒤 꺾는 점이나 끝 손잡이) 가운데 화면 SEGMENT_SNAP_PX 안에서
 * 가장 가까운 것의 좌표로 맞춘다. 맞으면 그 이웃과 이은 구간이 세로·가로 일직선(직각)이 된다. 맞은 축마다 끄는 점과 그 이웃을 잇는 안내선을 준다
 * (그 구간과 겹쳐 가려지지 않게 양 끝으로 ROUTE_GUIDE_OVERHANG 만큼 더 늘인다).
 * 이웃이 없거나(undefined) 가까운 후보가 없으면 점 그대로·안내선 없음.
 */
/** 꺾는 점 맞춤 안내선을 양 끝으로 더 늘이는 길이(흐름 좌표). */
export const ROUTE_GUIDE_OVERHANG = 24;
export function snapRoutePoint(
  at: FlowPos, prev: FlowPos | undefined, next: FlowPos | undefined, zoom: number,
): { point: FlowPos; guides: RoutePointGuide[] } {
  const limit = SEGMENT_SNAP_PX / (zoom > 0 ? zoom : 1);
  const near = (c: "x" | "y") => {
    let best: FlowPos | null = null;
    let bestD = limit;
    for (const n of [prev, next]) {
      if (!n) continue;
      const d = Math.abs(n[c] - at[c]);
      if (d <= bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  };
  const nx = near("x");
  const ny = near("y");
  const point = { x: nx ? nx.x : at.x, y: ny ? ny.y : at.y };
  const guides: RoutePointGuide[] = [];
  const o = ROUTE_GUIDE_OVERHANG;
  if (nx) guides.push({ axis: "x", at: point.x, from: Math.min(point.y, nx.y) - o, to: Math.max(point.y, nx.y) + o });
  if (ny) guides.push({ axis: "y", at: point.y, from: Math.min(point.x, ny.x) - o, to: Math.max(point.x, ny.x) + o });
  return { point, guides };
}

/**
 * 끄는 동안의 일직선 맞춤(스펙 §3.2) — 옮긴 선분이 앞 이웃의 시작점(full[index-1])이나 뒤 이웃의 끝점(full[index+2])과
 * 화면 SEGMENT_SNAP_PX 안이면 그 좌표로 맞춘 delta. 노드 연결점(양 끝)은 후보에서 뺀다. 가까운 후보가 없으면 delta 그대로.
 */
export function snapSegmentDelta(full: readonly FlowPos[], index: number, delta: number, zoom: number): number {
  const a = full[index];
  const b = full[index + 1];
  const axis = a && b ? segmentAxis(a, b) : null;
  if (!axis) return delta;
  const c: "x" | "y" = axis === "h" ? "y" : "x";
  const from = a[c];
  const want = from + delta;
  let best = delta;
  let bestD = SEGMENT_SNAP_PX / (zoom > 0 ? zoom : 1);
  for (const j of [index - 1, index + 2]) {
    if (j < 1 || j > full.length - 2) continue;
    const d = Math.abs(full[j][c] - want);
    if (d <= bestD) {
      bestD = d;
      best = full[j][c] - from;
    }
  }
  return best;
}
