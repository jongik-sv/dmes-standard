// 노드 찾기(3단계 Task 8, B11) — 룰 ID·룰 이름·노드 라벨을 대소문자 무시로 흐름 노드 순서대로 찾는다.
import { describe, expect, it } from "vitest";

import { insertSplit, toEditFlow, updateNodeLabel } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { findNodes } from "../../../pages/dme/ruleSetEdit/state/useFind";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";

const io = (ruleId: string, ruleName: string): RuleIo => ({
  ruleId, ruleName, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST", conds: [], results: [],
});
const rules = { E2S_GRD: io("E2S_GRD", "등급 판정"), E2S_FCT: io("E2S_FCT", "Factor 계산"), E2S_GRD2: io("E2S_GRD2", "등급 재판정") };

describe("findNodes", () => {
  const flow = toEditFlow(null, ["E2S_GRD", "E2S_FCT", "E2S_GRD2"]);

  it("룰 ID 를 대소문자 무시로 흐름 노드 순서대로 찾는다", () => {
    expect(findNodes(flow, rules, "grd")).toEqual(["r1", "r3"]);
  });

  it("룰 이름으로 찾는다", () => {
    expect(findNodes(flow, rules, "factor")).toEqual(["r2"]);
    expect(findNodes(flow, rules, "등급")).toEqual(["r1", "r3"]);
  });

  it("노드 라벨로 찾는다", () => {
    const r = updateNodeLabel(flow, "r2", "검증 단계");
    if (!r.ok) throw new Error(r.reason);
    expect(findNodes(r.flow, rules, "검증")).toEqual(["r2"]);
  });

  it("빈 질의·공백·없는 흐름·맞는 것이 없으면 빈 목록", () => {
    expect(findNodes(flow, rules, "")).toEqual([]);
    expect(findNodes(flow, rules, "   ")).toEqual([]);
    expect(findNodes(null, rules, "grd")).toEqual([]);
    expect(findNodes(flow, rules, "없는말")).toEqual([]);
  });

  it("분기 노드도 라벨로 찾는다", () => {
    const r = insertSplit(flow, "e2", "IF");
    if (!r.ok) throw new Error(r.reason);
    const ifId = r.flow.nodes.find((n) => n.kind === "IF")!.id;
    expect(findNodes(r.flow, rules, "조건")).toEqual([ifId]);
  });
});
