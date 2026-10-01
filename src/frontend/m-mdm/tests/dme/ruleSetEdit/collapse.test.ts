/** @vitest-environment happy-dom */

// 블록 접기 순수 로직·상태 훅(3단계 계획 Task 11, D16) — collapseView 와 useCollapse.
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode } from "../../../src/contract/engine-contract.generated";
import { FOLD_EDGE_PREFIX, collapseView } from "../../../pages/dme/ruleSetEdit/canvas/collapse";
import { addBranch, blockMembers, flowJsonOf, insertRule, insertSplit, toEditFlow, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { joinOf } from "../../../pages/dme/ruleSetEdit/flow-model";
import { useCollapse, type CollapseState } from "../../../pages/dme/ruleSetEdit/state/useCollapse";

function must(r: { ok: boolean; flow?: EditFlow; reason?: string }): EditFlow {
  if (!r.ok || !r.flow) throw new Error(r.reason ?? "편집 실패");
  return r.flow;
}

/** r1 → IF if1(갈래 둘, 각각 룰 하나 — 「갈래 1」 은 룰 뒤에 빈 단계도 있다) → r2(모이는 자리, implicit-join §8.2). */
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
  it("접은 병렬은 안쪽과 합류를 감추고 합류에서 나가던 선(같은 ID)이 분기에서 나간다", () => {
    const flow = must(insertSplit(toEditFlow(null, ["A", "B"]), "e2", "PARALLEL")); // r1 → par1 [e4·e5 → m1] → m1 → e6 → r2
    const v = collapseView(flow, new Set(["par1"]));
    expect(v.blocks.par1.count).toBe(0);
    expect([...v.hidden]).toEqual(["m1"]);
    expect(v.flow.edges.find((e) => e.id === "e6")).toMatchObject({ from: "par1", to: "r2" });
    expect(v.flow.edges.filter((e) => e.from === "par1")).toHaveLength(1);
  });

  it("접은 IF 는 안쪽을 감추고 꼬리 선 대신 대표 선 fold:{분기} 가 모이는 자리로 간다(implicit-join §8.4)", () => {
    const flow = ifFlow();
    const members = blockMembers(flow, "if1")!;
    const join = joinOf(flow, "if1")!;
    expect(members).not.toContain(join);
    const inner = members.filter((id) => id !== "if1");
    expect(inner).toHaveLength(3); // 갈래 룰 둘 + 「갈래 1」 빈 단계

    const v = collapseView(flow, new Set(["if1"]));
    expect(v.blocks.if1.count).toBe(3);
    expect([...v.hidden].sort()).toEqual([...inner].sort());
    for (const h of v.hidden) expect(ids(v.flow)).not.toContain(h);
    const moved = v.flow.edges.find((e) => e.id === `${FOLD_EDGE_PREFIX}if1`)!;
    expect(moved.from).toBe("if1");
    expect(moved.to).toBe(join);
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
    // 바깥이 이길 때 개수는 바깥 안쪽 전부(안쪽 분기 포함, 새 형식 IF 는 분기만 뺀다)다.
    expect(both.blocks[outer].count).toBe(blockMembers(flow, outer)!.length - 1);
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

  it("접힌 분기에 갈래를 더하면(노드는 그대로, 선만 늘어도) 펴진다", async () => {
    const flow = ifFlow();
    await mount(flow, "S1");
    await act(async () => h.current.toggle("if1"));
    await rerender(must(addBranch(flow, "if1")), "S1");
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
    const innerRule = blockMembers(flow, inner)!.find((id) => id !== inner)!; // 안쪽 IF 의 「갈래 1」 빈 단계
    await act(async () => h.current.expandFor(inner)); // 안쪽 분기 자신은 바깥 안에 있어 바깥만 핀다
    expect([...h.current.collapsed]).toEqual([inner]);
    await act(async () => h.current.expandFor(inner));
    expect([...h.current.collapsed]).toEqual([inner]);
    await act(async () => h.current.expandFor(innerRule));
    expect(h.current.collapsed.size).toBe(0);
  });
});

describe("collapseView — 새 형식 IF(implicit-join spec §8.4, R20)", () => {
  const N = (id: string, kind: FlowNode["kind"], ruleId: string | null = null): FlowNode => ({ id, kind, ruleId, splitId: null, label: null });
  const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });

  it("꼬리·끝 선을 빼고 대표 선 fold:{s} 하나를 첫 꼬리 자리에 두며, 안쪽 수는 멤버 − 1 이다", () => {
    const f = toEditFlow({ version: 1, nodes: [N("start", "START"), N("if1", "IF"), N("k", "RULE", "K"), N("z", "RULE", "Z"), N("a", "RULE", "A"), N("end", "END")],
      edges: [E("e0", "start", "if1"), E("b1", "if1", "k", { order: 1, cond: "X > 0" }), E("b2", "if1", "z", { order: 2, cond: "X > 1" }), E("bo", "if1", "a", { otherwise: true }),
        E("ek", "k", "end"), E("ez", "z", "a"), E("ea", "a", "end")] }, []);
    const v = collapseView(f, new Set(["if1"]));
    expect([...v.hidden].sort()).toEqual(["k", "z"]);
    expect(v.blocks.if1.count).toBe(2);
    expect(v.flow.edges.map((e) => `${e.id}:${e.from}>${e.to}`)).toEqual(["e0:start>if1", "fold:if1:if1>a", "ea:a>end"]);
  });
});
