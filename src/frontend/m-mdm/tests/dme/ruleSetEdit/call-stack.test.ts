// 하위 세트 spec §11 — 디버거 들어가기(순수 함수)와 SET 노드 값 흐름·칩·값 표.
import { describe, expect, it } from "vitest";

import type { NodeTrace, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import { callPath, caughtCount, enterFrame, frameValueAt, subTraceAt } from "../../../pages/dme/ruleSetEdit/debugger/call-stack";
import { toEditFlow } from "../../../pages/dme/ruleSetEdit/flow-edit";
import { debugOverlay, frames, valueTable } from "../../../pages/dme/ruleSetEdit/trace-view";
import type { CalledFlow } from "../../../pages/dme/ruleSetEdit/types";

const num = (v: string): TypedValue => ({ type: "NUMBER", value: v });
const nodeT = (seq: number, nodeId: string, kind: NodeTrace["kind"], over: Partial<NodeTrace> = {}): NodeTrace =>
  ({ seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null, violations: null, ...over }) as NodeTrace;

/** 하위 세트 CHILD: start → r1(C_A: A = Y + 1) → end. */
const sub: RunTrace = {
  setId: "CHILD", evalTs: "2026-10-01T09:00:00", input: { Y: num("1") },
  nodes: [
    nodeT(1, "start", "START"),
    nodeT(2, "r1", "RULE", { ruleId: "C_A", result: { ruleId: "C_A", ver: 1, evalTs: "2026-10-01T09:00:00", hits: [], defaultApplied: false, results: { A: num("2") }, trace: [], warnings: [] } as never }),
    nodeT(3, "end", "END"),
  ],
  finalValues: { A: num("2") }, violations: null,
} as RunTrace;

/** 부모: start → s1(SET CHILD, "단가 결정") → end. */
const parentFlow = toEditFlow(
  {
    version: 1,
    nodes: [
      { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
      { id: "s1", kind: "SET", ruleId: null, splitId: null, label: "단가 결정", setId: "CHILD" },
      { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
    ],
    edges: [
      { id: "e1", from: "start", to: "s1", order: null, cond: null, otherwise: false, label: null },
      { id: "e2", from: "s1", to: "end", order: null, cond: null, otherwise: false, label: null },
    ],
  },
  [],
);
const parent: RunTrace = {
  setId: "PARENT", evalTs: "2026-10-01T09:00:00", input: { Y: num("1") },
  nodes: [nodeT(1, "start", "START"), nodeT(2, "s1", "SET", { reads: { Y: num("1") }, outputs: { A: num("2") }, sub }), nodeT(3, "end", "END")],
  finalValues: { A: num("2") }, violations: null,
} as RunTrace;
const called: Record<string, CalledFlow> = { CHILD: { setId: "CHILD", setName: "하위", flow: null, ruleIds: ["C_A"], rules: [] } };

describe("call-stack", () => {
  it("SET 노드로 들어가면 하위 기록·하위 흐름(없으면 RULE_IDS 한 줄)·끝 커서의 프레임이다", () => {
    const f = enterFrame(parent, parentFlow, "s1", called)!;
    expect(f.setId).toBe("CHILD");
    expect(f.label).toBe("단가 결정");
    expect(f.flow.nodes.map((n) => n.id)).toEqual(["start", "r1", "end"]);
    expect(f.cursor).toBe(3);
    expect(f.trace).toBe(sub);
    expect(enterFrame(parent, parentFlow, "start", called)).toBeNull();
    expect(callPath("PARENT", [f])).toEqual(["세트 PARENT", "단가 결정(s1)"]);
  });

  it("하위 세트 흐름을 받지 못했으면(서버가 calledFlows 를 주지 않음) 들어가지 않는다", () => {
    expect(enterFrame(parent, parentFlow, "s1", {})).toBeNull();
  });

  it("SET 노드 라벨이 없으면 세트명, 세트명도 없으면 세트 ID 로 경로를 적는다", () => {
    const bare = { nodes: parentFlow.nodes.map((n) => (n.id === "s1" ? { ...n, label: " " } : n)) };
    expect(enterFrame(parent, bare, "s1", called)!.label).toBe("하위");
    expect(enterFrame(parent, bare, "s1", { CHILD: { ...called.CHILD, setName: null } })!.label).toBe("CHILD");
  });

  it("하위 흐름이 옛 형식(IF 합류)이면 편집기 변환을 거쳐 D-136 새 형식으로 그린다", () => {
    const legacy: CalledFlow = {
      setId: "CHILD", setName: "하위", ruleIds: ["C_A"], rules: [],
      flow: {
        version: 1,
        nodes: [
          { id: "start", kind: "START", ruleId: null, splitId: null, label: null },
          { id: "i1", kind: "IF", ruleId: null, splitId: null, label: null },
          { id: "r1", kind: "RULE", ruleId: "C_A", splitId: null, label: null },
          { id: "t1", kind: "TASK", ruleId: null, splitId: null, label: null },
          { id: "m1", kind: "MERGE", ruleId: null, splitId: "i1", label: null },
          { id: "end", kind: "END", ruleId: null, splitId: null, label: null },
        ],
        edges: [
          { id: "e1", from: "start", to: "i1", order: null, cond: null, otherwise: false, label: null },
          { id: "e2", from: "i1", to: "r1", order: 1, cond: "Y > 0", otherwise: false, label: null },
          { id: "e3", from: "i1", to: "t1", order: 2, cond: null, otherwise: true, label: null },
          { id: "e4", from: "r1", to: "m1", order: null, cond: null, otherwise: false, label: null },
          { id: "e5", from: "t1", to: "m1", order: null, cond: null, otherwise: false, label: null },
          { id: "e6", from: "m1", to: "end", order: null, cond: null, otherwise: false, label: null },
        ],
      },
    };
    const f = enterFrame(parent, parentFlow, "s1", { CHILD: legacy })!;
    expect(f.flow.nodes.some((n) => n.kind === "MERGE")).toBe(false);
  });

  it("같은 SET 노드 경로를 따라 다른 기록의 하위 기록을 찾는다", () => {
    expect(subTraceAt(parent, ["s1"])).toBe(sub);
    expect(subTraceAt(parent, ["s9"])).toBeNull();
    expect(subTraceAt(parent, ["s1", "s2"])).toBeNull();
    expect(subTraceAt(parent, [])).toBe(parent);
  });

  it("프레임 커서 자리 값과 받은 예외 건수", () => {
    const f = enterFrame(parent, parentFlow, "s1", called)!;
    expect(frameValueAt(f)("a")).toEqual(num("2"));
    expect(frameValueAt({ ...f, cursor: 0 })("A")).toBeUndefined();
    expect(frameValueAt({ ...f, cursor: 0 })("y")).toEqual(num("1"));
    expect(caughtCount(sub)).toBe(0);
    expect(caughtCount({ ...sub, nodes: [...sub.nodes.slice(0, 2), nodeT(3, "c1", "CATCH"), nodeT(4, "end", "END")] })).toBe(1);
  });
});

describe("SET 노드 값 흐름(trace-view)", () => {
  it("값 흐름·값 표는 SET 노드의 넘겨받은 출력을 결과처럼 쓴다", () => {
    const fr = frames(parent, parentFlow);
    expect(fr[1].changed).toEqual(["A"]);
    expect(fr[1].ctx).toEqual({ Y: num("1"), A: num("2") });
    const t = valueTable(parent, parentFlow);
    expect(t.vars).toEqual(["Y", "A"]);
    expect(t.cols.map((c) => c.label)).toEqual(["세트 CHILD"]);
    expect(t.cells).toEqual([[num("1")], [num("2")]]);
  });

  it("실행된 SET 노드의 칩은 넘겨받은 첫 출력이다", () => {
    expect(debugOverlay(parent, parentFlow, 3).nodes.s1.chip).toBe("A=2");
  });

  it("오류로 멈춘 SET 노드는 출력을 덮지 않고 값 표 열도 없다", () => {
    const failed = {
      ...parent,
      nodes: [parent.nodes[0], { ...parent.nodes[1], status: "ERROR", outputs: undefined, violations: [{ stage: "EVAL", code: "SET_NOT_FOUND", message: "없다" }] }],
    } as RunTrace;
    expect(frames(failed, parentFlow)[1].changed).toEqual([]);
    expect(valueTable(failed, parentFlow).cols).toEqual([]);
  });
});
