// 4단계 Task 9(T1) — 빈 단계(TASK) 편집 연산·흐름 해석·JSON 왕복·놓기 대상·디버거 기록 해석.
import { describe, expect, it } from "vitest";

import type { NodeTrace, RunTrace, TypedValue } from "../../../src/contract/engine-contract.generated";
import {
  TASK_LABEL, assignRule, copyFragment, duplicateNode, flowJsonOf, insertRule, insertSplit, insertTask, moveNode, removeNode, setPositions,
  setRoute, toEditFlow, updateEdge, type EditFlow, type EditResult,
} from "../../../pages/dme/ruleSetEdit/flow-edit";
import { NODE_SIZE } from "../../../pages/dme/ruleSetEdit/flow-layout";
import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";
import { nodeAtPoint } from "../../../pages/dme/ruleSetEdit/flow-vars";
import { flowChecks } from "../../../pages/dme/ruleSetEdit/set-model";
import { frames, overlayAt, valueTable } from "../../../pages/dme/ruleSetEdit/trace-view";
import type { RuleIo } from "../../../pages/dme/ruleSetEdit/types";

const NODE_KEYS = ["id", "kind", "ruleId", "splitId", "label"];
function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  for (const n of r.flow.nodes) expect(Object.keys(n)).toEqual(NODE_KEYS);
  return r.flow;
}
function valid(f: EditFlow) {
  expect(parseFlow(f).issues).toEqual([]);
  return f;
}
/** start → r1 → r2 → end. 선 e1 start→r1, e2 r1→r2, e3 r2→end. */
const base = () => toEditFlow(null, ["R_A", "R_B"]);
const nm = (n: string) => ({ name: n, source: "DICT" as const, label: null, dataType: null, scale: null, dateString: false, maruCodeId: null });
const io = (ruleId: string, cond: string, result: string): RuleIo => ({
  ruleId, ruleName: `${ruleId} 이름`, ruleKind: "DECISION", status: "INUSE", exists: true, releasedVer: 1, hitPolicy: "FIRST",
  conds: [nm(cond)], results: [{ ...nm(result), source: null }],
});

describe("빈 단계 편집 연산(4단계 Task 9)", () => {
  it("insertTask — 선 위에 TASK(룰 ID 없음, 기본 제목)를 insertRule 과 같은 자리·선 규칙으로 끼운다. ID 는 r 접두어", () => {
    const f = valid(ok(insertTask(base(), "e2")));
    expect(f.nodes.find((n) => n.kind === "TASK")).toEqual({ id: "r3", kind: "TASK", ruleId: null, splitId: null, label: TASK_LABEL });
    expect(f.edges.find((e) => e.id === "e2")!.to).toBe("r3");
    expect(f.edges.find((e) => e.from === "r3")!.to).toBe("r2");
    expect(f.nodes.map((n) => n.id)).toEqual(["start", "r1", "r3", "r2", "end"]);
    expect(parseFlow(f).tree?.ruleIds()).toEqual(["R_A", "R_B"]);
    expect(ok(insertTask(base(), "e2", "나중에")).nodes.find((n) => n.id === "r3")?.label).toBe("나중에");
    expect(insertTask(base(), "zz")).toEqual({ ok: false, reason: "선 zz를 찾지 못했다" });
  });

  it("assignRule — TASK 는 같은 ID·자리·선·경로·선 라벨·노드 라벨 그대로 RULE 이 되고, RULE 은 룰만 바뀐다", () => {
    let f = ok(insertTask(base(), "e2"));
    f = setPositions(f, { r3: { x: 40, y: 200 } });
    f = ok(setRoute(f, "e2", [{ x: 10, y: 150 }]));
    f = ok(updateEdge(f, "e2", { label: "들어옴" }));
    const before = flowJsonOf(f);
    const g = valid(ok(assignRule(f, "r3", "R_Z")));
    expect(flowJsonOf(f)).toBe(before); // 입력을 바꾸지 않는다
    expect(g.nodes.find((n) => n.id === "r3")).toEqual({ id: "r3", kind: "RULE", ruleId: "R_Z", splitId: null, label: TASK_LABEL });
    expect(g.view.positions.r3).toEqual({ x: 40, y: 200 });
    expect(g.view.routes.e2).toEqual([{ x: 10, y: 150 }]);
    expect(g.edges).toEqual(f.edges);
    expect(parseFlow(g).tree?.ruleIds()).toEqual(["R_A", "R_Z", "R_B"]);
    expect(ok(assignRule(g, "r1", "R_Y")).nodes.find((n) => n.id === "r1")?.ruleId).toBe("R_Y");
  });

  it("assignRule — 시작·끝·분기·합류와 빈 룰 ID 는 거부한다", () => {
    const f = ok(insertTask(base(), "e2"));
    expect(assignRule(f, "start", "R")).toEqual({ ok: false, reason: "빈 단계·룰 노드에만 룰을 지정한다" });
    expect(assignRule(f, "r3", " ")).toEqual({ ok: false, reason: "룰 ID 가 비었다" });
    expect(assignRule(f, "zz", "R")).toEqual({ ok: false, reason: "노드 zz를 찾지 못했다" });
  });

  it("빈 단계도 룰처럼 지우고(앞뒤 잇기)·옮기고·복사·복제한다", () => {
    const f = ok(insertTask(base(), "e2")); // start → r1 → r3(TASK) → r2 → end, r3 → r2 는 e4
    const del = valid(ok(removeNode(f, "r3")));
    expect(del.nodes.some((n) => n.id === "r3")).toBe(false);
    expect(del.edges.find((e) => e.id === "e2")!.to).toBe("r2");
    const moved = valid(ok(moveNode(f, "r3", "e3")));
    expect(moved.edges.find((e) => e.id === "e3")!.to).toBe("r3");
    expect(moved.edges.find((e) => e.id === "e2")!.to).toBe("r2");
    expect(typeof copyFragment(f, "r3")).toBe("object");
    const dup = valid(ok(duplicateNode(f, "r3")));
    expect(dup.nodes.filter((n) => n.kind === "TASK").map((n) => n.id)).toEqual(["r3", "r4"]);
    expect(dup.nodes.find((n) => n.id === "r4")?.label).toBe(TASK_LABEL);
  });

  it("흐름 JSON 왕복 — TASK 종류·제목이 남고 정규 문자열이 같다", () => {
    const f = ok(insertTask(base(), "e2", "나중에 채울 단계"));
    const json = flowJsonOf(f);
    const back = toEditFlow(JSON.parse(json), []);
    expect(flowJsonOf(back)).toBe(json);
    expect(back.nodes.find((n) => n.id === "r3")).toEqual({ id: "r3", kind: "TASK", ruleId: null, splitId: null, label: "나중에 채울 단계" });
  });

  it("흐름 해석 — 갈래 안 TASK 도 들어오고 나가는 선이 하나씩이면 된다. 관계는 알고 ruleSteps 에는 없다", () => {
    let f = ok(insertSplit(base(), "e2", "PARALLEL")); // r1 → par1{e4, e5} → m1 → r2
    f = valid(ok(insertTask(f, "e4")));
    const t = f.nodes.find((n) => n.kind === "TASK")!.id;
    const tree = parseFlow(f).tree!;
    expect(tree.relation("r1", t)).toBe("BEFORE");
    expect(tree.ruleSteps().map((s) => s.nodeId)).toEqual(["r1", "r2"]);
  });

  it("세트 검사 — 빈 단계는 룰 검사(없는 룰 등)의 거부를 만들지 않고 경로 검사가 멈추지 않는다", () => {
    const f = ok(insertTask(base(), "e2"));
    const rules = { R_A: io("R_A", "SET_THK", "S_A"), R_B: io("R_B", "S_A", "S_B") };
    const checks = flowChecks(f, rules, {});
    expect(checks.filter((c) => c.severity === "REJECT")).toEqual([]);
  });

  it("nodeAtPoint — 그린 상자 안의 주어진 종류 노드만, 밖이면 null", () => {
    const f = ok(insertTask(base(), "e2"));
    const pos = { start: { x: 0, y: 0 }, r1: { x: 0, y: 100 }, r3: { x: 0, y: 200 }, r2: { x: 0, y: 300 }, end: { x: 0, y: 400 } };
    const both = new Set(["TASK", "RULE"]);
    expect(nodeAtPoint(f, pos, { x: 10, y: 210 }, both)).toBe("r3");
    expect(nodeAtPoint(f, pos, { x: NODE_SIZE.TASK.w + 1, y: 210 }, both)).toBeNull();
    expect(nodeAtPoint(f, pos, { x: 10, y: 110 }, new Set(["TASK"]))).toBeNull();
    expect(nodeAtPoint(f, pos, { x: 10, y: 110 }, both)).toBe("r1");
    expect(NODE_SIZE.TASK).toEqual(NODE_SIZE.RULE); // 지정해도 크기가 같아 자리가 흔들리지 않는다
  });
});

describe("디버거 — 빈 단계 한 단계(4단계 Task 9)", () => {
  const S = (value: string): TypedValue => ({ type: "STRING", value });
  const nt = (seq: number, nodeId: string, kind: NodeTrace["kind"], extra: Partial<NodeTrace> = {}): NodeTrace =>
    ({ seq, nodeId, kind, status: "OK", ruleId: null, ver: null, reads: null, branches: null, chosenEdgeId: null, order: null, splitId: null, merged: null, violations: null, ...extra });
  /** start → r1 → par1{e4: r3(R_C) → r4(TASK) / e5: 빈} → m1 → r2 → end. */
  function parFlow(): EditFlow {
    let f = ok(insertSplit(base(), "e2", "PARALLEL"));
    f = ok(insertRule(f, "e4", "R_C"));
    const out = f.edges.find((e) => e.from === "r3")!.id;
    return valid(ok(insertTask(f, out)));
  }

  it("병렬 갈래 안 TASK 는 그 갈래 범위의 값을 보이고 아무것도 바꾸지 않는다. 겹침은 current(칩 없음), 값 표 열에 없다", () => {
    const f = parFlow();
    const trace = {
      setId: "S", evalTs: "2026-10-01T00:00:00", input: { IN: S("a") },
      nodes: [
        nt(1, "start", "START"),
        nt(2, "r1", "RULE", { ruleId: "R_A", ver: 1, result: { results: { X: S("1") } } as NodeTrace["result"] }),
        nt(3, "par1", "PARALLEL", { order: ["e4", "e5"] }),
        nt(4, "r3", "RULE", { ruleId: "R_C", ver: 1, result: { results: { Y: S("2") } } as NodeTrace["result"] }),
        nt(5, "r4", "TASK"),
        nt(6, "m1", "MERGE", { splitId: "par1", merged: ["e4", "e5"] }),
      ],
      finalValues: {}, violations: null,
    } as unknown as RunTrace;
    const fr = frames(trace, f);
    expect(fr[4].node.kind).toBe("TASK");
    expect(fr[4].changed).toEqual([]);
    expect(fr[4].before).toEqual(fr[4].ctx);
    expect(fr[4].ctx.Y).toEqual(S("2")); // 갈래 범위 — 루트 범위라면 합류 전이라 Y 가 없다
    const o = overlayAt(trace, f, 4);
    expect(o.nodes.r4.state).toBe("current");
    expect(o.nodes.r4.chip).toBeNull();
    expect(valueTable(trace, f).cols.map((c) => c.nodeId)).not.toContain("r4");
  });
});
