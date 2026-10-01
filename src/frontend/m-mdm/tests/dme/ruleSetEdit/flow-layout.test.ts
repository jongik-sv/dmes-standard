import { describe, expect, it } from "vitest";

import { insertRule, insertSplit, insertTask, toEditFlow, updateEdge, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, clearLayoutCache, endingRoutes, positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";

function ifFlow(): EditFlow {
  const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
  if (!r.ok) throw new Error(r.reason);
  const c = r.flow.edges.find((e) => e.from === "if1" && !e.otherwise)!;
  const u = updateEdge(r.flow, c.id, { cond: "true" });
  if (!u.ok) throw new Error(u.reason);
  return u.flow;
}

describe("flow-layout", () => {
  it("위에서 아래로 쌓는다(시작 < 룰 < IF < 합류 < 끝)", () => {
    const p = autoLayout(ifFlow());
    expect(p.start.y).toBeLessThan(p.r1.y);
    expect(p.r1.y).toBeLessThan(p.if1.y);
    expect(p.if1.y).toBeLessThan(p.m1.y);
    expect(p.m1.y).toBeLessThan(p.end.y);
    for (const v of Object.values(p)) {
      expect(Number.isInteger(v.x)).toBe(true);
      expect(Number.isInteger(v.y)).toBe(true);
    }
  });
  it("저장된 위치가 자동 배치를 이긴다", () => {
    const f = { ...ifFlow(), view: { positions: { r1: { x: 999, y: 7 } }, notes: [], groups: [] } };
    expect(positionsOf(f).r1).toEqual({ x: 999, y: 7 });
  });
  it("노드 크기 표", () => {
    expect(NODE_SIZE.RULE).toEqual({ w: 232, h: 68 });
    expect(NODE_SIZE.MERGE).toEqual({ w: 200, h: 14 });
  });
});

describe("flow-layout — 갈래 순서대로 왼쪽부터(4단계 브라우저 확인)", () => {
  const cx = (p: Record<string, { x: number }>, id: string, kind: keyof typeof NODE_SIZE) => p[id].x + NODE_SIZE[kind].w / 2;
  /** IF 의 조건 갈래(첫 갈래)에 빈 단계를 넣는다 — 그 외 갈래는 비어 있다. */
  function ifWithTaskInFirst(): EditFlow {
    const f = ifFlow();
    const first = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const r = insertTask(f, first.id);
    if (!r.ok) throw new Error(r.reason);
    return r.flow;
  }
  it("IF 첫 갈래에 넣은 노드는 IF 가운데보다 왼쪽, 빈 그 외 갈래는 오른쪽이다", () => {
    const f = ifWithTaskInFirst();
    const t = f.nodes.find((n) => n.kind === "TASK")!.id;
    const p = autoLayout(f);
    expect(cx(p, t, "TASK")).toBeLessThan(cx(p, "if1", "IF"));
  });
  it("첫 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 왼쪽이다(빈 갈래도 룰 하나 너비만큼 자리를 둔다)", () => {
    const f = ifWithTaskInFirst();
    const t = f.nodes.find((n) => n.kind === "TASK")!.id;
    const p = autoLayout(f);
    expect(p[t].x + NODE_SIZE.TASK.w).toBeLessThanOrEqual(cx(p, "if1", "IF"));
  });
  it("그 외 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 오른쪽이다", () => {
    const f = ifFlow();
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    const r = insertTask(f, other.id);
    if (!r.ok) throw new Error(r.reason);
    const t = r.flow.nodes.find((n) => n.kind === "TASK")!.id;
    const p = autoLayout(r.flow);
    expect(p[t].x).toBeGreaterThanOrEqual(cx(p, "if1", "IF"));
  });
  it("두 갈래 모두 노드가 있으면 빈 갈래 자리 넓히기가 배치를 바꾸지 않는다(노드 사이 간격 = dagre 간격)", () => {
    const f = ifWithTaskInFirst();
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    const r = insertRule(f, other.id, "R_B");
    if (!r.ok) throw new Error(r.reason);
    const t = r.flow.nodes.find((n) => n.kind === "TASK")!.id;
    const rb = r.flow.nodes.find((n) => n.kind === "RULE" && n.ruleId === "R_B")!.id;
    const p = autoLayout(r.flow);
    expect(p[rb].x - (p[t].x + NODE_SIZE.TASK.w)).toBe(40);
  });
  it("그 외 갈래에 넣은 노드는 IF 가운데보다 오른쪽이다", () => {
    const f = ifFlow();
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    const r = insertTask(f, other.id);
    if (!r.ok) throw new Error(r.reason);
    const t = r.flow.nodes.find((n) => n.kind === "TASK")!.id;
    const p = autoLayout(r.flow);
    expect(cx(p, t, "TASK")).toBeGreaterThan(cx(p, "if1", "IF"));
  });
  it("두 갈래 모두 노드가 있으면 첫 갈래 노드가 왼쪽이다", () => {
    const f = ifWithTaskInFirst();
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    const r = insertRule(f, other.id, "R_B");
    if (!r.ok) throw new Error(r.reason);
    const t = r.flow.nodes.find((n) => n.kind === "TASK")!.id;
    const rb = r.flow.nodes.find((n) => n.kind === "RULE" && n.ruleId === "R_B")!.id;
    const p = autoLayout(r.flow);
    expect(cx(p, t, "TASK")).toBeLessThan(cx(p, rb, "RULE"));
  });
});

describe("flow-layout — 조건식이 빈 IF(막 넣은 IF)도 갈래 순서·빈 갈래 자리를 맞춘다(I3)", () => {
  const cx = (p: Record<string, { x: number }>, id: string, kind: keyof typeof NODE_SIZE) => p[id].x + NODE_SIZE[kind].w / 2;
  /** 막 넣은 IF — 조건 갈래의 조건식이 비어 있다(흐름 검사는 FLOW_IF_ELSE 로 트리를 만들지 않는다). */
  function bareIf(): EditFlow {
    const r = insertSplit(toEditFlow(null, ["R_A"]), "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    expect(r.flow.edges.find((e) => e.from === "if1" && !e.otherwise)!.cond ?? "").toBe("");
    return r.flow;
  }
  it("첫 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 왼쪽이다", () => {
    const f = bareIf();
    const first = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const r = insertTask(f, first.id);
    if (!r.ok) throw new Error(r.reason);
    const t = r.flow.nodes.find((n) => n.kind === "TASK")!.id;
    const p = autoLayout(r.flow);
    expect(p[t].x + NODE_SIZE.TASK.w).toBeLessThanOrEqual(cx(p, "if1", "IF"));
  });
  it("그 외 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 오른쪽이다", () => {
    const f = bareIf();
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    const r = insertTask(f, other.id);
    if (!r.ok) throw new Error(r.reason);
    const t = r.flow.nodes.find((n) => n.kind === "TASK")!.id;
    const p = autoLayout(r.flow);
    expect(p[t].x).toBeGreaterThanOrEqual(cx(p, "if1", "IF"));
  });
  it("배치 계산은 흐름을 바꾸지 않는다(조건식은 빈 채로 남는다)", () => {
    const f = bareIf();
    const before = JSON.stringify(f);
    autoLayout(f);
    expect(JSON.stringify(f)).toBe(before);
  });
});

describe("자동 배치 — 합류 없애기(implicit-join spec §9)", () => {
  const N = (id: string, kind: "START" | "END" | "RULE" | "IF") => ({ id, kind, ruleId: kind === "RULE" ? id.toUpperCase() : null, splitId: null, label: null });
  const E = (id: string, from: string, to: string, over: { order?: number; cond?: string; otherwise?: boolean } = {}) =>
    ({ id, from, to, order: over.order ?? null, cond: over.cond ?? null, otherwise: over.otherwise ?? false, label: null });
  /** start → r0 → if1 [b1 "X > 0" → e1 → e2 → end](끝내는 갈래) [그 외 → a] → a → b → end */
  const ending = () => toEditFlow({ version: 1,
    nodes: [N("start", "START"), N("r0", "RULE"), N("if1", "IF"), N("e1", "RULE"), N("e2", "RULE"), N("a", "RULE"), N("b", "RULE"), N("end", "END")],
    edges: [E("s0", "start", "r0"), E("s1", "r0", "if1"), E("b1", "if1", "e1", { order: 1, cond: "X > 0" }), E("ee1", "e1", "e2"), E("ee2", "e2", "end"),
      E("bo", "if1", "a", { otherwise: true }), E("ea", "a", "b"), E("eb", "b", "end")] }, []);

  it("병렬 합류는 병렬 분기와 같은 200×14 막대다", () => {
    expect(NODE_SIZE.MERGE).toEqual({ w: 200, h: 14 });
  });

  it("끝내는 IF 갈래 몸은 같은 높이의 IF 뒤 노드 오른쪽으로 비켜 놓는다", () => {
    clearLayoutCache();
    const pos = autoLayout(ending());
    const overlapY = (p: string, q: string) => pos[p].y < pos[q].y + 68 && pos[q].y < pos[p].y + 68;
    expect(overlapY("e1", "a")).toBe(true);
    expect(pos.e1.x).toBeGreaterThanOrEqual(pos.a.x + 232 + 40 - 1);
    expect(pos.e2.x).toBeGreaterThanOrEqual(pos.b.x + 232 + 40 - 1);
  });

  it("끝내는 IF 갈래 끝 선도 기본 꺾은선이 다른 노드를 지나면 비켜 가는 경로를 만든다", () => {
    const pos = { start: { x: 56, y: -200 }, r0: { x: 0, y: -120 }, if1: { x: 28, y: 0 }, e1: { x: 300, y: 100 }, e2: { x: 300, y: 200 },
      a: { x: 0, y: 150 }, b: { x: 0, y: 300 }, end: { x: 56, y: 400 } };
    expect(Object.keys(endingRoutes(ending(), pos))).toEqual(["ee2"]);
  });
});
