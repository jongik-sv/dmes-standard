/**
 * 선 경로 편집(3단계 계획 Task 15, C14) 순수 함수 — React 의존이 없다.
 * `pts` 는 시작 손잡이 → 꺾는 점들 → 끝 손잡이 전체 꺾은선이다(흐름 좌표).
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
