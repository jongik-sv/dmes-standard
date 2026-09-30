// 룰 세트 흐름 편집 연산 3단계(계획 P6) — 옮기기·룰 바꾸기·복사·붙여넣기·복제·분기 종류·분기 풀기·갈래 순서.
import { describe, expect, it } from "vitest";

import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";
import {
  NODE_LIMIT_MESSAGE, addBranch, blockMembers, changeSplitKind, copyFragment, dissolveSplit, duplicateNode, flowJsonOf, insertRule,
  insertSplit, moveExcludedEdges, moveNode, pasteFragment, reorderBranches, replaceRule, toEditFlow, updateEdge,
  type EditFlow, type EditResult, type Fragment,
} from "../../../pages/dme/ruleSetEdit/flow-edit";

const NODE_KEYS = ["id", "kind", "ruleId", "splitId", "label"];
const EDGE_KEYS = ["id", "from", "to", "order", "cond", "otherwise", "label"];

function ok(r: EditResult): EditFlow {
  if (!r.ok) throw new Error(r.reason);
  for (const n of r.flow.nodes) expect(Object.keys(n)).toEqual(NODE_KEYS);
  for (const e of r.flow.edges) expect(Object.keys(e)).toEqual(EDGE_KEYS);
  return r.flow;
}
function valid(f: EditFlow) {
  expect(parseFlow(f).issues).toEqual([]);
  return f;
}

/** start → r1 → if1{e4 조건 "true" / e5 그 외} → m1 → r2 → end. 선: e1 start→r1, e2 r1→if1, e4·e5 if1→m1, e6 m1→r2, e3 r2→end. */
function ifFlow(): EditFlow {
  const f = ok(insertSplit(toEditFlow(null, ["R_A", "R_B"]), "e2", "IF"));
  const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id;
  return ok(updateEdge(f, cond, { cond: "true" }));
}

describe("flow-edit 3단계", () => {
  const base = toEditFlow(null, ["R_A", "R_B", "R_C"]); // start → r1 → r2 → r3 → end (e1..e4)

  it("ifFlow 도우미는 2단계 insertSplit 규칙의 ID 를 쓴다", () => {
    const f = valid(ifFlow());
    expect(f.nodes.map((n) => n.id)).toEqual(["start", "r1", "if1", "m1", "r2", "end"]);
    expect(f.edges.map((e) => `${e.id}:${e.from}>${e.to}`)).toEqual(["e1:start>r1", "e2:r1>if1", "e4:if1>m1", "e5:if1>m1", "e6:m1>r2", "e3:r2>end"]);
  });

  it("moveNode — 룰을 다른 선으로 옮기고 떠난 자리를 잇는다", () => {
    const f = valid(ok(moveNode(base, "r1", "e4")));
    expect(parseFlow(f).tree?.ruleIds()).toEqual(["R_B", "R_C", "R_A"]);
    expect(f.edges.find((e) => e.id === "e1")?.to).toBe("r2");
    // 노드 배열 순서·view 는 그대로, 새 출구 선은 대상 선 바로 뒤, 방금 지운 선 ID(e2)를 다시 쓰지 않는다
    expect(f.nodes.map((n) => n.id)).toEqual(base.nodes.map((n) => n.id));
    expect(f.edges.map((e) => e.id)).toEqual(["e1", "e3", "e4", "e5"]);
    expect(f.edges.find((e) => e.id === "e5")).toMatchObject({ from: "r1", to: "end" });
  });

  it("moveNode — 자기 앞뒤 선·시작·끝·합류는 거부한다", () => {
    expect(moveNode(base, "r2", "e2")).toEqual({ ok: false, reason: "자기 자리나 자기 블록 안으로는 옮길 수 없다" });
    expect(moveNode(base, "r2", "e3")).toEqual({ ok: false, reason: "자기 자리나 자기 블록 안으로는 옮길 수 없다" });
    expect(moveNode(base, "start", "e3")).toEqual({ ok: false, reason: "시작 노드는 옮길 수 없다" });
    expect(moveNode(base, "end", "e1")).toEqual({ ok: false, reason: "끝 노드는 옮길 수 없다" });
    expect(moveNode(ifFlow(), "m1", "e1")).toEqual({ ok: false, reason: "합류 노드는 분기를 옮겨서 옮긴다" });
    expect(moveNode(base, "r2", "e9")).toEqual({ ok: false, reason: "선 e9를 찾지 못했다" });
    expect(moveNode(base, "r9", "e1")).toEqual({ ok: false, reason: "노드 r9를 찾지 못했다" });
  });

  it("moveNode — 선이 하나씩이 아닌 룰은 옮기기 문구로 거부한다", () => {
    const f = { ...base, edges: [...base.edges, { id: "e9", from: "r1", to: "r3", order: null, cond: null, otherwise: false, label: null }] };
    expect(moveNode(f, "r1", "e4")).toEqual({ ok: false, reason: "룰 노드의 선이 하나씩이 아니라 옮길 수 없다. 선을 먼저 정리한다" });
  });

  it("moveNode — 분기 블록 전체를 옮기고 자기 블록 안 선은 거부한다", () => {
    const f = ifFlow(); // start → r1 → if1{…} → m1 → r2 → end
    const inner = f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id;
    expect(moveNode(f, "if1", inner)).toEqual({ ok: false, reason: "자기 자리나 자기 블록 안으로는 옮길 수 없다" });
    expect(moveNode(f, "if1", "e2").ok).toBe(false); // 분기로 들어오는 선
    expect(moveNode(f, "if1", "e6").ok).toBe(false); // 합류에서 나가는 선
    const g = valid(ok(moveNode(f, "if1", "e1"))); // start 바로 뒤로
    expect(g.edges.find((e) => e.id === "e1")?.to).toBe("if1");
    expect(g.edges.find((e) => e.id === "e2")?.to).toBe("r2"); // 떠난 자리를 잇는다
    expect(g.edges.some((e) => e.from === "m1" && e.to === "r1")).toBe(true);
    expect(parseFlow(g).tree?.ruleIds()).toEqual(["R_A", "R_B"]); // 안쪽 룰 없음, 순서 유지
    expect(moveExcludedEdges(f, "if1").has(inner)).toBe(true);
    expect(blockMembers(f, "if1")).toEqual(["if1", "m1"]);
  });

  it("moveExcludedEdges·blockMembers — 룰은 앞뒤 선, 분기는 들어옴·나감·블록 안 선, 그 밖은 빈 집합", () => {
    expect([...moveExcludedEdges(base, "r2")].sort()).toEqual(["e2", "e3"]);
    expect([...moveExcludedEdges(ifFlow(), "if1")].sort()).toEqual(["e2", "e4", "e5", "e6"]);
    expect(moveExcludedEdges(base, "start").size).toBe(0);
    expect(moveExcludedEdges(ifFlow(), "m1").size).toBe(0);
    expect(blockMembers(base, "r1")).toBeNull();
    const nested = ok(insertRule(ifFlow(), "e4", "R_IN"));
    expect(blockMembers(nested, "if1")).toEqual(["if1", "r3", "m1"]); // 흐름 노드 배열 순서(insertRule 은 새 노드를 if1 뒤에 둔다)
    const broken = { ...nested, edges: nested.edges.filter((e) => e.from !== "m1") }; // 합류 나감이 없어도 블록은 닫혀 있다
    expect(blockMembers(broken, "if1")).toEqual(["if1", "r3", "m1"]);
    const open = { ...nested, nodes: nested.nodes.filter((n) => n.id !== "m1") };
    expect(blockMembers(open, "if1")).toBeNull();
    expect(moveExcludedEdges(open, "if1").size).toBe(0);
  });

  it("moveNode — 중첩 분기를 바깥으로 옮긴다", () => {
    const f = ok(insertSplit(ifFlow(), "e4", "IF")); // if1 의 조건 갈래 e4 안에 if2{e7 / e8 그 외} → m2, 출구 e9(m2→m1)
    const g0 = valid(ok(updateEdge(f, "e7", { cond: "false" })));
    expect(blockMembers(g0, "if1")).toEqual(["if1", "if2", "m2", "m1"]);
    expect(moveNode(g0, "if1", "e7").ok).toBe(false); // 안쪽 분기의 선도 자기 블록 안이다
    const g = valid(ok(moveNode(g0, "if2", "e3"))); // r2 → end 사이로
    expect(g.edges.find((e) => e.id === "e3")?.to).toBe("if2");
    expect(g.edges.find((e) => e.id === "e4")).toMatchObject({ to: "m1", cond: "true", order: 1 }); // 바깥 갈래는 비고 조건은 남는다
    expect(g.edges.find((e) => e.from === "m2")).toMatchObject({ id: "e10", to: "end" });
    expect(blockMembers(g, "if1")).toEqual(["if1", "m1"]);
    expect(blockMembers(g, "if2")).toEqual(["if2", "m2"]);
  });

  it("moveNode — IF 갈래 선에 옮겨 넣으면 갈래 조건이 남는다", () => {
    const f = ok(insertRule(ifFlow(), "e3", "R_Z")); // 흐름 뒤쪽에 룰 하나 더
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    const z = f.nodes.find((n) => n.ruleId === "R_Z")!.id;
    const g = valid(ok(moveNode(f, z, cond.id)));
    expect(g.edges.find((e) => e.id === cond.id)).toMatchObject({ to: z, cond: "true", order: 1 });
    expect(g.edges.find((e) => e.from === z)?.to).toBe("m1");
  });

  it("moveNode — 갈래 안 유일한 룰을 빼면 갈래 선이 조건을 지닌 채 합류로 간다", () => {
    const f = ok(insertRule(ifFlow(), "e4", "R_IN"));
    const g = valid(ok(moveNode(f, "r3", "e1")));
    expect(g.edges.find((e) => e.id === "e4")).toMatchObject({ from: "if1", to: "m1", cond: "true", order: 1 });
    expect(parseFlow(g).tree?.ruleIds()).toEqual(["R_IN", "R_A", "R_B"]);
  });

  it("replaceRule — ruleId 만 바꾼다", () => {
    const f = valid(ok(replaceRule(base, "r2", "R_NEW")));
    expect(f.nodes.find((n) => n.id === "r2")?.ruleId).toBe("R_NEW");
    expect(flowJsonOf({ ...f, nodes: f.nodes.map((n) => (n.id === "r2" ? { ...n, ruleId: "R_B" } : n)) })).toBe(flowJsonOf(base));
    expect(ok(replaceRule(base, "r2", "R_A")).nodes.filter((n) => n.ruleId === "R_A")).toHaveLength(2); // 같은 룰이 있어도 막지 않는다
    expect(replaceRule(base, "start", "R")).toEqual({ ok: false, reason: "룰 노드만 룰을 바꾼다" });
    expect(replaceRule(base, "r2", "  ")).toEqual({ ok: false, reason: "룰 ID 가 비었다" });
  });

  it("copy/paste — 블록을 새 ID 로 붙여 넣고 조건식을 복사한다", () => {
    const f = ifFlow();
    const frag = copyFragment(f, "if1");
    if (typeof frag === "string") throw new Error(frag);
    expect(frag.entry).toBe("if1");
    expect(frag.exit).toBe("m1");
    expect(frag.edges.map((e) => e.id)).toEqual(["e4", "e5"]);
    const g = valid(ok(pasteFragment(f, "e1", frag)));
    const ifs = g.nodes.filter((n) => n.kind === "IF").map((n) => n.id);
    expect(ifs).toHaveLength(2);
    const newIf = ifs.find((id) => id !== "if1")!;
    expect(g.nodes.find((n) => n.kind === "MERGE" && n.splitId === newIf)).toBeTruthy();
    expect(g.edges.filter((e) => e.from === newIf && !e.otherwise).map((e) => e.cond)).toEqual(["true"]);
    expect(g.edges.filter((e) => e.from === newIf).map((e) => [e.order, e.otherwise, e.label])).toEqual([[1, false, "갈래 1"], [null, true, "그 외"]]);
    expect(g.edges.find((e) => e.id === "e1")?.to).toBe(newIf);
    expect(g.nodes.map((n) => n.id).indexOf(newIf)).toBe(1); // start 뒤
    expect(g.view.positions).toEqual({}); // 위치는 넣지 않는다(P-D18)
    expect(copyFragment(f, "m1")).toBe("시작·끝·합류는 복사하지 않는다. 분기를 복사하면 합류가 함께 복사된다");
    expect(copyFragment(f, "start")).toBe("시작·끝·합류는 복사하지 않는다. 분기를 복사하면 합류가 함께 복사된다");
    const open = { ...f, nodes: f.nodes.filter((n) => n.id !== "m1") };
    expect(copyFragment(open, "if1")).toBe("분기 if1의 블록을 찾지 못해 복사할 수 없다");
  });

  it("copyFragment — 깊은 복사라 조각을 고쳐도 흐름이 바뀌지 않는다", () => {
    const f = ifFlow();
    const before = flowJsonOf(f);
    const frag = copyFragment(f, "if1") as Fragment;
    frag.nodes[0].label = "X";
    frag.edges[0].cond = "false";
    expect(flowJsonOf(f)).toBe(before);
    const r = copyFragment(base, "r2") as Fragment;
    expect(r).toEqual({ nodes: [{ id: "r2", kind: "RULE", ruleId: "R_B", splitId: null, label: null }], edges: [], entry: "r2", exit: "r2" });
    expect(pasteFragment(base, "e9", r)).toEqual({ ok: false, reason: "선 e9를 찾지 못했다" });
  });

  it("duplicateNode — 원본 바로 뒤에 붙는다", () => {
    const f = valid(ok(duplicateNode(base, "r1")));
    // ruleIds() 는 중복을 없애므로(flow-model.ts ruleIds) 복제 결과는 ruleSteps() 로 본다
    expect(parseFlow(f).tree?.ruleSteps().map((s) => s.ruleId)).toEqual(["R_A", "R_A", "R_B", "R_C"]);
    expect(f.nodes.map((n) => n.id)).toEqual(["start", "r1", "r4", "r2", "r3", "end"]);
    const g = valid(ok(duplicateNode(ifFlow(), "if1")));
    expect(g.nodes.filter((n) => n.kind === "IF")).toHaveLength(2);
    expect(g.edges.find((e) => e.id === "e6")?.to).toBe("if2"); // 짝 합류 뒤
    expect(duplicateNode(base, "end")).toEqual({ ok: false, reason: "시작·끝·합류는 복사하지 않는다. 분기를 복사하면 합류가 함께 복사된다" });
  });

  it("붙여 넣은 결과가 200 을 넘으면 거부한다", () => {
    const big = toEditFlow(null, Array.from({ length: 198 }, (_, i) => `R${i}`)); // 노드 200
    const frag = copyFragment(big, "r1") as Fragment;
    expect(pasteFragment(big, "e1", frag)).toEqual({ ok: false, reason: NODE_LIMIT_MESSAGE });
    expect(duplicateNode(big, "r1")).toEqual({ ok: false, reason: NODE_LIMIT_MESSAGE });
    expect(NODE_LIMIT_MESSAGE).toBe("노드는 흐름 하나에 200개까지 둔다");
  });

  it("changeSplitKind — IF↔병렬 왕복", () => {
    const f = ifFlow();
    const p = valid(ok(changeSplitKind(f, "if1", "PARALLEL")));
    expect(p.nodes.find((n) => n.id === "if1")).toMatchObject({ kind: "PARALLEL", label: "병렬" });
    expect(p.edges.filter((e) => e.from === "if1").map((e) => [e.order, e.cond, e.otherwise, e.label])).toEqual([[1, null, false, "갈래 1"], [2, null, false, "갈래 2"]]);
    const back = ok(changeSplitKind(p, "if1", "IF"));
    expect(back.nodes.find((n) => n.id === "if1")).toMatchObject({ kind: "IF", label: "조건" });
    expect(back.edges.filter((e) => e.from === "if1").map((e) => [e.order, e.otherwise, e.label])).toEqual([[1, false, "갈래 1"], [null, true, "그 외"]]);
    expect(parseFlow(back).issues.map((i) => i.code)).toEqual(["FLOW_IF_ELSE"]); // 조건식이 비어 검사가 드러낸다
    expect(changeSplitKind(f, "if1", "IF")).toEqual({ ok: false, reason: "이미 IF 분기다" });
    expect(changeSplitKind(p, "if1", "PARALLEL")).toEqual({ ok: false, reason: "이미 병렬 분기다" });
    expect(changeSplitKind(f, "r1", "IF")).toEqual({ ok: false, reason: "분기 노드만 바꾼다" });
    const open = { ...f, nodes: f.nodes.filter((n) => n.id !== "m1") };
    expect(changeSplitKind(open, "if1", "PARALLEL")).toEqual({ ok: false, reason: "분기 if1의 짝 합류를 찾지 못했다" });
  });

  it("changeSplitKind — 사용자가 붙인 라벨은 그대로 둔다", () => {
    let f = ok(insertSplit(base, "e2", "PARALLEL"));
    f = ok(addBranch(f, "par1"));
    const ids = f.edges.filter((e) => e.from === "par1").map((e) => e.id);
    f = ok(updateEdge(f, ids[1], { label: "야간" }));
    f = { ...f, nodes: f.nodes.map((n) => (n.id === "par1" ? { ...n, label: "동시 계산" } : n)) };
    const g = ok(changeSplitKind(f, "par1", "IF"));
    expect(g.nodes.find((n) => n.id === "par1")).toMatchObject({ kind: "IF", label: "동시 계산" });
    expect(ids.map((id) => { const e = g.edges.find((x) => x.id === id)!; return [e.order, e.otherwise, e.label]; }))
      .toEqual([[1, false, "갈래 1"], [2, false, "야간"], [null, true, "그 외"]]);
  });

  it("dissolveSplit — 고른 갈래만 남기고, 빈 갈래를 고르면 앞뒤를 잇는다", () => {
    const f = ok(insertRule(ifFlow(), ifFlow().edges.find((e) => e.from === "if1" && !e.otherwise)!.id, "R_IN"));
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!.id;
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!.id;
    const kept = valid(ok(dissolveSplit(f, "if1", cond)));
    expect(parseFlow(kept).tree?.ruleIds()).toEqual(["R_A", "R_IN", "R_B"]);
    expect(kept.nodes.some((n) => n.kind === "IF" || n.kind === "MERGE")).toBe(false);
    expect(kept.edges.find((e) => e.id === "e2")?.to).toBe("r3"); // 분기로 들어오던 선이 갈래 첫 노드로
    const empty = valid(ok(dissolveSplit(f, "if1", other)));
    expect(parseFlow(empty).tree?.ruleIds()).toEqual(["R_A", "R_B"]);
    expect(empty.edges.find((e) => e.id === "e2")?.to).toBe("r2");
    expect(dissolveSplit(f, "r1", cond)).toEqual({ ok: false, reason: "분기 노드만 푼다" });
    expect(dissolveSplit(f, "if1", "e1")).toEqual({ ok: false, reason: "분기 if1의 갈래가 아니다" });
    const open = { ...f, nodes: f.nodes.filter((n) => n.id !== "m1") };
    expect(dissolveSplit(open, "if1", cond)).toEqual({ ok: false, reason: "분기 if1의 짝 합류를 찾지 못해 풀 수 없다" });
  });

  it("dissolveSplit — 지운 노드의 배치·그룹을 치운다", () => {
    const f0 = ok(insertRule(ifFlow(), "e5", "R_OUT"));
    const f = { ...f0, view: { positions: { r3: { x: 1, y: 2 }, r1: { x: 0, y: 0 } }, notes: [], groups: [{ id: "g1", title: "그룹", nodeIds: ["r3", "r1"] }] } };
    const g = valid(ok(dissolveSplit(f, "if1", "e4")));
    expect(g.nodes.some((n) => n.id === "r3")).toBe(false);
    expect(g.view.positions).toEqual({ r1: { x: 0, y: 0 } });
    expect(g.view.groups).toEqual([{ id: "g1", title: "그룹", nodeIds: ["r1"] }]);
  });

  it("reorderBranches — 그 외는 마지막에 남는다", () => {
    let f = ok(insertSplit(base, "e2", "PARALLEL"));
    f = ok(addBranch(f, "par1"));
    const ids = f.edges.filter((e) => e.from === "par1").map((e) => e.id);
    const g = valid(ok(reorderBranches(f, "par1", [ids[2], ids[0], ids[1]])));
    expect(ids.map((id) => g.edges.find((e) => e.id === id)?.order)).toEqual([2, 3, 1]);
    expect(g.edges.map((e) => e.id)).toEqual(f.edges.map((e) => e.id)); // 선 배열 순서 그대로
    expect(reorderBranches(f, "par1", [ids[0]])).toEqual({ ok: false, reason: "갈래 목록이 맞지 않는다" });
    expect(reorderBranches(f, "par1", [ids[0], ids[0], ids[1]])).toEqual({ ok: false, reason: "갈래 목록이 맞지 않는다" });
    const i = ok(addBranch(ifFlow(), "if1"));
    const conds = i.edges.filter((e) => e.from === "if1" && !e.otherwise).map((e) => e.id);
    const other = i.edges.find((e) => e.from === "if1" && e.otherwise)!.id;
    expect(reorderBranches(i, "if1", [...conds, other])).toEqual({ ok: false, reason: "갈래 목록이 맞지 않는다" });
    const j = ok(reorderBranches(i, "if1", [conds[1], conds[0]]));
    expect(j.edges.filter((e) => e.from === "if1").map((e) => [e.id, e.order, e.otherwise])).toEqual([[conds[0], 2, false], [conds[1], 1, false], [other, null, true]]);
  });

  it("모든 연산은 입력을 바꾸지 않는다", () => {
    const f = ifFlow();
    const before = flowJsonOf(f);
    moveNode(f, "if1", "e1"); duplicateNode(f, "r1"); changeSplitKind(f, "if1", "PARALLEL");
    dissolveSplit(f, "if1", f.edges.find((e) => e.from === "if1")!.id); replaceRule(f, "r1", "X");
    pasteFragment(f, "e1", copyFragment(f, "if1") as Fragment); reorderBranches(f, "if1", ["e4"]);
    expect(flowJsonOf(f)).toBe(before);
  });
});
