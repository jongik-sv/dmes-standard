import { describe, expect, it } from "vitest";

import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { edgeChips, edgeMarks, nearestEdge, nodeMarks } from "../../../pages/dme/ruleSetEdit/flow-vars";
import type { RuleIo, RuleSetCheck } from "../../../pages/dme/ruleSetEdit/types";

const io = (ruleId: string, results: string[]): RuleIo => ({
  ruleId, ruleName: ruleId, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [],
  results: results.map((name) => ({ name, source: null, label: null, dataType: "STRING", scale: null, dateString: false, maruCodeId: null })),
});
const chk = (severity: "REJECT" | "WARN", nodeId: string | null, edgeId: string | null): RuleSetCheck =>
  ({ code: "ORDER", severity, ruleId: null, otherRuleId: null, varName: null, message: "m", nodeId, edgeId });

describe("flow-vars", () => {
  const f = toEditFlow(null, ["R_A", "R_B"]); // start → r1 → r2 → end (e1, e2, e3)
  it("룰에서 나가는 선에 결과 변수 칩", () => {
    expect(edgeChips(f, { R_A: io("R_A", ["S_A", "S_A2"]), R_B: io("R_B", []) })).toEqual({ e2: ["S_A", "S_A2"] });
  });
  it("노드·선마다 가장 무거운 심각도", () => {
    expect(nodeMarks([chk("WARN", "r1", null), chk("REJECT", "r1", null), chk("WARN", "r2", null)])).toEqual({ r1: "REJECT", r2: "WARN" });
    expect(edgeMarks([chk("WARN", "if1", "e3")])).toEqual({ e3: "WARN" });
  });
  it("가장 가까운 선(중점 거리 80px 안)", () => {
    const pos = { start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, r2: { x: 0, y: 300 }, end: { x: 0, y: 500 } };
    expect(nearestEdge(f, pos, { x: 60, y: 200 })).toBe("e2");
    expect(nearestEdge(f, pos, { x: 900, y: 200 })).toBeNull();
  });
  it("exclude 로 가장 가까운 선을 빼면 다음으로 가까운 선이 나온다", () => {
    const pos = { start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, r2: { x: 0, y: 300 }, end: { x: 0, y: 500 } };
    const at = { x: 100, y: 155 }; // e2 중점 (116,234) 이 가장 가깝고 e1 중점 (88,68) 이 다음이다
    expect(nearestEdge(f, pos, at, 100)).toBe("e2");
    expect(nearestEdge(f, pos, at, 100, new Set(["e2"]))).toBe("e1");
    expect(nearestEdge(f, pos, at, 100, new Set(["e1", "e2", "e3"]))).toBeNull();
  });
});
