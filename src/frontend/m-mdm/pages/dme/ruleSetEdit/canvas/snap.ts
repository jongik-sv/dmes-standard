/**
 * 끌 때 맞춤 안내선·스냅(추가 Task G1, Ruling 26) — 순수 함수. 좌표는 모두 흐름 좌표다.
 *
 * 끄는 대상 상자(여러 개면 묶음 경계 상자)의 왼쪽·가운데·오른쪽 x 와 위·가운데·아래 y 를, 끌지 않는 보이는 상자들의 같은 6개 기준과 견준다.
 * 축마다 거리가 임계값(화면 6px = 흐름 `6/zoom`) 안인 것 가운데 **가장 가까운 하나**에만 붙는다(거리가 같으면 왼·가운데·오른쪽, 위·가운데·아래 순서로 앞의 것).
 * 안내선은 붙은 축마다 하나이고, 맞은 상자와 (붙은 뒤의) 끄는 상자 둘을 잇는 길이다. 같은 기준값인 상자가 여럿이면 끄는 상자와 가장 가까운 상자를 잇는다.
 *
 * 캔버스는 끌기를 시작할 때 `snapIndex` 로 후보 기준값을 한 번 모아 정렬해 두고, 프레임마다 `snapHitIn` 으로 이분 탐색한다.
 * `snapHitIn` 은 안내선이 이은 상자(축마다 하나)의 `id` 도 돌려준다 — 캔버스가 놓을 때 고정 안 된 대상을 그린 위치로 함께 적는다(I2).
 * `snapMoveIn`·`snapMove` 는 같은 계산에서 이동량·안내선만 돌려주는 입구다(단위 테스트·한 번 쓰는 곳).
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 상자 주인(노드·메모 ID) — 있으면 맞은 대상으로 돌려준다(`snapHitIn`). */
  id?: string;
}
/** `x` = x 가 맞음(세로 안내선, x = at 에서 y 가 from..to), `y` = y 가 맞음(가로 안내선, y = at 에서 x 가 from..to). */
export type GuideAxis = "x" | "y";
export interface Guide {
  axis: GuideAxis;
  at: number;
  from: number;
  to: number;
}
export interface SnapResult {
  dx: number;
  dy: number;
  guides: Guide[];
}

/** 붙는 화면 거리(px). */
export const SNAP_THRESHOLD_PX = 6;
/** 화면 6px 을 흐름 좌표 거리로 — 확대 배율로 나눈다(배율을 모르면 1). */
export const snapThreshold = (zoom: number): number => SNAP_THRESHOLD_PX / (zoom > 0 && Number.isFinite(zoom) ? zoom : 1);

/** 기준값 하나 — 값과 그 값을 가진 상자. */
interface SnapLine {
  v: number;
  box: Box;
}
/** 축별로 기준값을 오름차순 정렬해 둔 색인. */
export interface SnapIndex {
  readonly x: readonly SnapLine[];
  readonly y: readonly SnapLine[];
}

const finiteBox = (b: Box) => Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.w) && Number.isFinite(b.h);
const xRefs = (b: Box) => [b.x, b.x + b.w / 2, b.x + b.w];
const yRefs = (b: Box) => [b.y, b.y + b.h / 2, b.y + b.h];

/** 후보 상자들의 6개 기준값을 축별로 모아 정렬한다(끌기 시작 때 한 번). 크기·자리가 유한하지 않은 상자는 뺀다. */
export function snapIndex(others: readonly Box[]): SnapIndex {
  const x: SnapLine[] = [];
  const y: SnapLine[] = [];
  for (const box of others) {
    if (!finiteBox(box)) continue;
    for (const v of xRefs(box)) x.push({ v, box });
    for (const v of yRefs(box)) y.push({ v, box });
  }
  x.sort((a, b) => a.v - b.v);
  y.sort((a, b) => a.v - b.v);
  return { x, y };
}

/** v 이상인 첫 자리(없으면 길이). */
function lowerBound(lines: readonly SnapLine[], v: number): number {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].v < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 한 축에서 가장 가까운 기준값까지의 이동량과 그 값(임계값 밖이면 null). */
function nearest(lines: readonly SnapLine[], refs: readonly number[], threshold: number): { d: number; v: number } | null {
  let best: { d: number; v: number } | null = null;
  for (const r of refs) {
    const i = lowerBound(lines, r);
    for (const k of [i - 1, i]) {
      const line = lines[k];
      if (!line) continue;
      const d = line.v - r;
      if (Math.abs(d) > threshold) continue;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { d, v: line.v };
    }
  }
  return best;
}

/** 두 상자가 다른 축으로 떨어진 거리(겹치면 0) — 같은 기준값의 상자 가운데 안내선으로 이을 상자를 고른다. */
function gap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, b0 - a1, a0 - b1);
}

/** 기준값 v 를 가진 상자 가운데 끄는 상자(m)와 다른 축으로 가장 가까운 것. */
function closestAt(lines: readonly SnapLine[], v: number, m: Box, axis: GuideAxis): Box {
  let best: Box | null = null;
  let bestGap = Infinity;
  for (let k = lowerBound(lines, v); k < lines.length && lines[k].v === v; k++) {
    const o = lines[k].box;
    const g = axis === "x" ? gap(m.y, m.y + m.h, o.y, o.y + o.h) : gap(m.x, m.x + m.w, o.x, o.x + o.w);
    if (g < bestGap) {
      bestGap = g;
      best = o;
    }
  }
  return best!;
}

/** 붙인 결과 + 안내선이 이은(맞은) 상자의 ID — 축마다 하나, 같은 상자면 한 번. ID 가 없는 상자는 빠진다. */
export interface SnapHit extends SnapResult {
  targets: string[];
}

/** 미리 모은 색인으로 붙일 이동량과 안내선, 맞은 상자 ID 를 구한다(프레임마다). */
export function snapHitIn(moving: Box, index: SnapIndex, threshold: number): SnapHit {
  if (!finiteBox(moving) || !(threshold >= 0)) return { dx: 0, dy: 0, guides: [], targets: [] };
  const nx = nearest(index.x, xRefs(moving), threshold);
  const ny = nearest(index.y, yRefs(moving), threshold);
  const dx = nx ? nx.d : 0;
  const dy = ny ? ny.d : 0;
  const m: Box = { x: moving.x + dx, y: moving.y + dy, w: moving.w, h: moving.h };
  const guides: Guide[] = [];
  const targets: string[] = [];
  const hit = (o: Box) => {
    if (o.id !== undefined && !targets.includes(o.id)) targets.push(o.id);
  };
  if (nx) {
    const o = closestAt(index.x, nx.v, m, "x");
    guides.push({ axis: "x", at: nx.v, from: Math.min(o.y, m.y), to: Math.max(o.y + o.h, m.y + m.h) });
    hit(o);
  }
  if (ny) {
    const o = closestAt(index.y, ny.v, m, "y");
    guides.push({ axis: "y", at: ny.v, from: Math.min(o.x, m.x), to: Math.max(o.x + o.w, m.x + m.w) });
    hit(o);
  }
  return { dx, dy, guides, targets };
}

/** 미리 모은 색인으로 붙일 이동량과 안내선을 구한다. */
export function snapMoveIn(moving: Box, index: SnapIndex, threshold: number): SnapResult {
  const { dx, dy, guides } = snapHitIn(moving, index, threshold);
  return { dx, dy, guides };
}

/** 끄는 상자를 다른 상자들의 기준선에 붙인다 — 이동량(dx, dy)과 안내선. threshold 는 흐름 좌표 거리(`snapThreshold(zoom)`). */
export function snapMove(moving: Box, others: readonly Box[], threshold: number): SnapResult {
  return snapMoveIn(moving, snapIndex(others), threshold);
}

/** 여러 상자의 경계 상자(여러 개 끌기의 묶음). 유한한 상자가 없으면 null. */
export function boundsOf(boxes: readonly Box[]): Box | null {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    if (!finiteBox(b)) continue;
    x1 = Math.min(x1, b.x);
    y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  return Number.isFinite(x1) ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : null;
}
