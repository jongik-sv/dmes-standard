import { describe, expect, it } from "vitest";

import { insertSplit, toEditFlow, updateEdge, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
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
