// 자동 배치(dagre) 결과 캐시 — 위치·선 경로·이름표·메모·색만 바뀐 편집은 dagre 를 다시 돌리지 않고,
// 배치가 읽는 칸(구조·크기·갈래 순서·접힘)이 바뀌면 다시 계산한다. 편집은 실제 flow-edit 연산(깊은 복사)으로 만든다.
import { beforeEach, describe, expect, it, vi } from "vitest";

const layout = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@dagrejs/dagre", async (importOriginal) => {
  const real = await importOriginal<typeof import("@dagrejs/dagre")>();
  const inner = real.default ?? real;
  const wrapped = new Proxy(inner, {
    get: (t, k, r) => (k === "layout" ? (...a: Parameters<typeof inner.layout>) => (layout.calls++, t.layout(...a)) : Reflect.get(t, k, r)),
  });
  return { ...real, default: wrapped };
});

import { collapseView } from "../../../pages/dme/ruleSetEdit/canvas/collapse";
import {
  addNote, insertRule, insertSplit, reorderBranches, setLabelOffset, setNodeStyle, setPositions, setRoute, toEditFlow, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { autoArrange, autoLayout, clearLayoutCache, drawnPositions } from "../../../pages/dme/ruleSetEdit/flow-layout";

const ok = (r: EditResult): EditFlow => {
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};
/** 룰 셋 + 병렬 분기(갈래 2개) 흐름. */
function parFlow(): EditFlow {
  const f = toEditFlow(null, ["R_A", "R_B", "R_C"]);
  return ok(insertSplit(f, f.edges[1].id, "PARALLEL"));
}
const splitOf = (f: EditFlow) => f.nodes.find((n) => n.kind === "PARALLEL")!.id;

beforeEach(() => {
  clearLayoutCache();
  layout.calls = 0;
});

describe("autoLayout 캐시", () => {
  it("처음 배치는 dagre 를 한 번 부르고, 같은 흐름을 다시 그리면 부르지 않는다", () => {
    const f = parFlow();
    drawnPositions(f);
    expect(layout.calls).toBe(1); // 계수기가 살아 있다
    drawnPositions(f);
    expect(layout.calls).toBe(1);
  });

  it("위치·선 경로·이름표·메모·색만 바꾼 편집(복사본)은 다시 배치하지 않는다", () => {
    const f = parFlow();
    const before = drawnPositions(f);
    const e = f.edges[0].id;
    let g = setPositions(f, { r1: { x: 900, y: 40 } });
    drawnPositions(g);
    g = setPositions(g, { r1: { x: 950, y: 60 } });
    drawnPositions(g);
    g = ok(setRoute(g, e, [{ x: 10, y: 10 }]));
    drawnPositions(g);
    g = ok(setLabelOffset(g, e, "label", { dx: 5, dy: 6 }));
    drawnPositions(g);
    g = addNote(g, { x: 1, y: 2 }, null).flow;
    drawnPositions(g);
    g = ok(setNodeStyle(g, "r2", { color: "red" }));
    const after = drawnPositions(g);
    expect(layout.calls).toBe(1);
    expect(after.r2).toEqual(before.r2); // 자동 배치 자리는 그대로다
    expect(after.r1).toEqual({ x: 950, y: 60 }); // 저장 위치가 덮는다
  });

  it("구조·크기·갈래 순서·접힘이 바뀌면 다시 배치한다", () => {
    const f = parFlow();
    drawnPositions(f);
    expect(layout.calls).toBe(1);

    const wider = ok(setNodeStyle(f, "r2", { w: 400 }));
    drawnPositions(wider);
    expect(layout.calls).toBe(2);

    const more = ok(insertRule(f, f.edges[0].id, "R_X"));
    drawnPositions(more);
    expect(layout.calls).toBe(3);

    const split = splitOf(f);
    const branches = f.edges.filter((e) => e.from === split).map((e) => e.id);
    const swapped = ok(reorderBranches(f, split, [...branches].reverse()));
    expect(swapped.edges.map((e) => e.order)).not.toEqual(f.edges.map((e) => e.order));
    drawnPositions(swapped);
    expect(layout.calls).toBe(4);

    const v = collapseView(f, new Set([split]));
    drawnPositions(v.flow, v.blocks);
    expect(layout.calls).toBe(5);
  });

  it("표시 흐름과 전체 흐름을 번갈아 배치해도 서로를 밀어내지 않는다(LRU)", () => {
    const f = parFlow();
    const v = collapseView(f, new Set([splitOf(f)]));
    drawnPositions(v.flow, v.blocks);
    drawnPositions(f);
    autoArrange(f);
    expect(layout.calls).toBe(2);
    for (let i = 0; i < 3; i++) {
      drawnPositions(v.flow, v.blocks);
      drawnPositions(f);
    }
    expect(layout.calls).toBe(2);
  });

  it("캐시에서 꺼낸 결과는 새로 계산한 값과 같고, 돌려받은 객체를 고쳐도 다음 결과가 바뀌지 않는다", () => {
    const f = parFlow();
    const first = autoLayout(f);
    clearLayoutCache();
    const fresh = autoLayout(f);
    const cached = autoLayout(f);
    expect(cached).toEqual(fresh);
    expect(cached).toEqual(first);
    cached.r1.x += 500;
    delete cached.r2;
    expect(autoLayout(f)).toEqual(fresh);
  });
});
