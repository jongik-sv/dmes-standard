/** @vitest-environment happy-dom */

// 4단계 W1 — 선분 손잡이 순수 함수(route-path.ts): 자동 경로 점(xyflow getPoints 이식)·단순화·선분 손잡이 자리·선분 옮기기·일직선 맞춤·놓을 때 정리.
import { describe, expect, it } from "vitest";

import { Position, getSmoothStepPath } from "../../../pages/dme/ruleSetEdit/canvas/react-flow";
import {
  AUTO_ROUTE_OFFSET, ROUTE_RADIUS, ROUTE_STUB, SEGMENT_CLEAR_PX, SEGMENT_MIN_PX, SEGMENT_SNAP_PX,
  autoRoute, finishRoute, isClear, moveSegment, routePath, segmentAxis, segmentHandles, simplifyRoute, smoothStepPoints, snapSegmentDelta,
  type Side, type SmoothStepInput,
} from "../../../pages/dme/ruleSetEdit/canvas/route-path";
import { ROUTE_LIMIT_MESSAGE, setRoute, toEditFlow, type FlowPos } from "../../../pages/dme/ruleSetEdit/flow-edit";

const P = (x: number, y: number): FlowPos => ({ x, y });

// ───────── 모양 견주기 ─────────
const EPS = 0.01;
const same = (a: FlowPos, b: FlowPos) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
const cross = (a: FlowPos, b: FlowPos, c: FlowPos) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const dot = (a: FlowPos, b: FlowPos, c: FlowPos) => (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
type Item = { t: "L" | "Q"; p: FlowPos; q?: FlowPos; from: FlowPos };
/**
 * SVG path(M·L·Q) → 모양 목록. 같은 자리 L, 곧은 Q(제어점이 한 직선 위), 같은 방향으로 곧게 이어지는 L 을 합쳐 꺾임만 남긴다(소수 첫째 자리).
 * getSmoothStepPath 는 꺾지 않는 점을 `L`, routePath 는 곧은 `Q` 로 쓰므로 글자가 아니라 모양을 견준다.
 */
function shape(d: string): string[] {
  const tok = d.match(/[MLQ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g)!;
  let i = 0;
  const n = () => Number(tok[i++]);
  let start = P(0, 0);
  let cur = P(0, 0);
  const items: Item[] = [];
  const push = (p: FlowPos) => {
    if (same(cur, p)) return;
    const prev = items[items.length - 1];
    if (prev && prev.t === "L" && Math.abs(cross(prev.from, prev.p, p)) < EPS && dot(prev.from, prev.p, p) > 0) {
      prev.p = p;
      cur = p;
      return;
    }
    items.push({ t: "L", p, from: cur });
    cur = p;
  };
  while (i < tok.length) {
    const c = tok[i++];
    if (c === "M") start = cur = P(n(), n());
    else if (c === "L") push(P(n(), n()));
    else if (c === "Q") {
      const q = P(n(), n());
      const e = P(n(), n());
      if (Math.abs(cross(cur, q, e)) < EPS) push(e);
      else {
        items.push({ t: "Q", q, p: e, from: cur });
        cur = e;
      }
    } else throw new Error(`모르는 명령 ${c}`);
  }
  const r = (v: number) => Math.round(v * 10) / 10;
  return [
    `M ${r(start.x)} ${r(start.y)}`,
    ...items.map((it) => (it.t === "L" ? `L ${r(it.p.x)} ${r(it.p.y)}` : `Q ${r(it.q!.x)} ${r(it.q!.y)} ${r(it.p.x)} ${r(it.p.y)}`)),
  ];
}

const SIDES: Side[] = ["left", "top", "right", "bottom"];
const POS: Record<Side, Position> = { left: Position.Left, top: Position.Top, right: Position.Right, bottom: Position.Bottom };
/** 스펙 §3.3 — 네 변 × 네 변 × 상대 위치(위·아래·왼·오른). 출발점은 (100,100). */
const RAW_REL: Record<string, FlowPos> = { 위: P(60, -200), 아래: P(60, 200), 왼: P(-300, 40), 오른: P(300, 40) };
/** 단순화한 자동 경로 견주기용 — 원래 점 사이 선분이 16 이상인 간격(16 미만은 편차 후보 표의 「§3.3 처음 끌 때 선이 튀지 않는다」 행). */
const WIDE_REL: Record<string, FlowPos> = { 위: P(120, -200), 아래: P(120, 200), 왼: P(-300, 80), 오른: P(300, 80) };
type Case = { s: Side; t: Side; name: string; input: SmoothStepInput };
function cases(rel: Record<string, FlowPos>): Case[] {
  const out: Case[] = [];
  for (const s of SIDES) {
    for (const t of SIDES) {
      for (const [name, d] of Object.entries(rel)) {
        out.push({ s, t, name, input: { sourceX: 100, sourceY: 100, sourcePosition: s, targetX: 100 + d.x, targetY: 100 + d.y, targetPosition: t } });
      }
    }
  }
  return out;
}
const rfPath = (c: Case) =>
  getSmoothStepPath({ ...c.input, sourcePosition: POS[c.s], targetPosition: POS[c.t], borderRadius: ROUTE_RADIUS })[0];
const ends = (c: Case) => [P(c.input.sourceX, c.input.sourceY), P(c.input.targetX, c.input.targetY)] as const;

describe("자동 경로 점(@xyflow/system@0.0.83 getPoints 이식)", () => {
  it("모서리 반경·연결점 여백은 React Flow 선 그리기와 같은 값이다", () => {
    expect(ROUTE_RADIUS).toBe(8);
    expect(AUTO_ROUTE_OFFSET).toBe(20);
  });

  it.each(cases(RAW_REL))("$s → $t, 상대 위치 $name — 옮긴 점을 routePath(점, 8) 로 그린 모양이 getSmoothStepPath(borderRadius 8) 와 같다", (c) => {
    expect(shape(routePath(smoothStepPoints(c.input), ROUTE_RADIUS))).toEqual(shape(rfPath(c)));
  });

  it.each(cases(WIDE_REL))("$s → $t, 상대 위치 $name — 단순화한 자동 경로(autoRoute)로 그려도 같은 모양이다", (c) => {
    const [s, t] = ends(c);
    expect(shape(routePath([s, ...autoRoute(c.input), t], ROUTE_RADIUS))).toEqual(shape(rfPath(c)));
  });

  it("autoRoute 에는 겹친 점·한 직선 위 가운데 점이 없다", () => {
    for (const c of cases(RAW_REL)) {
      const [s, t] = ends(c);
      const full = [s, ...autoRoute(c.input), t];
      for (let i = 1; i < full.length - 1; i++) {
        expect(same(full[i - 1], full[i]), `${c.s}→${c.t} ${c.name}`).toBe(false);
        expect(Math.abs(cross(full[i - 1], full[i], full[i + 1])) > EPS, `${c.s}→${c.t} ${c.name}`).toBe(true);
      }
    }
  });

  it("dagre 기본 간격(연결점 사이 38px) — 곧은 선은 꺾는 점이 없고, 옆으로 비킨 선은 가운데 2px 턱을 그대로 둔다", () => {
    const base = { sourceX: 116, sourceY: 72, sourcePosition: "bottom" as const, targetY: 110, targetPosition: "top" as const };
    expect(autoRoute({ ...base, targetX: 116 })).toEqual([]);
    expect(autoRoute({ ...base, targetX: 266 })).toEqual([P(116, 92), P(191, 92), P(191, 90), P(266, 90)]);
  });
});

describe("simplifyRoute·finishRoute", () => {
  it("양 끝은 남기고 한 직선 위 가운데 점·겹친 점·같은 직선으로 되돌아가는 점을 뺀다", () => {
    expect(simplifyRoute([P(0, 0), P(0, 50), P(0, 100), P(100, 100)])).toEqual([P(0, 0), P(0, 100), P(100, 100)]);
    expect(simplifyRoute([P(0, 0), P(0, 50), P(0, 50), P(100, 50)])).toEqual([P(0, 0), P(0, 50), P(100, 50)]);
    expect(simplifyRoute([P(0, 0), P(0, 20), P(0, 18), P(0, 40)])).toEqual([P(0, 0), P(0, 40)]);
    expect(simplifyRoute([P(0, 0), P(50, 50), P(100, 100)])).toEqual([P(0, 0), P(100, 100)]);
  });

  it("안쪽 점이 끝점과 겹치면 안쪽 점을 뺀다. 입력은 바뀌지 않는다", () => {
    const full = [P(0, 0), P(0, 100), P(100, 100), P(100, 100)];
    const before = JSON.stringify(full);
    expect(simplifyRoute(full)).toEqual([P(0, 0), P(0, 100), P(100, 100)]);
    expect(JSON.stringify(full)).toBe(before);
  });

  it("finishRoute — 꺾는 점을 정수로 반올림한 뒤 정리하고 꺾는 점만 돌려준다", () => {
    expect(finishRoute(P(0, 0), [P(0.4, 50.6), P(100.5, 50.6)], P(100, 100))).toEqual([P(0, 51), P(101, 51)]);
    expect(finishRoute(P(0, 0), [P(0, 50)], P(0, 100))).toEqual([]);
  });
});

describe("선분 손잡이 자리", () => {
  const full = [P(0, 0), P(0, 100), P(300, 100), P(300, 300)];

  it("segmentAxis — 가로·세로만, 대각선과 길이 0 은 null", () => {
    expect(segmentAxis(P(0, 0), P(10, 0))).toBe("h");
    expect(segmentAxis(P(0, 0), P(0, 10))).toBe("v");
    expect(segmentAxis(P(0, 0), P(10, 0.3))).toBe("h");
    expect(segmentAxis(P(0, 0), P(10, 10))).toBeNull();
    expect(segmentAxis(P(5, 5), P(5, 5))).toBeNull();
  });

  it("가로·세로 선분 가운데에 두고, 대각선·화면 28px 미만 선분은 뺀다(배율을 따른다)", () => {
    expect(SEGMENT_MIN_PX).toBe(28);
    expect(segmentHandles(full, 1, [])).toEqual([
      { index: 0, axis: "v", at: P(0, 50) },
      { index: 1, axis: "h", at: P(150, 100) },
      { index: 2, axis: "v", at: P(300, 200) },
    ]);
    expect(segmentHandles([P(0, 0), P(100, 100), P(100, 127)], 1, [])).toEqual([]);
    expect(segmentHandles([P(0, 0), P(0, 28)], 1, [])).toEqual([{ index: 0, axis: "v", at: P(0, 14) }]);
    expect(segmentHandles([P(0, 0), P(0, 55)], 0.5, [])).toEqual([]); // 흐름 55 = 화면 27.5
  });

  it("가운데가 라벨·[+] 에서 화면 24px 안이면 1/4 지점(먼 쪽, 같으면 출발 쪽)으로 비키고, 1/4 지점도 가까우면 그리지 않는다", () => {
    expect(SEGMENT_CLEAR_PX).toBe(24);
    expect(segmentHandles(full, 1, [P(160, 100)])[1]).toEqual({ index: 1, axis: "h", at: P(75, 100) });
    expect(segmentHandles(full, 1, [P(150, 100)])[1].at).toEqual(P(75, 100));
    // dagre 기본 곧은 선(38px) 가운데 [+] — 1/4 지점도 9.5px 라 막대가 없다
    expect(segmentHandles([P(116, 72), P(116, 110)], 1, [P(116, 91)])).toEqual([]);
    // 배율 2 면 화면 24px = 흐름 12 — 13 떨어진 [+] 는 비키지 않는다
    expect(segmentHandles(full, 2, [P(150, 113)])[1].at).toEqual(P(150, 100));
  });

  it("isClear — 라벨·[+] 자리에서 화면 24px 이상 떨어졌는가", () => {
    expect(isClear(P(0, 0), [], 1)).toBe(true);
    expect(isClear(P(0, 0), [P(0, 23)], 1)).toBe(false);
    expect(isClear(P(0, 0), [P(0, 24)], 1)).toBe(true);
    expect(isClear(P(0, 0), [P(0, 13)], 2)).toBe(true);
  });
});

describe("moveSegment", () => {
  const full = [P(0, 0), P(0, 100), P(200, 100), P(200, 200)];

  it("가운데 선분은 수직으로만 옮기고 양 끝 점이 따라간다(이웃 선분은 길이만 바뀐다)", () => {
    expect(moveSegment(full, 1, 30)).toEqual({ points: [P(0, 130), P(200, 130)], seg: 1 });
  });

  it("노드에 붙은 첫 선분 — 노드에서 20 나온 짧은 선분과 꺾임을 끼워 나가는 방향을 지킨다", () => {
    expect(ROUTE_STUB).toBe(20);
    expect(moveSegment(full, 0, 50)).toEqual({ points: [P(0, 20), P(50, 20), P(50, 100), P(200, 100)], seg: 2 });
  });

  it("노드에 붙은 끝 선분 — 끝 노드 쪽에 짧은 선분과 꺾임을 끼운다", () => {
    expect(moveSegment(full, 2, -30)).toEqual({ points: [P(0, 100), P(170, 100), P(170, 180), P(200, 180)], seg: 2 });
  });

  it("꺾는 점 없는 곧은 선 — 양쪽에 짧은 선분을 끼운다", () => {
    expect(moveSegment([P(0, 0), P(0, 200)], 0, 40)).toEqual({ points: [P(0, 20), P(40, 20), P(40, 180), P(0, 180)], seg: 2 });
  });

  it("짧은 곧은 선(38) — 짧은 선분을 길이의 1/3 로 줄여 옮긴 가운데 선분이 남고, 놓을 때 다시 곧은 선으로 접히지 않는다", () => {
    const r = moveSegment([P(116, 72), P(116, 110)], 0, 40)!;
    expect(r.seg).toBe(2);
    expect(Math.abs(r.points[2].y - r.points[1].y)).toBeGreaterThan(10);
    expect(finishRoute(P(116, 72), r.points, P(116, 110))).toEqual([P(116, 85), P(156, 85), P(156, 97), P(116, 97)]);
  });

  it("대각선 선분·없는 선분은 null, 입력은 바뀌지 않는다", () => {
    expect(moveSegment([P(0, 0), P(50, 50), P(50, 100)], 0, 10)).toBeNull();
    expect(moveSegment(full, 5, 10)).toBeNull();
    const before = JSON.stringify(full);
    moveSegment(full, 0, 50);
    expect(JSON.stringify(full)).toBe(before);
  });

  it("짧은 선분을 끼워 꺾는 점이 20개를 넘으면 setRoute 가 거부한다(편집 실패 알림)", () => {
    const pts: FlowPos[] = [];
    for (let k = 0; k < 10; k++) pts.push(P(100 * k, 100 + 100 * k), P(100 * (k + 1), 100 + 100 * k));
    const r = moveSegment([P(0, 0), ...pts, P(1000, 1100)], 0, 30)!;
    expect(r.points).toHaveLength(22);
    expect(setRoute(toEditFlow(null, ["R_A", "R_B"]), "e2", r.points)).toEqual({ ok: false, reason: ROUTE_LIMIT_MESSAGE });
  });
});

describe("snapSegmentDelta — 끄는 동안 일직선 맞춤", () => {
  // S(0,0) → (0,100) → (200,100) → (200,250) → (400,250) → T(400,400)
  const full = [P(0, 0), P(0, 100), P(200, 100), P(200, 250), P(400, 250), P(400, 400)];

  it("옮기는 선분이 안쪽 이웃 선분과 화면 6px 안이면 일직선으로 맞춘다", () => {
    expect(SEGMENT_SNAP_PX).toBe(6);
    expect(snapSegmentDelta(full, 3, -146, 1)).toBe(-150); // y 250 → 104 → 100 에 맞춤
    expect(snapSegmentDelta(full, 3, -140, 1)).toBe(-140); // 110 — 10 떨어져 그대로
    expect(snapSegmentDelta(full, 1, 145, 1)).toBe(150); // y 100 → 245 → 250 에 맞춤
  });

  it("거리는 화면 px 이다 — 배율 0.5 면 흐름 12 안", () => {
    expect(snapSegmentDelta(full, 3, -140, 0.5)).toBe(-150);
  });

  it("노드 연결점(양 끝)의 좌표에는 맞추지 않는다 — 노드에 붙은 선분이 길이 0 이 되어 화살표가 옆으로 들어가지 않게", () => {
    expect(snapSegmentDelta(full, 1, -97, 1)).toBe(-97); // 앞 이웃 끝은 S(0,0)
    expect(snapSegmentDelta(full, 3, 147, 1)).toBe(147); // 뒤 이웃 끝은 T(400,400)
  });

  it("맞춘 뒤 놓으면 길이 0 선분과 한 직선 위 점이 지워져 선분이 하나로 합쳐진다", () => {
    const moved = moveSegment(full, 3, snapSegmentDelta(full, 3, -146, 1))!;
    expect(moved.points).toEqual([P(0, 100), P(200, 100), P(200, 100), P(400, 100)]);
    expect(finishRoute(full[0], moved.points, full[5])).toEqual([P(0, 100), P(400, 100)]);
  });
});
