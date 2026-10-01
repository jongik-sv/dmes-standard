import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode } from "../../../src/contract/engine-contract.generated";
import { insertRule, insertSplit, insertTask, toEditFlow, updateEdge, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, clearLayoutCache, endingRoutes, positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";

const N = (id: string, kind: FlowNode["kind"], ruleId: string | null = null): FlowNode => ({ id, kind, ruleId, splitId: null, label: null });
const E = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({ id, from, to, order: null, cond: null, otherwise: false, label: null, ...over });

/**
 * start → r1 → if1 [b1 갈래 1 → (t 빈 단계) → j][bo 그 외 → (rb 룰 R_B) → j] → j(모이는 자리, 룰 R_Z) → end — 합류 없는 IF(implicit-join §8.2).
 * first·other 가 거짓인 갈래는 j 로 바로 가는 빈 갈래다(빈 갈래는 하나만, B2). cond 가 null 이면 막 넣은 IF(조건식 빈).
 */
function ifShape(first: boolean, other: boolean, cond: string | null = "true"): EditFlow {
  const nodes = [N("start", "START"), N("r1", "RULE", "R_A"), N("if1", "IF"), ...(first ? [N("t", "TASK")] : []), ...(other ? [N("rb", "RULE", "R_B")] : []),
    N("j", "RULE", "R_Z"), N("end", "END")];
  const edges = [E("e1", "start", "r1"), E("e2", "r1", "if1"), E("b1", "if1", first ? "t" : "j", { order: 1, cond, label: "갈래 1" }),
    E("bo", "if1", other ? "rb" : "j", { otherwise: true, label: "그 외" }), ...(first ? [E("et", "t", "j")] : []), ...(other ? [E("eb", "rb", "j")] : []),
    E("ej", "j", "end")];
  return toEditFlow({ version: 1, nodes, edges }, []);
}
const ifFlow = () => ifShape(true, false);

describe("flow-layout", () => {
  it("위에서 아래로 쌓는다(시작 < 룰 < IF < 모이는 자리 < 끝)", () => {
    const p = autoLayout(ifFlow());
    expect(p.start.y).toBeLessThan(p.r1.y);
    expect(p.r1.y).toBeLessThan(p.if1.y);
    expect(p.if1.y).toBeLessThan(p.j.y);
    expect(p.j.y).toBeLessThan(p.end.y);
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
  it("IF 첫 갈래에 넣은 노드는 IF 가운데보다 왼쪽, 빈 그 외 갈래는 오른쪽이다", () => {
    const p = autoLayout(ifShape(true, false));
    expect(cx(p, "t", "TASK")).toBeLessThan(cx(p, "if1", "IF"));
  });
  it("첫 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 왼쪽이다(빈 갈래도 룰 하나 너비만큼 자리를 둔다)", () => {
    const p = autoLayout(ifShape(true, false));
    expect(p.t.x + NODE_SIZE.TASK.w).toBeLessThanOrEqual(cx(p, "if1", "IF"));
  });
  it("그 외 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 오른쪽이다", () => {
    const p = autoLayout(ifShape(false, true));
    expect(p.rb.x).toBeGreaterThanOrEqual(cx(p, "if1", "IF"));
  });
  it("두 갈래 모두 노드가 있으면 빈 갈래 자리 넓히기가 배치를 바꾸지 않는다(노드 사이 간격 = dagre 간격)", () => {
    const p = autoLayout(ifShape(true, true));
    expect(p.rb.x - (p.t.x + NODE_SIZE.TASK.w)).toBe(40);
  });
  it("그 외 갈래에 넣은 노드는 IF 가운데보다 오른쪽이다", () => {
    const p = autoLayout(ifShape(false, true));
    expect(cx(p, "rb", "RULE")).toBeGreaterThan(cx(p, "if1", "IF"));
  });
  it("두 갈래 모두 노드가 있으면 첫 갈래 노드가 왼쪽이다", () => {
    const p = autoLayout(ifShape(true, true));
    expect(cx(p, "t", "TASK")).toBeLessThan(cx(p, "rb", "RULE"));
  });
});

describe("flow-layout — 조건식이 빈 IF(막 넣은 IF)도 갈래 순서·빈 갈래 자리를 맞춘다(I3)", () => {
  const cx = (p: Record<string, { x: number }>, id: string, kind: keyof typeof NODE_SIZE) => p[id].x + NODE_SIZE[kind].w / 2;
  it("첫 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 왼쪽이다", () => {
    const p = autoLayout(ifShape(true, false, null));
    expect(p.t.x + NODE_SIZE.TASK.w).toBeLessThanOrEqual(cx(p, "if1", "IF"));
  });
  it("그 외 갈래에만 노드가 있으면 그 노드 상자 전체가 IF 가운데보다 오른쪽이다", () => {
    const p = autoLayout(ifShape(false, true, null));
    expect(p.rb.x).toBeGreaterThanOrEqual(cx(p, "if1", "IF"));
  });
  it("배치 계산은 흐름을 바꾸지 않는다(조건식은 빈 채로 남는다)", () => {
    const f = ifShape(true, false, null);
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

  it("본문 없는 끝내는 IF 갈래(IF → END 직결)도 기본 꺾은선이 다른 노드를 지나면 비켜 가는 경로를 만든다", () => {
    const f = toEditFlow({ version: 1,
      nodes: [N("start", "START"), N("if1", "IF"), N("a", "RULE"), N("b", "RULE"), N("end", "END")],
      edges: [E("s0", "start", "if1"), E("b1", "if1", "end", { order: 1, cond: "X > 0" }), E("bo", "if1", "a", { otherwise: true }), E("ea", "a", "b"), E("eb", "b", "end")] }, []);
    const pos = { start: { x: 56, y: -100 }, if1: { x: 28, y: 0 }, a: { x: 0, y: 120 }, b: { x: 0, y: 240 }, end: { x: 56, y: 360 } };
    expect(Object.keys(endingRoutes(f, pos))).toEqual(["b1"]);
  });
});

