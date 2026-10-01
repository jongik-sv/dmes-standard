import { describe, expect, it } from "vitest";

import { parseFlow } from "../../../pages/dme/ruleSetEdit/flow-model";
import {
  EMPTY_VIEW, MAX_NODES, addBranch, addGroup, addNote, connect, flowJsonOf, insertRule, insertSplit, moveBranch, nextId,
  removeBranch, removeEdge, removeGroup, removeNode, removeNote, setPositions, toEditFlow, updateEdge, updateGroup, updateNodeLabel,
  updateNote, type EditFlow, type EditResult,
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

describe("flow-edit", () => {
  const base = toEditFlow(null, ["R_A"]); // start → r1 → end, 선 e1·e2

  it("null 흐름은 한 줄 흐름과 빈 view 다", () => {
    expect(base.nodes.map((n) => n.id)).toEqual(["start", "r1", "end"]);
    expect(base.view).toEqual(EMPTY_VIEW);
  });

  it("선 위에 룰을 끼운다", () => {
    const f = valid(ok(insertRule(base, "e2", "R_B")));
    expect(parseFlow(f).tree?.ruleIds()).toEqual(["R_A", "R_B"]);
    expect(f.nodes.find((n) => n.ruleId === "R_B")?.id).toBe("r2");
  });

  it("IF 를 끼우면 합류 없이 조건 갈래(빈 단계)·그 외 갈래가 생기고, 조건식을 채우면 검사 오류가 없다(implicit-join §8.2)", () => {
    const f = ok(insertSplit(base, "e2", "IF"));
    expect(parseFlow(f).issues.map((i) => i.code)).toEqual(["FLOW_IF_ELSE"]); // 조건식 없음
    const out = f.edges.filter((e) => e.from === "if1");
    expect(out.map((e) => [e.order, e.otherwise, e.label])).toEqual([[1, false, "갈래 1"], [null, true, "그 외"]]);
    const g = valid(ok(updateEdge(f, out[0].id, { cond: 'S_A = "X"' })));
    expect(g.nodes.some((n) => n.kind === "MERGE")).toBe(false);
    expect(g.nodes.find((n) => n.id === out[0].to)?.kind).toBe("TASK");
  });

  it("병렬을 끼우고 갈래를 더하고 옮기고 지운다", () => {
    let f = valid(ok(insertSplit(base, "e1", "PARALLEL")));
    f = valid(ok(addBranch(f, "par1")));
    const orders = () => f.edges.filter((e) => e.from === "par1").map((e) => [e.label, e.order]);
    expect(orders()).toEqual([["갈래 1", 1], ["갈래 2", 2], ["갈래 3", 3]]);
    const third = f.edges.filter((e) => e.from === "par1")[2].id;
    f = valid(ok(moveBranch(f, "par1", third, -1)));
    expect(f.edges.find((e) => e.id === third)?.order).toBe(2);
    f = valid(ok(removeBranch(f, "par1", third)));
    expect(f.edges.filter((e) => e.from === "par1")).toHaveLength(2);
    expect(removeBranch(f, "par1", f.edges.filter((e) => e.from === "par1")[0].id)).toEqual({ ok: false, reason: "분기에는 갈래가 2개 이상 있어야 한다" });
  });

  it("그 외 갈래는 지울 수 없고, 분기를 지우면 안쪽 노드까지 사라진다", () => {
    let f = ok(insertSplit(toEditFlow(null, ["R_A", "R_Z"]), "e2", "IF")); // r1 → if1 [e4 → r3(빈 단계) → r2] [e5 그 외 → r2] → r2(모이는 자리)
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    f = ok(updateEdge(f, cond.id, { cond: "true" }));
    f = valid(ok(insertRule(f, cond.id, "R_IN")));
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    expect(removeBranch(f, "if1", other.id)).toEqual({ ok: false, reason: '"그 외" 갈래는 지울 수 없다' });
    const g = valid(ok(removeNode(f, "if1")));
    expect(g.nodes.map((n) => n.id)).toEqual(["start", "r1", "r2", "end"]);
  });

  it("END 앞 선에 끼운 IF 는 「그 외」 가 끝내는 갈래라 갈래 1 에 넣은 노드는 IF 를 지워도 남는다(implicit-join F9)", () => {
    let f = ok(insertSplit(base, "e2", "IF"));
    const cond = f.edges.find((e) => e.from === "if1" && !e.otherwise)!;
    f = ok(updateEdge(f, cond.id, { cond: "true" }));
    f = valid(ok(insertRule(f, cond.id, "R_IN")));
    const other = f.edges.find((e) => e.from === "if1" && e.otherwise)!;
    expect(removeBranch(f, "if1", other.id)).toEqual({ ok: false, reason: '"그 외" 갈래는 지울 수 없다' });
    const g = valid(ok(removeNode(f, "if1")));
    expect(g.nodes.map((n) => n.id)).toEqual(["start", "r1", "r3", "r2", "end"]);
  });

  it("룰을 지우면 앞뒤 선을 잇고 view 흔적을 치운다", () => {
    let f = ok(insertRule(base, "e2", "R_B"));
    f = { ...f, view: { positions: { r2: { x: 1, y: 2 } }, notes: [{ id: "n1", text: "t", x: 0, y: 0, w: 100, h: 60, attach: "r2" }], groups: [{ id: "g1", title: "G", nodeIds: ["r2"] }] } };
    const g = valid(ok(removeNode(f, "r2")));
    expect(g.view.positions).toEqual({});
    expect(g.view.notes[0].attach).toBeNull();
    expect(g.view.groups).toEqual([]);
    expect(removeNode(g, "start")).toEqual({ ok: false, reason: "시작 노드는 지울 수 없다" });
  });

  it("nextId 는 노드·선·메모·그룹 어디에도 없는 가장 작은 번호다", () => {
    const { flow } = addNote(base, { x: 0, y: 0 }, null);
    expect(flow.view.notes[0].id).toBe("n1");
    expect(nextId(flow, "n")).toBe("n2");
    expect(nextId(flow, "e")).toBe("e3");
  });

  it("같은 선을 두 번 잇지 않고, START·END 는 그룹에 넣지 않는다", () => {
    expect(connect(base, "start", "r1")).toEqual({ ok: false, reason: "이미 이어진 선이다" });
    const r = addGroup(base, ["start", "r1", "end"], "묶음");
    expect(r.ok && r.flow.view.groups[0].nodeIds).toEqual(["r1"]);
  });

  it("flowJsonOf 는 서버 정규 JSON 과 같은 키 순서다", () => {
    expect(flowJsonOf(base)).toBe(
      '{"version":1,"nodes":[{"id":"start","kind":"START","ruleId":null,"splitId":null,"label":null},' +
        '{"id":"r1","kind":"RULE","ruleId":"R_A","splitId":null,"label":null},{"id":"end","kind":"END","ruleId":null,"splitId":null,"label":null}],' +
        '"edges":[{"id":"e1","from":"start","to":"r1","order":null,"cond":null,"otherwise":false,"label":null},' +
        '{"id":"e2","from":"r1","to":"end","order":null,"cond":null,"otherwise":false,"label":null}],' +
        '"view":{"positions":{},"notes":[],"groups":[],"routes":{},"labels":{}}}',
    );
  });

  it("입력 흐름을 바꾸지 않는다", () => {
    const before = flowJsonOf(base);
    insertSplit(base, "e1", "IF");
    removeNode(base, "r1");
    expect(flowJsonOf(base)).toBe(before);
  });

  it("toEditFlow 는 모양이 틀린 view 항목을 버린다", () => {
    const f = toEditFlow({ ...base, view: { positions: { r1: { x: "a", y: 1 }, end: { x: 3, y: 4 } }, notes: [{ id: 1 }], groups: "x" } } as never, []);
    expect(f.view).toEqual({ positions: { end: { x: 3, y: 4 } }, notes: [], groups: [], routes: {}, labels: {} });
  });
});

describe("flow-edit 보강", () => {
  const base = toEditFlow(null, ["R_A"]);

  it("MAX_NODES 는 서버 RuleSetFlowJson.MAX_NODES 와 같은 200 이다", () => {
    expect(MAX_NODES).toBe(200);
  });

  it("toEditFlow 는 빠진 칸을 null·false 로 채우고 모르는 칸을 버린다(1단계 carry)", () => {
    const raw = {
      nodes: [
        { id: "start", kind: "START" },
        { id: "r1", kind: "RULE", ruleId: "R_A", extra: 1 },
        { id: "end", kind: "END" },
      ],
      edges: [
        { id: "e1", from: "start", to: "r1" },
        { id: "e2", from: "r1", to: "end", otherwise: "true" },
      ],
    };
    const f = ok({ ok: true, flow: toEditFlow(raw as never, ["무시"]) });
    expect(f.version).toBe(1);
    expect(f.nodes[1]).toEqual({ id: "r1", kind: "RULE", ruleId: "R_A", splitId: null, label: null });
    expect(f.edges.map((e) => e.otherwise)).toEqual([false, false]);
    expect(f.edges[0]).toEqual({ id: "e1", from: "start", to: "r1", order: null, cond: null, otherwise: false, label: null });
    expect(flowJsonOf(f)).toBe(flowJsonOf(base));
  });

  it("flowJsonOf 는 view 항목도 고정 키 순서로 쓴다", () => {
    const f = toEditFlow(
      { ...base, view: { groups: [{ nodeIds: ["r1"], title: "G", id: "g1" }], notes: [{ attach: null, h: 2, w: 1, y: 0, x: 0, text: "t", id: "n1" }], positions: { r1: { y: 2, x: 1 } } } } as never,
      [],
    );
    expect(flowJsonOf(f)).toContain(
      '"view":{"positions":{"r1":{"x":1,"y":2}},"notes":[{"id":"n1","text":"t","x":0,"y":0,"w":1,"h":2,"attach":null}],"groups":[{"id":"g1","title":"G","nodeIds":["r1"]}],"routes":{},"labels":{}}',
    );
  });

  it("IF 에 갈래를 더하면 다음 순서로 그 외 갈래 앞에 들어간다", () => {
    let f = ok(insertSplit(base, "e2", "IF"));
    f = ok(addBranch(f, "if1"));
    const out = f.edges.filter((e) => e.from === "if1");
    expect(out.map((e) => [e.order, e.otherwise, e.label])).toEqual([[1, false, "갈래 1"], [2, false, "갈래 2"], [null, true, "그 외"]]);
    expect(moveBranch(f, "if1", out[1].id, 1)).toEqual({ ok: false, reason: "더 옮길 수 없다" });
    expect(moveBranch(f, "if1", out[0].id, -1)).toEqual({ ok: false, reason: "더 옮길 수 없다" });
  });

  it("분기 노드는 A 뒤에, 분기 label 은 조건·병렬이다", () => {
    const f = ok(insertSplit(base, "e1", "IF"));
    expect(f.nodes.map((n) => [n.id, n.kind, n.label])).toEqual([
      ["start", "START", null], ["if1", "IF", "조건"], ["r2", "TASK", "빈 단계"], ["r1", "RULE", null], ["end", "END", null],
    ]);
    const p = ok(insertSplit(base, "e2", "PARALLEL"));
    expect(p.nodes.find((n) => n.id === "par1")?.label).toBe("병렬");
    expect(p.edges.filter((e) => e.from === "par1").map((e) => [e.order, e.cond, e.otherwise])).toEqual([[1, null, false], [2, null, false]]);
  });

  it("끝·합류 노드와 선이 하나씩이 아닌 룰은 지우지 않는다", () => {
    expect(removeNode(base, "end")).toEqual({ ok: false, reason: "끝 노드는 지울 수 없다" });
    const f = ok(insertSplit(base, "e2", "PARALLEL"));
    expect(removeNode(f, "m1")).toEqual({ ok: false, reason: "합류 노드는 분기를 지워서 없앤다" });
    const g = ok(connect(base, "start", "end"));
    const h = ok(connect(g, "r1", "start"));
    expect(removeNode(h, "r1")).toEqual({ ok: false, reason: "룰 노드의 나가는 선이 하나가 아니라 지울 수 없다. 선을 먼저 정리한다" });
  });

  it("짝 합류가 없는 분기는 지우지도 갈래를 더하지도 않는다", () => {
    const f = ok(insertSplit(base, "e2", "PARALLEL"));
    const broken: EditFlow = { ...f, nodes: f.nodes.map((n) => (n.kind === "MERGE" ? { ...n, splitId: null } : n)) };
    expect(removeNode(broken, "par1")).toEqual({ ok: false, reason: "분기 par1의 짝 합류를 찾지 못해 지울 수 없다" });
    expect(addBranch(broken, "par1")).toEqual({ ok: false, reason: "분기 par1의 짝 합류를 찾지 못했다" });
  });

  it("중첩 분기를 지우면 안쪽 분기·합류까지 사라진다", () => {
    let f = ok(insertSplit(base, "e2", "PARALLEL"));
    const first = f.edges.find((e) => e.from === "par1" && e.order === 1)!;
    f = valid(ok(insertSplit(f, first.id, "PARALLEL")));
    expect(f.nodes.map((n) => n.id)).toEqual(["start", "r1", "par1", "par2", "m2", "m1", "end"]);
    const g = valid(ok(removeNode(f, "par1")));
    expect(g.nodes.map((n) => n.id)).toEqual(["start", "r1", "end"]);
    expect(g.edges.map((e) => [e.id, e.from, e.to])).toEqual([["e1", "start", "r1"], ["e2", "r1", "end"]]);
  });

  it("갈래를 지우면 갈래 안 노드와 선도 사라진다", () => {
    let f = ok(insertSplit(base, "e2", "PARALLEL"));
    const second = f.edges.find((e) => e.from === "par1" && e.order === 2)!;
    f = valid(ok(insertRule(f, second.id, "R_B")));
    f = valid(ok(addBranch(f, "par1")));
    const g = valid(ok(removeBranch(f, "par1", second.id)));
    expect(g.nodes.some((n) => n.ruleId === "R_B")).toBe(false);
    expect(g.edges.some((e) => e.id === second.id)).toBe(false);
  });

  it("updateEdge 는 준 칸만, updateNodeLabel 은 label 만 바꾼다", () => {
    const f = ok(insertSplit(base, "e2", "IF"));
    const e = f.edges.find((x) => x.from === "if1" && !x.otherwise)!;
    const g = ok(updateEdge(f, e.id, { label: "큰 값" }));
    expect(g.edges.find((x) => x.id === e.id)).toEqual({ ...e, label: "큰 값" });
    const h = ok(updateEdge(g, e.id, { cond: "  " }));
    expect(h.edges.find((x) => x.id === e.id)?.cond).toBe("  ");
    const k = ok(updateNodeLabel(base, "r1", "첫 룰"));
    expect(k.nodes[1]).toEqual({ id: "r1", kind: "RULE", ruleId: "R_A", splitId: null, label: "첫 룰" });
    expect(updateEdge(base, "없음", { label: "x" }).ok).toBe(false);
    expect(updateNodeLabel(base, "없음", "x").ok).toBe(false);
  });

  it("connect 는 빈 칸 선을 끝에 더하고 removeEdge 는 선을 뺀다", () => {
    const f = ok(connect(base, "start", "end"));
    expect(f.edges[2]).toEqual({ id: "e3", from: "start", to: "end", order: null, cond: null, otherwise: false, label: null });
    const g = ok(removeEdge(f, "e3"));
    expect(flowJsonOf(g)).toBe(flowJsonOf(base));
    expect(removeEdge(base, "없음").ok).toBe(false);
    expect(connect(base, "start", "없음").ok).toBe(false);
  });

  it("setPositions 는 병합하고, 메모·그룹을 고치고 지운다", () => {
    const f = setPositions(setPositions(base, { r1: { x: 1, y: 1 } }), { end: { x: 2, y: 2 } });
    expect(f.view.positions).toEqual({ r1: { x: 1, y: 1 }, end: { x: 2, y: 2 } });
    expect(base.view.positions).toEqual({});
    const { flow, id } = addNote(f, { x: 5, y: 6 }, "r1");
    expect(flow.view.notes[0]).toMatchObject({ id, text: "", x: 5, y: 6, attach: "r1" });
    const n = updateNote(flow, id, { text: "메모" });
    expect(n.view.notes[0].text).toBe("메모");
    expect(updateNote(n, id, { text: undefined, attach: undefined }).view.notes[0]).toMatchObject({ text: "메모", attach: "r1" });
    expect(removeNote(n, id).view.notes).toEqual([]);
    const r = addGroup(n, ["r1"], "G");
    if (!r.ok) throw new Error(r.reason);
    expect(r.id).toBe("g1");
    const u = updateGroup(r.flow, "g1", { title: "H", nodeIds: ["start", "r1", "없음"] });
    expect(u.view.groups).toEqual([{ id: "g1", title: "H", nodeIds: ["r1"] }]);
    expect(removeGroup(u, "g1").view.groups).toEqual([]);
    expect(addGroup(base, ["start", "end"], "빈")).toEqual({ ok: false, reason: "그룹에 넣을 노드를 고른다" });
  });
  it("뒤 선으로 앞쪽 노드에 닿는 분기는 지우지 않는다(리뷰 Important 1 사례 A)", () => {
    // r1 → if1 [e4 → r3(빈 단계) → r2] [e5 그 외 → r2] → r2 → end, 갈래 안 r3 에서 IF 앞 r1 로 뒤 선
    let f = ok(insertSplit(toEditFlow(null, ["R_A", "R_Z"]), "e2", "IF"));
    f = ok(connect(f, "r3", "r1"));
    const before = flowJsonOf(f);
    expect(removeNode(f, "if1")).toEqual({ ok: false, reason: "분기 if1의 갈래가 모이는 자리를 찾지 못해 지울 수 없다" });
    expect(flowJsonOf(f)).toBe(before);
  });

  it("뒤 선으로 분기 자신에 닿는 갈래는 지우지 않는다(리뷰 Important 1 사례 B)", () => {
    let f = ok(insertSplit(base, "e2", "PARALLEL"));
    f = ok(insertRule(f, "e3", "R_B"));
    f = ok(addBranch(f, "par1"));
    f = ok(connect(f, "r2", "par1"));
    expect(removeBranch(f, "par1", "e3")).toEqual({ ok: false, reason: "분기 par1의 짝 합류를 찾지 못해 지울 수 없다" });
  });

  it("블록 밖에서 안쪽 노드나 합류로 들어오는 선이 있으면 분기를 지우지 않는다", () => {
    // r1 → if1 [e4 → r3(빈 단계) → r2] [e5 그 외 → r2] → r2(모이는 자리) → end
    const f = ok(insertSplit(toEditFlow(null, ["R_A", "R_Z"]), "e2", "IF"));
    expect(removeNode(ok(connect(f, "start", "r3")), "if1")).toEqual({ ok: false, reason: "분기 if1의 갈래가 모이는 자리를 찾지 못해 지울 수 없다" });
    // 새 IF 의 모이는 자리는 블록 밖에서도 선을 받는다(implicit-join §8.1)
    expect(removeNode(ok(connect(f, "start", "r2")), "if1").ok).toBe(true);
    const p = ok(addBranch(ok(insertRule(ok(insertSplit(base, "e2", "PARALLEL")), "e3", "R_B")), "par1"));
    const other = p.edges.find((e) => e.from === "par1" && e.order === 2)!;
    const crossed = { ...p, edges: p.edges.map((e) => (e.id === other.id ? { ...e, to: "r2" } : e)) };
    expect(removeBranch(crossed, "par1", "e3")).toEqual({ ok: false, reason: "분기 par1의 짝 합류를 찾지 못해 지울 수 없다" });
  });
});
