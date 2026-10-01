import { describe, expect, it } from "vitest";

import { insertRule, insertSplit, insertTask, toEditFlow, updateEdge, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE, autoLayout, positionsOf } from "../../../pages/dme/ruleSetEdit/flow-layout";

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
    expect(NODE_SIZE.MERGE).toEqual({ w: 28, h: 28 });
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
