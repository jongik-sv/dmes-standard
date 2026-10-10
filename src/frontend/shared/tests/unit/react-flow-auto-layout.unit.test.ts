import { describe, expect, it } from "vitest";

import { AUTO_LAYOUT_DEFAULTS, autoLayout, type LayoutNode } from "../../src/components/react-flow/auto-layout";

const box = (id: string, width = 240, height = 100): LayoutNode => ({ id, width, height });

/** 두 상자가 1px 이상 겹치는가. */
function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function assertNoOverlap(pos: Record<string, { x: number; y: number }>, nodes: LayoutNode[]) {
  const rects = nodes.map((n) => ({ id: n.id, x: pos[n.id].x, y: pos[n.id].y, w: n.width, h: n.height }));
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      expect(overlap(rects[i], rects[j]), `${rects[i].id} ↔ ${rects[j].id}`).toBe(false);
    }
  }
}

describe("autoLayout", () => {
  it("기본값", () => {
    expect(AUTO_LAYOUT_DEFAULTS).toEqual({ direction: "TB", nodeGap: 40, rankGap: 60, isolated: "rank" });
  });

  it("빈 입력은 빈 결과", () => {
    expect(autoLayout([], [])).toEqual({});
    expect(autoLayout([], [{ source: "a", target: "b" }])).toEqual({});
  });

  it("TB 사슬 a→b→c 는 위에서 아래로 층을 쌓고, 층 사이를 rankGap 이상 띄운다", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }, { source: "b", target: "c" }]);
    expect(p.a.y).toBeLessThan(p.b.y);
    expect(p.b.y).toBeLessThan(p.c.y);
    expect(p.b.y - p.a.y).toBeGreaterThanOrEqual(100 + 60);
    assertNoOverlap(p, nodes);
  });

  it("LR 은 왼쪽에서 오른쪽으로 쌓는다", () => {
    const nodes = [box("a"), box("b")];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }], { direction: "LR", rankGap: 100 });
    expect(p.b.x - p.a.x).toBeGreaterThanOrEqual(240 + 100);
    expect(p.a.y).toBe(p.b.y);
  });

  it("좌표는 정수이고, 가장 왼쪽 위가 origin 이다", () => {
    const nodes = [box("a", 201, 33), box("b", 157, 71), box("c", 99, 45)];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }, { source: "a", target: "c" }], { origin: { x: 500, y: -20 } });
    const xs = Object.values(p).map((v) => v.x);
    const ys = Object.values(p).map((v) => v.y);
    expect([...xs, ...ys].every(Number.isInteger)).toBe(true);
    expect(Math.min(...xs)).toBe(500);
    expect(Math.min(...ys)).toBe(-20);
  });

  it("isolated grid — 선이 없는 노드는 선 묶음 아래에 격자로 놓는다", () => {
    const nodes = [box("a"), box("b"), box("c"), box("d"), box("e")];
    const p = autoLayout(nodes, [{ source: "a", target: "b" }], { isolated: "grid" });
    const bottom = Math.max(p.a.y + 100, p.b.y + 100);
    for (const id of ["c", "d", "e"]) expect(p[id].y).toBeGreaterThanOrEqual(bottom + 60);
    // 3개 → 열 2개: c·d 가 한 줄, e 가 다음 줄
    expect(p.c.y).toBe(p.d.y);
    expect(p.d.x).toBe(p.c.x + 240 + 40);
    expect(p.e.y).toBe(p.c.y + 100 + 40);
    expect(p.e.x).toBe(p.c.x);
    assertNoOverlap(p, nodes);
  });

  it("isolated grid 에 gridColumns 를 주면 그 열 수로 놓는다. 선이 하나도 없으면 origin 부터 격자다", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const p = autoLayout(nodes, [], { isolated: "grid", gridColumns: 3, origin: { x: 10, y: 20 } });
    expect(p).toEqual({ a: { x: 10, y: 20 }, b: { x: 290, y: 20 }, c: { x: 570, y: 20 } });
  });

  it("isolated grid 에 gridColumns 가 NaN·0 이면 기본 열 수로 놓고 노드를 빠뜨리지 않는다", () => {
    const nodes = [box("a"), box("b"), box("c"), box("d")];
    for (const gridColumns of [Number.NaN, 0, -2]) {
      const p = autoLayout(nodes, [], { isolated: "grid", gridColumns });
      expect(Object.keys(p).sort()).toEqual(["a", "b", "c", "d"]);
      expect(p.b.y).toBe(p.a.y);
      expect(p.c.y).toBeGreaterThan(p.a.y);
    }
  });

  it("isolated rank — 선이 없어도 모두 dagre 로 놓고 겹치지 않는다", () => {
    const nodes = [box("a"), box("b"), box("c")];
    const p = autoLayout(nodes, []);
    expect(Object.keys(p).sort()).toEqual(["a", "b", "c"]);
    assertNoOverlap(p, nodes);
  });

  it("자기 선·모르는 끝·같은 선 반복은 무시한다", () => {
    const nodes = [box("a"), box("b")];
    const p = autoLayout(nodes, [
      { source: "a", target: "a" }, { source: "a", target: "zz" }, { source: "a", target: "b" }, { source: "a", target: "b" },
    ]);
    expect(Object.keys(p).sort()).toEqual(["a", "b"]);
    expect(p.a.y).toBeLessThan(p.b.y);
  });

  it("같은 id 는 처음 것만 쓰고, 크기가 0·NaN 이어도 던지지 않는다", () => {
    const p = autoLayout([box("a"), box("a", 999, 999), { id: "b", width: 0, height: Number.NaN }], [{ source: "a", target: "b" }]);
    expect(Object.keys(p).sort()).toEqual(["a", "b"]);
    expect(Number.isInteger(p.b.x) && Number.isInteger(p.b.y)).toBe(true);
  });

  it("같은 입력이면 같은 결과(결정적)", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => box(`n${i}`, 200 + (i % 3) * 20, 60 + (i % 4) * 30));
    const edges = nodes.slice(1).map((n, i) => ({ source: `n${Math.floor(i / 3)}`, target: n.id }));
    expect(autoLayout(nodes, edges, { direction: "LR" })).toEqual(autoLayout(nodes, edges, { direction: "LR" }));
  });

  it("60개 트리(자식 3개씩) + 선 없는 10개 — 겹치지 않는다", () => {
    const tree = Array.from({ length: 60 }, (_, i) => box(`t${i}`, 240, 52 + (i % 5) * 20));
    const loose = Array.from({ length: 10 }, (_, i) => box(`l${i}`, 240, 92));
    const edges = tree.slice(1).map((n, i) => ({ source: `t${Math.floor(i / 3)}`, target: n.id }));
    const nodes = [...tree, ...loose];
    const p = autoLayout(nodes, edges, { direction: "LR", isolated: "grid", rankGap: 100 });
    expect(Object.keys(p)).toHaveLength(70);
    assertNoOverlap(p, nodes);
  });
});
