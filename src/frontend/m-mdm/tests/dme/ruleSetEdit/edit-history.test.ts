import { describe, expect, it } from "vitest";
import { insertRule, toEditFlow, flowJsonOf, type EditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { EditHistory } from "../../../pages/dme/ruleSetEdit/state/edit-history";

const step = (f: EditFlow, id: string): EditFlow => {
  const r = insertRule(f, f.edges[f.edges.length - 1].id, id);
  if (!r.ok) throw new Error(r.reason);
  return r.flow;
};

describe("EditHistory", () => {
  it("n 번 고치고 n 번 되돌리면 처음 정규 JSON 이다", () => {
    const h = new EditHistory();
    let f = toEditFlow(null, ["R_A"]);
    const first = flowJsonOf(f);
    for (const id of ["R1", "R2", "R3"]) { h.record(f); f = step(f, id); }
    for (let i = 0; i < 3; i++) f = h.undo(f)!;
    expect(flowJsonOf(f)).toBe(first);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);
    f = h.redo(f)!;
    expect(f.nodes.some((n) => n.ruleId === "R1")).toBe(true);
  });

  it("같은 칸을 1초 안에 고치면 한 번으로 합친다(가짜 시계)", () => {
    let now = 0;
    const h = new EditHistory(100, 1000, () => now);
    const f0 = toEditFlow(null, ["R_A"]);
    h.record(f0, "cond:e3"); now = 500;
    h.record(step(f0, "X"), "cond:e3"); now = 1400;
    h.record(step(f0, "Y"), "cond:e3");   // 직전 기록 뒤 900ms — 아직 합친다
    now = 2500;
    h.record(step(f0, "Z"), "cond:e3");   // 1100ms — 새 기록
    let cur = step(f0, "W");
    cur = h.undo(cur)!; cur = h.undo(cur)!;
    expect(flowJsonOf(cur)).toBe(flowJsonOf(f0));
    expect(h.canUndo).toBe(false);
  });

  it("상한 100 을 넘으면 가장 오래된 것을 버리고, 새 기록은 다시 하기를 비운다", () => {
    const h = new EditHistory(2);
    const f = toEditFlow(null, ["R_A"]);
    h.record(f); h.record(step(f, "A")); h.record(step(f, "B"));
    let cur = step(f, "C");
    cur = h.undo(cur)!; cur = h.undo(cur)!;
    expect(h.undo(cur)).toBeNull();
    h.record(cur);
    expect(h.canRedo).toBe(false);
  });

  it("키가 다르거나 없으면 합치지 않고, 되돌린 뒤의 같은 키 입력은 새 기록이다", () => {
    let now = 0;
    const h = new EditHistory(100, 1000, () => now);
    const f0 = toEditFlow(null, ["R_A"]);
    h.record(f0, "a"); now = 10; h.record(step(f0, "X"), "b"); now = 20; h.record(step(f0, "Y")); now = 30; h.record(step(f0, "Z"));
    let cur = step(f0, "W");
    for (let i = 0; i < 4; i++) cur = h.undo(cur)!;
    expect(flowJsonOf(cur)).toBe(flowJsonOf(f0));
    // undo 뒤 합치기가 끊긴다
    const h2 = new EditHistory(100, 1000, () => now);
    h2.record(f0, "k"); h2.record(step(f0, "P"), "z");
    h2.undo(step(f0, "Q"));
    h2.record(step(f0, "R"), "k");
    expect(h2.canUndo).toBe(true);
    expect(h2.undo(step(f0, "S"))).not.toBeNull();
    expect(h2.undo(step(f0, "S"))).not.toBeNull();
  });
});
