// 계획 C2·C3 — 흐름 구조 해석 `flow-model.ts`(엔진 FlowParser·FlowTree 의 TS 짝). 문구·순서의 서버 동치 전체는 `rule-set-corpus.test.ts` 가 본다.
import { describe, expect, it } from "vitest";

import type { FlowEdge, FlowNode, FlowNodeKind, RuleSetFlow } from "../../../src/contract/engine-contract.generated";
import { flowRuleIds, linearFlow, parseFlow, type FlowIssue } from "../../../pages/dme/ruleSetEdit/flow-model";

const node = (id: string, kind: FlowNodeKind, over: Partial<FlowNode> = {}): FlowNode => ({
  id,
  kind,
  ruleId: null,
  splitId: null,
  label: null,
  ...over,
});
const edge = (id: string, from: string, to: string, over: Partial<FlowEdge> = {}): FlowEdge => ({
  id,
  from,
  to,
  order: null,
  cond: null,
  otherwise: false,
  label: null,
  ...over,
});
const flow = (nodes: FlowNode[], edges: FlowEdge[]): RuleSetFlow => ({ version: 1, nodes, edges });
const S = (nodeId: string | null, message: string, edgeId: string | null = null): FlowIssue => ({ code: "FLOW_STRUCTURE", nodeId, edgeId, message });
const E = (nodeId: string | null, message: string, edgeId: string | null = null): FlowIssue => ({ code: "FLOW_IF_ELSE", nodeId, edgeId, message });

/** start → if1 ─e2(1, A = 1)→ r1 ─┐, if1 ─e3(그 외)→ r2 ─┤ m1 → end */
function ifNodes(): FlowNode[] {
  return [
    node("start", "START"),
    node("if1", "IF"),
    node("r1", "RULE", { ruleId: "R1" }),
    node("r2", "RULE", { ruleId: "R2" }),
    node("m1", "MERGE", { splitId: "if1" }),
    node("end", "END"),
  ];
}
function ifEdges(): FlowEdge[] {
  return [
    edge("e1", "start", "if1"),
    edge("e2", "if1", "r1", { order: 1, cond: "A = 1" }),
    edge("e3", "if1", "r2", { otherwise: true }),
    edge("e4", "r1", "m1"),
    edge("e5", "r2", "m1"),
    edge("e6", "m1", "end"),
  ];
}
/** start → p1 ─e2(1)→ r1 ─┐, p1 ─e3(2)→ r2 ─┤ m1 → end */
function parNodes(): FlowNode[] {
  return [
    node("start", "START"),
    node("p1", "PARALLEL"),
    node("r1", "RULE", { ruleId: "R1" }),
    node("r2", "RULE", { ruleId: "R2" }),
    node("m1", "MERGE", { splitId: "p1" }),
    node("end", "END"),
  ];
}
function parEdges(): FlowEdge[] {
  return [
    edge("e1", "start", "p1"),
    edge("e2", "p1", "r1", { order: 1 }),
    edge("e3", "p1", "r2", { order: 2 }),
    edge("e4", "r1", "m1"),
    edge("e5", "r2", "m1"),
    edge("e6", "m1", "end"),
  ];
}
const withEdge = (edges: FlowEdge[], id: string, over: Partial<FlowEdge>) => edges.map((e) => (e.id === id ? { ...e, ...over } : e));
const withNode = (nodes: FlowNode[], id: string, over: Partial<FlowNode>) => nodes.map((n) => (n.id === id ? { ...n, ...over } : n));

describe("parseFlow — 정상 흐름과 블록 트리", () => {
  it("IF 흐름은 갈래 두 개짜리 Split 하나이고 그 외 갈래가 마지막이다", () => {
    const p = parseFlow(flow(ifNodes(), ifEdges()));
    expect(p.issues).toEqual([]);
    expect(p.tree!.root).toEqual({
      type: "SEQ",
      items: [
        {
          type: "SPLIT",
          nodeId: "if1",
          kind: "IF",
          mergeId: "m1",
          branches: [
            { edgeId: "e2", cond: "A = 1", otherwise: false, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r1", ruleId: "R1" }] } },
            { edgeId: "e3", cond: null, otherwise: true, label: null, body: { type: "SEQ", items: [{ type: "RULE", nodeId: "r2", ruleId: "R2" }] } },
          ],
        },
      ],
    });
    expect(p.tree!.ruleIds()).toEqual(["R1", "R2"]);
    expect(p.tree!.branched()).toBe(true);
  });

  it("IF 갈래는 order 오름차순 뒤 그 외 순서다(선 배열 순서와 무관)", () => {
    const nodes = [...ifNodes(), node("r3", "RULE", { ruleId: "R3" })];
    const edges = [
      edge("e1", "start", "if1"),
      edge("e3", "if1", "r2", { otherwise: true }),
      edge("e2", "if1", "r1", { order: 2, cond: "A = 2" }),
      edge("e7", "if1", "r3", { order: 1, cond: "A = 1" }),
      edge("e4", "r1", "m1"),
      edge("e5", "r2", "m1"),
      edge("e8", "r3", "m1"),
      edge("e6", "m1", "end"),
    ];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type === "SPLIT" && split.branches.map((b) => b.edgeId)).toEqual(["e7", "e2", "e3"]);
    expect(p.tree!.ruleIds()).toEqual(["R3", "R1", "R2"]);
  });

  it("빈 갈래(분기에서 합류로 바로)는 빈 Seq 이고 정상이다 — 그 외 빈 갈래 포함", () => {
    const nodes = ifNodes().filter((n) => n.id !== "r2");
    const edges = [edge("e1", "start", "if1"), edge("e2", "if1", "r1", { order: 1, cond: "A = 1" }), edge("e3", "if1", "m1", { otherwise: true }), edge("e4", "r1", "m1"), edge("e6", "m1", "end")];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([]);
    const split = p.tree!.root.items[0];
    expect(split.type === "SPLIT" && split.branches[1].body).toEqual({ type: "SEQ", items: [] });
  });

  it("같은 룰이 두 갈래에 있으면 ruleIds 는 중복 없이 한 번, ruleSteps 는 노드마다", () => {
    const nodes = withNode(ifNodes(), "r2", { ruleId: "R1" });
    const p = parseFlow(flow(nodes, ifEdges()));
    expect(p.tree!.ruleIds()).toEqual(["R1"]);
    expect(p.tree!.ruleSteps().map((s) => s.nodeId)).toEqual(["r1", "r2"]);
  });

  it("분기가 없으면 branched=false", () => {
    expect(parseFlow(linearFlow(["A", "B"])).tree!.branched()).toBe(false);
  });
});

describe("parseFlow — 1단계 구조 오류(C3, 모두 모은다)", () => {
  it("a 노드 ID 가 겹친다 — 뒤 노드만 보고하고 첫 노드로 계속 본다", () => {
    const p = parseFlow(flow([...ifNodes(), node("r1", "RULE", { ruleId: "R9" })], ifEdges()));
    expect(p.tree).toBeNull();
    expect(p.issues).toEqual([S("r1", "노드 ID r1가 겹친다")]);
  });

  it("b1 시작 노드가 없으면 개수 오류 다음에 차수 오류", () => {
    const p = parseFlow(flow(ifNodes().filter((n) => n.id !== "start"), ifEdges().filter((e) => e.id !== "e1")));
    expect(p.issues).toEqual([S(null, "시작 노드가 0개다. 정확히 1개여야 한다"), S("if1", "if1의 들어오는 선이 0개다. 1개여야 한다")]);
  });

  it("b2 끝 노드가 둘이다", () => {
    const p = parseFlow(flow([...ifNodes(), node("end2", "END")], ifEdges()));
    expect(p.issues).toEqual([S(null, "끝 노드가 2개다. 정확히 1개여야 한다"), S("end2", "end2의 들어오는 선이 0개다. 1개여야 한다")]);
  });

  it("c 없는 노드를 가리키는 선은 차수 계산에서 빠진다", () => {
    const p = parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e6", { to: "nowhere" })));
    expect(p.issues).toEqual([
      S("nowhere", "선 e6가 없는 노드 nowhere를 가리킨다", "e6"),
      S("m1", "m1의 나가는 선이 0개다. 1개여야 한다"),
      S("end", "end의 들어오는 선이 0개다. 1개여야 한다"),
    ]);
  });

  it("d1·d2 차수 — 노드 배열 순서로 나간다·들어온다", () => {
    const p = parseFlow(flow(ifNodes(), [...ifEdges(), edge("e7", "r1", "r2")]));
    expect(p.issues).toEqual([S("r1", "r1의 나가는 선이 2개다. 1개여야 한다"), S("r2", "r2의 들어오는 선이 2개다. 1개여야 한다")]);
  });

  it("d 분기의 나가는 선이 하나면 2개 이상이어야 한다", () => {
    const nodes = ifNodes().filter((n) => n.id !== "r2");
    const edges = [edge("e1", "start", "if1"), edge("e3", "if1", "r1", { otherwise: true }), edge("e4", "r1", "m1"), edge("e6", "m1", "end")];
    const p = parseFlow(flow(nodes, edges));
    expect(p.issues).toEqual([S("if1", "if1의 나가는 선이 1개다. 2개 이상이어야 한다"), S("m1", "m1의 들어오는 선이 1개다. 2개 이상이어야 한다")]);
  });

  it("e 룰 노드에 룰 ID 가 없다", () => {
    const p = parseFlow(flow(withNode(ifNodes(), "r1", { ruleId: " " }), ifEdges()));
    expect(p.issues).toEqual([S("r1", "룰 노드 r1에 룰 ID가 없다")]);
  });

  it("f1·f2 합류의 짝 분기가 없으면 그 분기를 닫는 합류도 0개다", () => {
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: "zz" }), ifEdges())).issues).toEqual([
      S("m1", "합류 m1의 짝 분기 zz가 없다"),
      S("if1", "분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"),
    ]);
    expect(parseFlow(flow(withNode(ifNodes(), "m1", { splitId: null }), ifEdges())).issues).toEqual([
      S("m1", "합류 m1의 짝 분기 -가 없다"),
      S("if1", "분기 if1를 닫는 합류가 0개다. 정확히 1개여야 한다"),
    ]);
  });

  it("g1·g2·g4 그 외 갈래가 없으면 IF_ELSE 둘 다음 순서 없음", () => {
    const p = parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e3", { otherwise: false })));
    expect(p.issues).toEqual([
      E("if1", 'IF if1에 "그 외" 갈래가 0개다. 정확히 1개여야 한다'),
      E("if1", "IF if1의 갈래 e3에 조건식이 없다", "e3"),
      S("if1", "분기 if1의 갈래 e3에 순서가 없다", "e3"),
    ]);
  });

  it("g2 조건식이 공백이다", () => {
    expect(parseFlow(flow(ifNodes(), withEdge(ifEdges(), "e2", { cond: "  " }))).issues).toEqual([E("if1", "IF if1의 갈래 e2에 조건식이 없다", "e2")]);
  });

  it("g3 병렬 갈래에는 조건·그 외를 둘 수 없다", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { cond: "A = 1" }))).issues).toEqual([
      S("p1", "병렬 분기 p1의 갈래 e3에는 조건을 둘 수 없다", "e3"),
    ]);
  });

  it("g4 병렬 갈래 순서가 없다", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { order: null }))).issues).toEqual([S("p1", "분기 p1의 갈래 e3에 순서가 없다", "e3")]);
  });

  it("g5 갈래 순서가 겹친다 — 두 번째 선부터", () => {
    expect(parseFlow(flow(parNodes(), withEdge(parEdges(), "e3", { order: 1 }))).issues).toEqual([S("p1", "분기 p1의 갈래 순서 1가 겹친다", "e3")]);
  });
});

describe("parseFlow — 2단계 구조 오류(첫 오류에서 멈춤)", () => {
  it("갈래가 짝 합류가 아닌 다른 합류로 나간다", () => {
    // if1 의 e2 갈래 안에 if2 가 있고, if2 의 첫 갈래(r1)가 m2 가 아닌 m1 로 간다. 차수는 모두 맞다.
    const nodes = [
      node("start", "START"),
      node("if1", "IF"),
      node("if2", "IF"),
      node("r1", "RULE", { ruleId: "R1" }),
      node("r2", "RULE", { ruleId: "R2" }),
      node("r3", "RULE", { ruleId: "R3" }),
      node("m2", "MERGE", { splitId: "if2" }),
      node("m1", "MERGE", { splitId: "if1" }),
      node("end", "END"),
    ];
    const edges = [
      edge("e1", "start", "if1"),
      edge("e2", "if1", "if2", { order: 1, cond: "A = 1" }),
      edge("e3", "if1", "r3", { otherwise: true }),
      edge("e5", "if2", "r1", { order: 1, cond: "B = 1" }),
      edge("e6", "if2", "r2", { otherwise: true }),
      edge("e7", "r1", "m1"),
      edge("e8", "r2", "m2"),
      edge("e9", "r3", "m2"),
      edge("e10", "m2", "m1"),
      edge("e11", "m1", "end"),
    ];
    const p = parseFlow(flow(nodes, edges));
    expect(p.tree).toBeNull();
    expect(p.issues).toEqual([S("m1", "갈래가 m2에서 닫히지 않고 m1로 나간다")]);
  });

  it("시작에서 닿지 않는 노드(섬 순환)는 도달할 수 없다", () => {
    const nodes = [node("start", "START"), node("r1", "RULE", { ruleId: "R1" }), node("end", "END"), node("r2", "RULE", { ruleId: "R2" }), node("r3", "RULE", { ruleId: "R3" })];
    const edges = [edge("e1", "start", "r1"), edge("e2", "r1", "end"), edge("e3", "r2", "r3"), edge("e4", "r3", "r2")];
    expect(parseFlow(flow(nodes, edges)).issues).toEqual([S("r2", "r2에 도달할 수 없다")]);
  });
});

describe("FlowTree.relation — 같은 경로·IF 형제·병렬 형제", () => {
  // start → r0 → if1 { e2(1): p1 { ea(1): ra, eb(2): rb } mp ; e3(그 외): rc } m1 → rz → end
  const nodes = [
    node("start", "START"),
    node("r0", "RULE", { ruleId: "R0" }),
    node("if1", "IF"),
    node("p1", "PARALLEL"),
    node("ra", "RULE", { ruleId: "RA" }),
    node("rb", "RULE", { ruleId: "RB" }),
    node("mp", "MERGE", { splitId: "p1" }),
    node("rc", "RULE", { ruleId: "RC" }),
    node("m1", "MERGE", { splitId: "if1" }),
    node("rz", "RULE", { ruleId: "RZ" }),
    node("end", "END"),
  ];
  const edges = [
    edge("e1", "start", "r0"),
    edge("e1b", "r0", "if1"),
    edge("e2", "if1", "p1", { order: 1, cond: "X = 1" }),
    edge("e3", "if1", "rc", { otherwise: true }),
    edge("ea", "p1", "ra", { order: 1 }),
    edge("eb", "p1", "rb", { order: 2 }),
    edge("ea2", "ra", "mp"),
    edge("eb2", "rb", "mp"),
    edge("emp", "mp", "m1"),
    edge("ec", "rc", "m1"),
    edge("em1", "m1", "rz"),
    edge("ez", "rz", "end"),
  ];
  const tree = parseFlow(flow(nodes, edges)).tree!;

  it("깊이 우선 순서는 R0, RA, RB, RC, RZ 다", () => {
    expect(tree.ruleSteps().map((s) => s.ruleId)).toEqual(["R0", "RA", "RB", "RC", "RZ"]);
  });

  it.each([
    ["ra", "ra", "SAME"],
    ["r0", "ra", "BEFORE"],
    ["rz", "r0", "AFTER"],
    ["ra", "rb", "PARALLEL"],
    ["rb", "ra", "PARALLEL"],
    ["ra", "rc", "EXCLUSIVE"],
    ["rc", "rz", "BEFORE"],
    ["p1", "ra", "BEFORE"],
    ["if1", "rz", "BEFORE"],
    ["p1", "rc", "EXCLUSIVE"],
  ] as const)("relation(%s, %s) = %s", (a, b, want) => {
    expect(tree.relation(a, b)).toBe(want);
  });

  it("흐름에 없는 노드면 예외", () => {
    expect(() => tree.relation("ra", "nope")).toThrow("흐름 트리에 없는 노드: nope");
  });
});

describe("linearFlow·flowRuleIds", () => {
  it("한 줄 흐름의 노드·선 ID 는 start, r1..rN, end / e1..e(N+1) 이다", () => {
    expect(linearFlow(["A", "B"])).toEqual({
      version: 1,
      nodes: [node("start", "START"), node("r1", "RULE", { ruleId: "A" }), node("r2", "RULE", { ruleId: "B" }), node("end", "END")],
      edges: [edge("e1", "start", "r1"), edge("e2", "r1", "r2"), edge("e3", "r2", "end")],
    });
    expect(linearFlow([])).toEqual({ version: 1, nodes: [node("start", "START"), node("end", "END")], edges: [edge("e1", "start", "end")] });
  });

  it("구조 오류가 있으면 RULE 노드의 룰 ID 를 노드 배열 순서로 중복 없이", () => {
    const nodes = [...withNode(ifNodes(), "r2", { ruleId: "R1" }), node("rx", "RULE", { ruleId: "RX" })];
    expect(flowRuleIds(flow(nodes, ifEdges()))).toEqual(["R1", "RX"]);
  });
});
