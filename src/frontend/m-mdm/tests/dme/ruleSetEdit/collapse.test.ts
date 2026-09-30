/** @vitest-environment happy-dom */

// 블록 접기 순수 로직·상태 훅(3단계 계획 Task 11, D16) — collapseView 와 useCollapse.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { collapseView } from "../../../pages/dme/ruleSetEdit/canvas/collapse";
import { blockMembers, flowJsonOf, insertRule, insertSplit, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { useCollapse, type CollapseState } from "../../../pages/dme/ruleSetEdit/state/useCollapse";

function must(r: { ok: boolean; flow?: EditFlow; reason?: string }): EditFlow {
  if (!r.ok || !r.flow) throw new Error(r.reason ?? "편집 실패");
  return r.flow;
}

/** r1 → IF if1(갈래 둘, 각각 룰 하나) → 합류 → r2. */
function ifFlow(): EditFlow {
  let f = toEditFlow(null, ["A", "B"]);
  f = must(insertSplit(f, "e2", "IF"));
  const branches = f.edges.filter((e) => e.from === "if1");
  f = must(insertRule(f, branches[0].id, "C"));
  const second = f.edges.find((e) => e.from === "if1" && e.id === branches[1].id)!;
  f = must(insertRule(f, second.id, "D"));
  return f;
}

/** 바깥 IF(if1) 안에 IF(안쪽)를 넣은 흐름. */
function nestedFlow(): { flow: EditFlow; outer: string; inner: string } {
  let f = ifFlow();
  const outerBranch = f.edges.find((e) => e.from === "if1")!;
  const before = new Set(f.nodes.map((n) => n.id));
  f = must(insertSplit(f, outerBranch.id, "IF"));
  const inner = f.nodes.find((n) => n.kind === "IF" && !before.has(n.id))!.id;
  return { flow: f, outer: "if1", inner };
}

const ids = (f: EditFlow) => f.nodes.map((n) => n.id);

describe("collapseView", () => {
  it("접은 분기는 안쪽과 합류를 감추고 합류에서 나가던 선(같은 ID)이 분기에서 나간다", () => {
    const flow = ifFlow();
    const members = blockMembers(flow, "if1")!;
    const merge = flow.nodes.find((n) => n.kind === "MERGE")!;
    const outEdge = flow.edges.find((e) => e.from === merge.id)!;
    const inner = members.filter((id) => id !== "if1" && id !== merge.id);
    expect(inner).toHaveLength(2);

    const v = collapseView(flow, new Set(["if1"]));
    expect(v.blocks.if1.count).toBe(2);
    expect([...v.hidden].sort()).toEqual([...inner, merge.id].sort());
    for (const h of v.hidden) expect(ids(v.flow)).not.toContain(h);
    const moved = v.flow.edges.find((e) => e.id === outEdge.id)!;
    expect(moved.from).toBe("if1");
    expect(moved.to).toBe(outEdge.to);
    // 분기에서 안쪽으로 가던 선·안쪽끼리 잇던 선은 모두 사라지고, 분기로 들어오는 선은 그대로다.
    for (const e of v.flow.edges) {
      expect(v.hidden.has(e.from)).toBe(false);
      expect(v.hidden.has(e.to)).toBe(false);
    }
    expect(v.flow.edges.filter((e) => e.to === "if1")).toHaveLength(1);
    expect(v.flow.edges.filter((e) => e.from === "if1")).toHaveLength(1);
  });

  it("접은 것이 없으면 흐름을 그대로 쓴다", () => {
    const flow = ifFlow();
    const v = collapseView(flow, new Set());
    expect(v.flow).toBe(flow);
    expect(v.hidden.size).toBe(0);
    expect(Object.keys(v.blocks)).toEqual([]);
  });

  it("중첩: 바깥·안쪽 둘 다 접혀 있으면 바깥이 이기고, 안쪽만 접으면 안쪽만 접힌다", () => {
    const { flow, outer, inner } = nestedFlow();
    const both = collapseView(flow, new Set([outer, inner]));
    expect(Object.keys(both.blocks)).toEqual([outer]);
    expect(both.hidden.has(inner)).toBe(true);
    const only = collapseView(flow, new Set([inner]));
    expect(Object.keys(only.blocks)).toEqual([inner]);
    expect(only.hidden.has(outer)).toBe(false);
    expect(ids(only.flow)).toContain(outer);
    // 바깥이 이길 때 개수는 바깥 안쪽 전부(안쪽 분기·합류 포함)다.
    expect(both.blocks[outer].count).toBe(blockMembers(flow, outer)!.length - 2);
  });

  it("닫히지 않았거나 없는 분기는 무시한다", () => {
    const flow = ifFlow();
    const v = collapseView(flow, new Set(["nope", "r1"]));
    expect(v.flow).toBe(flow);
  });

  it("결과는 표시용이다 — 원래 흐름은 그대로다", () => {
    const flow = ifFlow();
    const before = flowJsonOf(flow);
    collapseView(flow, new Set(["if1"]));
    expect(flowJsonOf(flow)).toBe(before);
  });
});

describe("useCollapse", () => {
  const h: { current: CollapseState } = { current: null as unknown as CollapseState };
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;
  function Probe(p: { flow: EditFlow | null; setId: string | null }) {
    h.current = useCollapse(p.flow, p.setId);
    return null;
  }
  async function mount(flow: EditFlow | null, setId: string | null) {
    container = document.createElement("div");
    root = createRoot(container);
    await act(async () => root!.render(createElement(Probe, { flow, setId })));
  }
  async function rerender(flow: EditFlow | null, setId: string | null) {
    await act(async () => root!.render(createElement(Probe, { flow, setId })));
  }
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
  });

  it("toggle 로 접고 펴며, 세트가 바뀌면 비운다", async () => {
    const flow = ifFlow();
    await mount(flow, "S1");
    await act(async () => h.current.toggle("if1"));
    expect([...h.current.collapsed]).toEqual(["if1"]);
    await act(async () => h.current.toggle("if1"));
    expect(h.current.collapsed.size).toBe(0);
    await act(async () => h.current.toggle("if1"));
    await rerender(flow, "S2");
    expect(h.current.collapsed.size).toBe(0);
  });

  it("흐름에서 사라진 분기는 집합에서 빠지고, 다시 생겨도 접히지 않는다", async () => {
    const flow = ifFlow();
    await mount(flow, "S1");
    await act(async () => h.current.toggle("if1"));
    await rerender(toEditFlow(null, ["A", "B"]), "S1");
    expect(h.current.collapsed.size).toBe(0);
    await rerender(flow, "S1");
    expect(h.current.collapsed.size).toBe(0);
  });

  it("위치만 바뀌는 흐름 변경에는 접힘과 집합 참조를 그대로 둔다", async () => {
    const flow = ifFlow();
    await mount(flow, "S1");
    await act(async () => h.current.toggle("if1"));
    const set = h.current.collapsed;
    await rerender({ ...flow, view: { ...flow.view, positions: { r1: { x: 5, y: 5 } } } }, "S1");
    expect(h.current.collapsed).toBe(set);
  });

  it("접힌 블록의 안쪽이 편집으로 바뀌면 펴진다(접힌 채 편집한 결과를 보이려고)", async () => {
    const flow = ifFlow();
    await mount(flow, "S1");
    await act(async () => h.current.toggle("if1"));
    const branch = flow.edges.find((e) => e.from === "if1")!;
    await rerender(must(insertRule(flow, branch.id, "E")), "S1");
    expect(h.current.collapsed.size).toBe(0);
  });

  it("expandFor 는 그 노드를 품은 접힌 분기를 모두 펴고 분기 자신은 편다고 하지 않는다", async () => {
    const { flow, outer, inner } = nestedFlow();
    await mount(flow, "S1");
    await act(async () => {
      h.current.toggle(outer);
      h.current.toggle(inner);
    });
    expect(h.current.collapsed.size).toBe(2);
    const innerRule = blockMembers(flow, inner)!.find((id) => flow.nodes.find((n) => n.id === id)!.kind === "MERGE")!;
    await act(async () => h.current.expandFor(inner)); // 안쪽 분기 자신은 바깥 안에 있어 바깥만 핀다
    expect([...h.current.collapsed]).toEqual([inner]);
    await act(async () => h.current.expandFor(inner));
    expect([...h.current.collapsed]).toEqual([inner]);
    await act(async () => h.current.expandFor(innerRule));
    expect(h.current.collapsed.size).toBe(0);
  });
});
